import { randomUUID } from "node:crypto";
import { Queue, Worker } from "bullmq";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createNewRedisInstance,
  getObservationsForTraceFromEventsTable,
  getQueuePrefix,
  QueueName,
  recordDistribution,
  TraceObservationReadQueue,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import { env } from "../env";
import {
  scheduleTraceObservationReads,
  traceObservationReadId,
} from "../features/traces/traceObservationRead";
import { traceObservationReadProcessor } from "../queues/traceObservationReadQueue";

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/src/server")>()),
  getObservationsForTraceFromEventsTable: vi.fn(),
  recordDistribution: vi.fn(),
}));

describe("sampled trace observation reads", () => {
  const originalEnabled = env.LANGFUSE_OTEL_TRACE_OBSERVATION_READ_ENABLED;
  const originalSample =
    env.LANGFUSE_OTEL_TRACE_OBSERVATION_READ_SAMPLE_PERCENT;
  let connection: NonNullable<ReturnType<typeof createNewRedisInstance>>;
  let queue: Queue<TQueueJobTypes[QueueName.TraceObservationRead]>;
  const minimumKeys = new Set<string>();

  function minimumKey(projectId: string, traceId: string) {
    const key = queue.toKey(
      `minimum:${traceObservationReadId(projectId, traceId)}`,
    );
    minimumKeys.add(key);
    return key;
  }

  beforeEach(async () => {
    env.LANGFUSE_OTEL_TRACE_OBSERVATION_READ_ENABLED = "true";
    env.LANGFUSE_OTEL_TRACE_OBSERVATION_READ_SAMPLE_PERCENT = 100;
    const redis = createNewRedisInstance();
    if (!redis) throw new Error("Redis is required for this integration test");
    connection = redis;
    const name = `trace-observation-read-test-${randomUUID()}`;
    queue = new Queue(name, {
      connection,
      prefix: getQueuePrefix(name),
    });
    await queue.waitUntilReady();
    await connection.ping();
    vi.spyOn(TraceObservationReadQueue, "getInstance").mockReturnValue(queue);
    vi.mocked(getObservationsForTraceFromEventsTable).mockReset();
    vi.mocked(recordDistribution).mockClear();
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    env.LANGFUSE_OTEL_TRACE_OBSERVATION_READ_ENABLED = originalEnabled;
    env.LANGFUSE_OTEL_TRACE_OBSERVATION_READ_SAMPLE_PERCENT = originalSample;
    for (const key of minimumKeys) await connection.del(key);
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
        scheduleTraceObservationReads(projectId, [
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
    expect(await connection.get(key)).toBe(String(earliest));
    const [initialJob] = await queue.getDelayed();
    expect(initialJob).toBeDefined();
    await connection.expire(key, 1);
    await scheduleTraceObservationReads(projectId, [
      { traceId, startTimeISO: new Date(earliest + 60_000).toISOString() },
    ]);
    await scheduleTraceObservationReads(otherProjectId, [
      { traceId, startTimeISO: new Date(earliest + 120_000).toISOString() },
    ]);
    expect(await connection.get(key)).toBe(String(earliest));
    expect(await connection.ttl(key)).toBeGreaterThan(7100);
    expect(await connection.get(otherKey)).toBe(String(earliest + 120_000));
    const delayed = await queue.getDelayed();
    expect(delayed).toHaveLength(2);
    const replacement = delayed.find(
      (job) => job.data.payload.projectId === projectId,
    )!;
    expect(replacement.id).not.toBe(initialJob.id);
    expect(replacement.timestamp + replacement.delay).toBeGreaterThanOrEqual(
      initialJob.timestamp + initialJob.delay,
    );

    env.LANGFUSE_OTEL_TRACE_OBSERVATION_READ_SAMPLE_PERCENT = 0;
    const unsampledTraceId = randomUUID();
    await scheduleTraceObservationReads(projectId, [
      {
        traceId: unsampledTraceId,
        startTimeISO: new Date(earliest).toISOString(),
      },
    ]);
    expect(
      await connection.get(minimumKey(projectId, unsampledTraceId)),
    ).toBeNull();
    expect(await queue.getDelayedCount()).toBe(2);
  });

  it("retains a fresh delayed job when another arrival follows activation and survives the older job completing", async () => {
    const projectId = randomUUID();
    const traceId = randomUUID();
    minimumKey(projectId, traceId);
    const event = { traceId, startTimeISO: "2026-09-10T10:00:00.000Z" };
    await scheduleTraceObservationReads(projectId, [event]);
    const [delayed] = await queue.getDelayed();
    // Simulate the delay and matching deduplication TTL having elapsed.
    await connection.del(
      queue.toKey(`de:${traceObservationReadId(projectId, traceId)}`),
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
      await scheduleTraceObservationReads(projectId, [event]);
      const [next] = await queue.getDelayed();
      expect(next).toBeDefined();
      expect(next.id).not.toBe(active!.id);
      await active!.moveToCompleted({}, "test-lock", false);
      expect(
        await queue.getDeduplicationJobId(
          traceObservationReadId(projectId, traceId),
        ),
      ).toBe(next.id);
      expect(await queue.getDelayedCount()).toBe(1);
    } finally {
      await worker.close();
    }
  });

  it("queries full fields with the cached bound, omits an expired bound, honors gating, and measures query failures", async () => {
    const projectId = randomUUID();
    const traceId = randomUUID();
    const key = minimumKey(projectId, traceId);
    const startTimeISO = "2026-09-10T10:00:00.000Z";
    await scheduleTraceObservationReads(projectId, [{ traceId, startTimeISO }]);
    const [job] = await queue.getDelayed();
    vi.mocked(getObservationsForTraceFromEventsTable).mockResolvedValue({
      observations: [],
      totalCount: 1,
    });
    expect(await traceObservationReadProcessor(job)).toEqual({
      observationCount: 0,
      hasMore: true,
    });
    expect(getObservationsForTraceFromEventsTable).toHaveBeenLastCalledWith({
      projectId,
      traceId,
      timestamp: new Date(startTimeISO),
      selectIOAndMetadata: true,
      selectToolData: true,
    });
    expect(recordDistribution).toHaveBeenLastCalledWith(
      "langfuse.trace_observation_read.duration_ms",
      expect.any(Number),
      { outcome: "success" },
    );
    await connection.del(key);
    await traceObservationReadProcessor(job);
    expect(getObservationsForTraceFromEventsTable).toHaveBeenLastCalledWith(
      expect.objectContaining({ timestamp: undefined }),
    );
    env.LANGFUSE_OTEL_TRACE_OBSERVATION_READ_ENABLED = "false";
    await traceObservationReadProcessor(job);
    env.LANGFUSE_OTEL_TRACE_OBSERVATION_READ_ENABLED = "true";
    env.LANGFUSE_OTEL_TRACE_OBSERVATION_READ_SAMPLE_PERCENT = 0;
    await traceObservationReadProcessor(job);
    expect(getObservationsForTraceFromEventsTable).toHaveBeenCalledTimes(2);
    env.LANGFUSE_OTEL_TRACE_OBSERVATION_READ_SAMPLE_PERCENT = 100;
    vi.mocked(getObservationsForTraceFromEventsTable).mockRejectedValueOnce(
      new Error("query failed"),
    );
    await expect(traceObservationReadProcessor(job)).rejects.toThrow(
      "query failed",
    );
    expect(recordDistribution).toHaveBeenLastCalledWith(
      "langfuse.trace_observation_read.duration_ms",
      expect.any(Number),
      { outcome: "failure" },
    );
  });

  it("returns after the scheduling budget and never submits another chunk after an outstanding write resolves", async () => {
    let finishWrite!: (value: number) => void;
    const write = vi.spyOn(connection, "eval").mockImplementationOnce(
      () =>
        new Promise<number>((resolve) => {
          finishWrite = resolve;
        }),
    );
    const enqueue = vi.spyOn(queue, "addBulk");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const pending = scheduleTraceObservationReads(
      randomUUID(),
      Array.from({ length: 101 }, (_, i) => ({
        traceId: `trace-${i}`,
        startTimeISO: "2026-09-10T10:00:00.000Z",
      })),
    );
    await vi.advanceTimersByTimeAsync(100);
    await pending;
    expect(write).toHaveBeenCalledTimes(1);
    finishWrite(1);
    await Promise.resolve();
    expect(enqueue).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledTimes(1);
  });
});
