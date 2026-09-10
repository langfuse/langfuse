import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createNewRedisInstance,
  recordIncrement,
  redis,
} from "@langfuse/shared/src/server";
import { env } from "../env";
import {
  closeTraceActivityMap,
  recordTraceActivity,
} from "../features/traces/traceActivityMap";

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    ...actual,
    createNewRedisInstance: vi.fn(actual.createNewRedisInstance),
    recordIncrement: vi.fn(),
  };
});

describe("OTel trace activity map", () => {
  const originalFlag = env.LANGFUSE_OTEL_TRACE_ACTIVITY_MAP_ENABLED;
  const originalSamplePercent =
    env.LANGFUSE_OTEL_TRACE_ACTIVITY_MAP_SAMPLE_PERCENT;
  let projectId: string;
  let keys: string[];

  const key = (traceId: string, project = projectId) => {
    const value = `langfuse:otel:activity:{${project}}:${traceId}`;
    keys.push(value);
    return value;
  };

  beforeEach(async () => {
    if (!redis)
      throw new Error("Redis must be configured for integration tests");
    await redis.ping();
    projectId = randomUUID();
    keys = [];
    env.LANGFUSE_OTEL_TRACE_ACTIVITY_MAP_ENABLED = "true";
    env.LANGFUSE_OTEL_TRACE_ACTIVITY_MAP_SAMPLE_PERCENT = 100;
    vi.mocked(recordIncrement).mockClear();
  });

  afterEach(async () => {
    closeTraceActivityMap();
    vi.useRealTimers();
    vi.restoreAllMocks();
    env.LANGFUSE_OTEL_TRACE_ACTIVITY_MAP_ENABLED = originalFlag;
    env.LANGFUSE_OTEL_TRACE_ACTIVITY_MAP_SAMPLE_PERCENT = originalSamplePercent;
    // Delete only keys owned by this test, one at a time for cluster support.
    for (const ownedKey of new Set(keys)) await redis?.del(ownedKey);
  });

  it("atomically preserves first arrival under concurrency, batches distinct traces, and isolates projects", async () => {
    const traceId = randomUUID();
    const traceKey = key(traceId);
    const firstSeen = await Promise.all(
      Array.from({ length: 20 }, async () => {
        await recordTraceActivity(projectId, [traceId]);
        return redis!.hget(traceKey, "first_seen");
      }),
    );
    expect(firstSeen[0]).not.toBeNull();
    expect(new Set(firstSeen).size).toBe(1);

    // Pin an existing timestamp to prove later arrivals don't reinitialize it.
    await redis!.hset(traceKey, "first_seen", "1", "last_seen", "2");
    const otherTraces = Array.from({ length: 101 }, () => randomUUID());
    otherTraces.forEach((id) => key(id));
    await recordTraceActivity(projectId, [traceId, traceId, ...otherTraces]);
    const activity = await redis!.hgetall(traceKey);
    expect(activity.first_seen).toBe("1");
    expect(Number(activity.last_seen)).toBeGreaterThan(2);
    expect(await redis!.exists(key(otherTraces[100]))).toBe(1);

    const otherProject = randomUUID();
    const otherKey = key(traceId, otherProject);
    await recordTraceActivity(otherProject, [traceId]);
    expect(Number(await redis!.hget(otherKey, "first_seen"))).toBeGreaterThan(
      1,
    );
    expect(await redis!.hget(traceKey, "first_seen")).toBe("1");
  });

  it("refreshes the two-hour TTL and starts a new activity window after expiry", async () => {
    const traceId = randomUUID();
    const traceKey = key(traceId);
    await recordTraceActivity(projectId, [traceId]);
    expect(await redis!.ttl(traceKey)).toBeGreaterThan(7190);

    await redis!.hset(traceKey, "first_seen", "1");
    await redis!.expire(traceKey, 60);
    await recordTraceActivity(projectId, [traceId]);
    expect(await redis!.ttl(traceKey)).toBeGreaterThan(7190);
    expect(await redis!.hget(traceKey, "first_seen")).toBe("1");

    await redis!.pexpireat(traceKey, 1);
    expect(await redis!.exists(traceKey)).toBe(0);
    await recordTraceActivity(projectId, [traceId]);
    const activity = await redis!.hgetall(traceKey);
    expect(Number(activity.first_seen)).toBeGreaterThan(1);
    expect(activity.first_seen).toBe(activity.last_seen);
    expect(await redis!.ttl(traceKey)).toBeGreaterThan(7190);
  });

  it("does no Redis work when disabled and does not propagate write failures", async () => {
    const traceId = randomUUID();
    const traceKey = key(traceId);
    vi.mocked(createNewRedisInstance).mockReturnValueOnce(redis);
    // Keep the assertion client connected when the map closes its test client.
    vi.spyOn(redis!, "disconnect").mockImplementation(() => {});
    const evalSpy = vi.spyOn(redis!, "eval");
    env.LANGFUSE_OTEL_TRACE_ACTIVITY_MAP_ENABLED = "false";
    await recordTraceActivity(projectId, [traceId]);
    expect(evalSpy).not.toHaveBeenCalled();
    expect(await redis!.exists(traceKey)).toBe(0);

    env.LANGFUSE_OTEL_TRACE_ACTIVITY_MAP_ENABLED = "true";
    evalSpy.mockRejectedValueOnce(new Error("Redis unavailable"));
    await expect(
      recordTraceActivity(projectId, [traceId]),
    ).resolves.toBeUndefined();
    expect(await redis!.exists(traceKey)).toBe(0);
  });

  it("selects stable trace samples across batches and expands them when the percentage increases", async () => {
    vi.mocked(createNewRedisInstance).mockReturnValueOnce(redis);
    vi.spyOn(redis!, "disconnect").mockImplementation(() => {});
    const evalSpy = vi.spyOn(redis!, "eval").mockResolvedValue(1);
    const traceIds = Array.from({ length: 1000 }, (_, i) => `trace-${i}`);
    const sampledIds = async (
      project: string,
      percent: number,
      ids = traceIds,
    ) => {
      evalSpy.mockClear();
      env.LANGFUSE_OTEL_TRACE_ACTIVITY_MAP_SAMPLE_PERCENT = percent;
      await recordTraceActivity(project, ids);
      const prefix = `langfuse:otel:activity:{${project}}:`;
      return evalSpy.mock.calls
        .flatMap((call) =>
          call.slice(2).map((value) => String(value).slice(prefix.length)),
        )
        .sort();
    };

    const tenPercent = await sampledIds("sampling-project", 10);
    expect(tenPercent.length).toBeGreaterThan(50);
    expect(tenPercent.length).toBeLessThan(150);
    expect(
      await sampledIds("sampling-project", 10, [...traceIds].reverse()),
    ).toEqual(tenPercent);
    // Splitting the batch or repeating observations must not change selection.
    const splitSample = [
      ...(await sampledIds("sampling-project", 10, traceIds.slice(0, 500))),
      ...(await sampledIds("sampling-project", 10, traceIds.slice(500))),
    ].sort();
    expect(splitSample).toEqual(tenPercent);
    expect(
      await sampledIds("sampling-project", 10, [...traceIds, ...traceIds]),
    ).toEqual(tenPercent);

    const fiftyPercent = await sampledIds("sampling-project", 50);
    expect(fiftyPercent.length).toBeGreaterThan(400);
    expect(fiftyPercent.length).toBeLessThan(600);
    expect(tenPercent.every((id) => fiftyPercent.includes(id))).toBe(true);
    expect(await sampledIds("sampling-project", 10)).toEqual(tenPercent);
    expect(await sampledIds("other-sampling-project", 10)).not.toEqual(
      tenPercent,
    );
  });

  it("does no Redis work at zero percent and includes every distinct trace at 100 percent", async () => {
    vi.mocked(createNewRedisInstance).mockReturnValueOnce(redis);
    vi.spyOn(redis!, "disconnect").mockImplementation(() => {});
    const evalSpy = vi.spyOn(redis!, "eval").mockResolvedValue(1);
    vi.mocked(createNewRedisInstance).mockClear();
    env.LANGFUSE_OTEL_TRACE_ACTIVITY_MAP_SAMPLE_PERCENT = 0;
    await recordTraceActivity(projectId, ["trace-a", "trace-b"]);
    expect(evalSpy).not.toHaveBeenCalled();
    expect(createNewRedisInstance).not.toHaveBeenCalled();

    env.LANGFUSE_OTEL_TRACE_ACTIVITY_MAP_SAMPLE_PERCENT = 100;
    await recordTraceActivity(projectId, ["trace-a", "trace-b", "trace-a"]);
    expect(evalSpy.mock.calls.flatMap((call) => call.slice(2))).toEqual([
      `langfuse:otel:activity:{${projectId}}:trace-a`,
      `langfuse:otel:activity:{${projectId}}:trace-b`,
    ]);
  });

  it("writes the first batch on a fresh connection and distinguishes creation from repeated updates", async () => {
    const traceId = randomUUID();
    const traceKey = key(traceId);
    await recordTraceActivity(projectId, [traceId, traceId]);
    expect(await redis!.exists(traceKey)).toBe(1);
    await recordTraceActivity(projectId, [traceId]);
    const total = (name: string) =>
      vi
        .mocked(recordIncrement)
        .mock.calls.filter(
          ([metric]) =>
            metric === `langfuse.ingestion.otel.activity_map.${name}`,
        )
        .reduce((sum, [, value]) => sum + (value ?? 1), 0);
    expect(total("eligible_trace_updates")).toBe(2);
    expect(total("sampled_trace_updates")).toBe(2);
    expect(total("trace_updates")).toBe(2);
    expect(total("trace_creations")).toBe(1);
    expect(total("skipped_batches")).toBe(0);
  });

  it("bounds startup waiting and records a skipped batch if the connection never becomes ready", async () => {
    const actual = await vi.importActual<
      typeof import("@langfuse/shared/src/server")
    >("@langfuse/shared/src/server");
    const waitingClient = actual.createNewRedisInstance({ lazyConnect: true });
    if (!waitingClient) throw new Error("Redis must be configured");
    const readyListeners = waitingClient.listenerCount("ready");
    vi.mocked(createNewRedisInstance).mockReturnValueOnce(waitingClient);
    const evalSpy = vi.spyOn(waitingClient, "eval");
    vi.useFakeTimers();
    const write = recordTraceActivity(projectId, ["trace-startup-timeout"]);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(write).resolves.toBeUndefined();
    expect(evalSpy).not.toHaveBeenCalled();
    expect(waitingClient.listenerCount("ready")).toBe(readyListeners);
    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.ingestion.otel.activity_map.skipped_batches",
    );
    expect(recordIncrement).not.toHaveBeenCalledWith(
      "langfuse.ingestion.otel.activity_map.trace_updates",
      expect.any(Number),
    );
  });
});
