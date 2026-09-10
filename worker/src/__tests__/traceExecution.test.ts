import { randomUUID } from "node:crypto";
import { Queue, Worker } from "bullmq";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createNewRedisInstance,
  getObservationsForTraceFromEventsTable,
  getQueuePrefix,
  QueueName,
  redis,
  TraceExecutionQueue,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import { env } from "../env";
import {
  scheduleTraceExecution,
  traceExecutionId,
} from "../features/traces/traceExecution";
import { traceExecutionProcessor } from "../queues/traceExecutionQueue";

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/src/server")>()),
  getObservationsForTraceFromEventsTable: vi.fn(),
}));

describe("sampled trace observation reads", () => {
  const originalEnabled = env.LANGFUSE_OTEL_TRACE_EXECUTION_ENABLED;
  const originalSample = env.LANGFUSE_OTEL_TRACE_EXECUTION_SAMPLE_PERCENT;
  let connection: NonNullable<ReturnType<typeof createNewRedisInstance>>;
  let minimumRedis: NonNullable<typeof redis>;
  let queue: Queue<TQueueJobTypes[QueueName.TraceExecution]>;
  const minimumKeys = new Set<string>();

  function minimumKey(projectId: string, traceId: string) {
    const key = `trace-minimum:${traceExecutionId(projectId, traceId)}`;
    minimumKeys.add(key);
    return key;
  }

  beforeEach(async () => {
    env.LANGFUSE_OTEL_TRACE_EXECUTION_ENABLED = "true";
    env.LANGFUSE_OTEL_TRACE_EXECUTION_SAMPLE_PERCENT = 100;
    const queueRedis = createNewRedisInstance();
    if (!queueRedis || !redis)
      throw new Error("Redis is required for this integration test");
    connection = queueRedis;
    minimumRedis = redis;
    const name = `trace-execution-test-${randomUUID()}`;
    queue = new Queue(name, {
      connection,
      prefix: getQueuePrefix(name),
    });
    await queue.waitUntilReady();
    await connection.ping();
    vi.spyOn(TraceExecutionQueue, "getInstance").mockReturnValue(queue);
    vi.mocked(getObservationsForTraceFromEventsTable).mockReset();
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    env.LANGFUSE_OTEL_TRACE_EXECUTION_ENABLED = originalEnabled;
    env.LANGFUSE_OTEL_TRACE_EXECUTION_SAMPLE_PERCENT = originalSample;
    for (const key of minimumKeys) await minimumRedis.del(key);
    minimumKeys.clear();
    await queue.obliterate({ force: true });
    await queue.close();
    connection.disconnect();
  });

  it("atomically keeps the earliest start across batches, refreshes TTL, and debounces independently per project", async () => {
    const traceId = randomUUID();
    const projectId = randomUUID();
    const otherProjectId = randomUUID();
    const key = minimumKey(projectId, traceId);
    const otherKey = minimumKey(otherProjectId, traceId);
    const earliest = Date.parse("2026-09-10T10:00:00.000Z");
    await Promise.all(
      [30, 0, 20, 10].map((minutes) =>
        scheduleTraceExecution(projectId, [
          {
            traceId,
            startTimeISO: new Date(earliest + minutes * 60_000).toISOString(),
          },
          {
            traceId,
            startTimeISO: new Date(earliest + 60 * 60_000).toISOString(),
          },
        ]),
      ),
    );
    expect(await minimumRedis.zscore(key, "first_seen")).toBe(String(earliest));
    const [initialJob] = await queue.getDelayed();
    expect(initialJob).toBeDefined();
    expect(initialJob.data.payload.lastSeenStartTime).toBe(
      earliest + 60 * 60_000,
    );
    expect(initialJob.delay).toBe(600_000);
    await minimumRedis.expire(key, 1);
    const secondArrival = initialJob.timestamp + 60_000;
    vi.spyOn(Date, "now").mockReturnValue(secondArrival);
    await scheduleTraceExecution(projectId, [
      { traceId, startTimeISO: new Date(earliest + 60_000).toISOString() },
    ]);
    await scheduleTraceExecution(otherProjectId, [
      { traceId, startTimeISO: new Date(earliest + 120_000).toISOString() },
    ]);
    expect(await minimumRedis.zscore(key, "first_seen")).toBe(String(earliest));
    expect(await minimumRedis.ttl(key)).toBeGreaterThan(7100);
    expect(await minimumRedis.zscore(otherKey, "first_seen")).toBe(
      String(earliest + 120_000),
    );
    const delayed = await queue.getDelayed();
    expect(delayed).toHaveLength(2);
    const replacement = delayed.find(
      (job) => job.data.payload.projectId === projectId,
    )!;
    expect(replacement.id).not.toBe(initialJob.id);
    // Replacement carries this batch's maximum, even for out-of-order batches.
    expect(replacement.data.payload.lastSeenStartTime).toBe(earliest + 60_000);
    expect(replacement.opts.deduplication?.id).toBe(
      initialJob.opts.deduplication?.id,
    );
    expect(replacement.timestamp + replacement.delay).toBe(
      secondArrival + 600_000,
    );
    vi.mocked(Date.now).mockRestore();

    await minimumRedis.pexpire(key, 0);
    await scheduleTraceExecution(projectId, [
      { traceId, startTimeISO: new Date(earliest + 120_000).toISOString() },
    ]);
    expect(await minimumRedis.zscore(key, "first_seen")).toBe(
      String(earliest + 120_000),
    );
    expect(await minimumRedis.ttl(key)).toBeGreaterThan(7100);

    env.LANGFUSE_OTEL_TRACE_EXECUTION_SAMPLE_PERCENT = 0;
    const unsampledTraceId = randomUUID();
    await scheduleTraceExecution(projectId, [
      {
        traceId: unsampledTraceId,
        startTimeISO: new Date(earliest).toISOString(),
      },
    ]);
    expect(
      await minimumRedis.zscore(
        minimumKey(projectId, unsampledTraceId),
        "first_seen",
      ),
    ).toBeNull();
    expect(await queue.getDelayedCount()).toBe(2);
  });

  it("retains a fresh delayed job when another arrival follows activation and survives the older job completing", async () => {
    const projectId = randomUUID();
    const traceId = randomUUID();
    minimumKey(projectId, traceId);
    const event = { traceId, startTimeISO: "2026-09-10T10:00:00.000Z" };
    await scheduleTraceExecution(projectId, [event]);
    const [delayed] = await queue.getDelayed();
    // Simulate the delay and matching deduplication TTL having elapsed.
    await connection.del(
      queue.toKey(`de:${traceExecutionId(projectId, traceId)}`),
    );
    await delayed.promote();
    const worker = new Worker(queue.name, undefined, {
      connection,
      prefix: queue.opts.prefix,
      autorun: false,
    });
    try {
      const active = await worker.getNextJob("test-lock", { block: false });
      expect(active).toBeDefined();
      await scheduleTraceExecution(projectId, [event]);
      const [next] = await queue.getDelayed();
      expect(next).toBeDefined();
      expect(next.id).not.toBe(active!.id);
      await active!.moveToCompleted({}, "test-lock", false);
      expect(
        await queue.getDeduplicationJobId(traceExecutionId(projectId, traceId)),
      ).toBe(next.id);
      expect(await queue.getDelayedCount()).toBe(1);
    } finally {
      await worker.close();
    }
  });

  it("queries full fields with start-time bounds, omits an expired lower bound, honors gating, and propagates query failures", async () => {
    const projectId = randomUUID();
    const traceId = randomUUID();
    const key = minimumKey(projectId, traceId);
    const startTimeISO = "2026-09-10T10:00:00.000Z";
    const lastStartTimeISO = "2026-09-10T10:05:00.000Z";
    await scheduleTraceExecution(projectId, [
      { traceId, startTimeISO },
      { traceId, startTimeISO: lastStartTimeISO },
    ]);
    const [job] = await queue.getDelayed();
    vi.mocked(getObservationsForTraceFromEventsTable).mockResolvedValue({
      observations: [],
      totalCount: 1,
    });
    expect(await traceExecutionProcessor(job)).toEqual({
      observationCount: 0,
      hasMore: true,
    });
    expect(getObservationsForTraceFromEventsTable).toHaveBeenLastCalledWith({
      projectId,
      traceId,
      timestamp: new Date(startTimeISO),
      maxStartTime: new Date(lastStartTimeISO),
      selectIOAndMetadata: true,
      selectToolData: true,
    });
    await minimumRedis.del(key);
    await traceExecutionProcessor(job);
    expect(getObservationsForTraceFromEventsTable).toHaveBeenLastCalledWith(
      expect.objectContaining({
        timestamp: undefined,
        maxStartTime: new Date(lastStartTimeISO),
      }),
    );
    env.LANGFUSE_OTEL_TRACE_EXECUTION_ENABLED = "false";
    await traceExecutionProcessor(job);
    env.LANGFUSE_OTEL_TRACE_EXECUTION_ENABLED = "true";
    env.LANGFUSE_OTEL_TRACE_EXECUTION_SAMPLE_PERCENT = 0;
    await traceExecutionProcessor(job);
    expect(getObservationsForTraceFromEventsTable).toHaveBeenCalledTimes(2);
    env.LANGFUSE_OTEL_TRACE_EXECUTION_SAMPLE_PERCENT = 100;
    vi.mocked(getObservationsForTraceFromEventsTable).mockRejectedValueOnce(
      new Error("query failed"),
    );
    await expect(traceExecutionProcessor(job)).rejects.toThrow("query failed");
  });

  it("does not enqueue when a command inside the minimum transaction fails", async () => {
    const projectId = randomUUID();
    const traceId = randomUUID();
    await minimumRedis.set(
      minimumKey(projectId, traceId),
      "wrong-type",
      "EX",
      60,
    );
    const enqueue = vi.spyOn(queue, "addBulk");
    await expect(
      scheduleTraceExecution(projectId, [
        { traceId, startTimeISO: "2026-09-10T10:00:00.000Z" },
      ]),
    ).resolves.toBeUndefined();
    expect(enqueue).not.toHaveBeenCalled();
  });
});
