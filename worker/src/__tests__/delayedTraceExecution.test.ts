import { randomUUID } from "node:crypto";
import { Queue, Worker } from "bullmq";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createNewRedisInstance,
  getObservationsForTraceFromEventsTable,
  getQueuePrefix,
  QueueName,
  DelayedTraceExecutionQueue,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import { env } from "../env";
import {
  scheduleDelayedTraceExecution,
  delayedTraceExecutionId,
} from "../features/traces/delayedTraceExecution";
import { delayedTraceExecutionProcessor } from "../queues/delayedTraceExecutionQueue";

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/src/server")>()),
  getObservationsForTraceFromEventsTable: vi.fn(),
}));

describe("sampled trace observation reads", () => {
  const originalEnabled = env.LANGFUSE_OTEL_DELAYED_TRACE_EXECUTION_ENABLED;
  const originalSample =
    env.LANGFUSE_OTEL_DELAYED_TRACE_EXECUTION_SAMPLE_PERCENT;
  const originalDelay =
    env.LANGFUSE_DELAYED_TRACE_EXECUTION_PROCESSING_DELAY_MS;
  let connection: NonNullable<ReturnType<typeof createNewRedisInstance>>;
  let queue: Queue<TQueueJobTypes[QueueName.DelayedTraceExecution]>;
  const minimumKeys = new Set<string>();

  function minimumKey(projectId: string, traceId: string) {
    const key = queue.toKey(
      `minimum:${delayedTraceExecutionId(projectId, traceId)}`,
    );
    minimumKeys.add(key);
    return key;
  }

  beforeEach(async () => {
    env.LANGFUSE_OTEL_DELAYED_TRACE_EXECUTION_ENABLED = "true";
    env.LANGFUSE_OTEL_DELAYED_TRACE_EXECUTION_SAMPLE_PERCENT = 100;
    env.LANGFUSE_DELAYED_TRACE_EXECUTION_PROCESSING_DELAY_MS = 0;
    const redis = createNewRedisInstance();
    if (!redis) throw new Error("Redis is required for this integration test");
    connection = redis;
    const name = `delayed-trace-execution-test-${randomUUID()}`;
    queue = new Queue(name, {
      connection,
      prefix: getQueuePrefix(name),
    });
    await queue.waitUntilReady();
    await connection.ping();
    vi.spyOn(DelayedTraceExecutionQueue, "getInstance").mockReturnValue(queue);
    vi.mocked(getObservationsForTraceFromEventsTable).mockReset();
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    env.LANGFUSE_OTEL_DELAYED_TRACE_EXECUTION_ENABLED = originalEnabled;
    env.LANGFUSE_OTEL_DELAYED_TRACE_EXECUTION_SAMPLE_PERCENT = originalSample;
    env.LANGFUSE_DELAYED_TRACE_EXECUTION_PROCESSING_DELAY_MS = originalDelay;
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
        scheduleDelayedTraceExecution(projectId, [
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
    expect(initialJob.data.payload.lastSeenStartTime).toBe(
      earliest + 60 * 60_000,
    );
    await connection.expire(key, 1);
    await scheduleDelayedTraceExecution(projectId, [
      { traceId, startTimeISO: new Date(earliest + 60_000).toISOString() },
    ]);
    await scheduleDelayedTraceExecution(otherProjectId, [
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
    // Replacement carries this batch's maximum, even for out-of-order batches.
    expect(replacement.data.payload.lastSeenStartTime).toBe(earliest + 60_000);
    expect(replacement.opts.deduplication?.id).toBe(
      initialJob.opts.deduplication?.id,
    );
    expect(replacement.timestamp + replacement.delay).toBeGreaterThanOrEqual(
      initialJob.timestamp + initialJob.delay,
    );

    env.LANGFUSE_OTEL_DELAYED_TRACE_EXECUTION_SAMPLE_PERCENT = 0;
    const unsampledTraceId = randomUUID();
    await scheduleDelayedTraceExecution(projectId, [
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
    await scheduleDelayedTraceExecution(projectId, [event]);
    const [delayed] = await queue.getDelayed();
    // Simulate the delay and matching deduplication TTL having elapsed.
    await connection.del(
      queue.toKey(`de:${delayedTraceExecutionId(projectId, traceId)}`),
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
      await scheduleDelayedTraceExecution(projectId, [event]);
      const [next] = await queue.getDelayed();
      expect(next).toBeDefined();
      expect(next.id).not.toBe(active!.id);
      await active!.moveToCompleted({}, "test-lock", false);
      expect(
        await queue.getDeduplicationJobId(
          delayedTraceExecutionId(projectId, traceId),
        ),
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
    await scheduleDelayedTraceExecution(projectId, [
      { traceId, startTimeISO },
      { traceId, startTimeISO: lastStartTimeISO },
    ]);
    const [job] = await queue.getDelayed();
    vi.mocked(getObservationsForTraceFromEventsTable).mockResolvedValue({
      observations: [],
      totalCount: 1,
    });
    expect(await delayedTraceExecutionProcessor(job)).toEqual({
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
    await connection.del(key);
    await delayedTraceExecutionProcessor(job);
    expect(getObservationsForTraceFromEventsTable).toHaveBeenLastCalledWith(
      expect.objectContaining({
        timestamp: undefined,
        maxStartTime: new Date(lastStartTimeISO),
      }),
    );
    env.LANGFUSE_OTEL_DELAYED_TRACE_EXECUTION_ENABLED = "false";
    await delayedTraceExecutionProcessor(job);
    env.LANGFUSE_OTEL_DELAYED_TRACE_EXECUTION_ENABLED = "true";
    env.LANGFUSE_OTEL_DELAYED_TRACE_EXECUTION_SAMPLE_PERCENT = 0;
    await delayedTraceExecutionProcessor(job);
    expect(getObservationsForTraceFromEventsTable).toHaveBeenCalledTimes(2);
    env.LANGFUSE_OTEL_DELAYED_TRACE_EXECUTION_SAMPLE_PERCENT = 100;
    vi.mocked(getObservationsForTraceFromEventsTable).mockRejectedValueOnce(
      new Error("query failed"),
    );
    await expect(delayedTraceExecutionProcessor(job)).rejects.toThrow(
      "query failed",
    );
  });

  it("awaits simulated work after the lookup before completing the job", async () => {
    const projectId = randomUUID();
    const traceId = randomUUID();
    minimumKey(projectId, traceId);
    await scheduleDelayedTraceExecution(projectId, [
      { traceId, startTimeISO: "2026-09-10T10:00:00.000Z" },
    ]);
    const [job] = await queue.getDelayed();
    env.LANGFUSE_DELAYED_TRACE_EXECUTION_PROCESSING_DELAY_MS = 500;
    let markQueryStarted!: () => void;
    const queryStarted = new Promise<void>((resolve) => {
      markQueryStarted = resolve;
    });
    vi.mocked(getObservationsForTraceFromEventsTable).mockImplementationOnce(
      async () => {
        markQueryStarted();
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { observations: [], totalCount: 0 };
      },
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    let completed = false;
    const processing = delayedTraceExecutionProcessor(job).then(() => {
      completed = true;
    });
    await queryStarted;
    await vi.advanceTimersByTimeAsync(20);
    await vi.advanceTimersByTimeAsync(499);
    expect(completed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await processing;
    expect(completed).toBe(true);
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
    const pending = scheduleDelayedTraceExecution(
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
