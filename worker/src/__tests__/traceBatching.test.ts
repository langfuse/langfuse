import { randomBytes, randomUUID } from "node:crypto";
import { Queue, QueueEvents, Worker } from "bullmq";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  createNewRedisInstance,
  getQueuePrefix,
  getS3EventStorageClient,
  QueueJobs,
  QueueName,
  recordDistribution,
  recordIncrement,
  redis,
  TraceBatchEventSchema,
  TraceBatchQueue,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import { env } from "../env";
import {
  trackTraceBatchActivity,
  TraceBatchDispatcher,
} from "../features/traces/traceBatching";
import { otelIngestionQueueProcessorBuilder } from "../queues/otelIngestionQueue";
import { traceBatchQueueProcessor } from "../queues/traceBatchQueue";
import { ClickhouseWriter } from "../services/ClickhouseWriter";

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    ...original,
    redis: original.createNewRedisInstance({
      keyPrefix: `trace-batch-test-${randomUUID()}:`,
    }),
    recordDistribution: vi.fn(),
    recordIncrement: vi.fn(),
    getS3EventStorageClient: vi.fn(),
  };
});

vi.mock("../features/evaluation/observationEval", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../features/evaluation/observationEval")
  >()),
  fetchObservationEvalRules: vi.fn().mockResolvedValue([]),
}));

describe("trace micro-batch scheduling with Redis", () => {
  const dueKey = "{trace-batch}:due";
  const stateKey = "{trace-batch}:state";
  const originalEnabled = env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED;
  let queue: Queue<TQueueJobTypes[QueueName.TraceBatch]>;
  let connection: NonNullable<ReturnType<typeof createNewRedisInstance>>;
  const runners: TraceBatchDispatcher[] = [];
  const client = () => {
    if (!redis) throw new Error("Redis is required for this test");
    return redis;
  };
  const member = (projectId: string, traceId: string) =>
    JSON.stringify([projectId, traceId]);
  const event = (traceId: string, start = 1_000_000) => ({
    traceId,
    startTimeISO: new Date(start).toISOString(),
  });
  const runner = () => {
    const instance = new TraceBatchDispatcher();
    runners.push(instance);
    return instance;
  };
  async function makeDue(projectId: string, ...traceIds: string[]) {
    for (const traceId of traceIds)
      await client().zadd(dueKey, 0, member(projectId, traceId));
  }

  beforeEach(async () => {
    env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED = "true";
    await client().del(dueKey, stateKey, "{trace-batch}:dispatcher");
    const redisConnection = createNewRedisInstance();
    if (!redisConnection) throw new Error("Redis is required for this test");
    connection = redisConnection;
    const name = `trace-batch-test-${randomUUID()}`;
    queue = new Queue(name, { connection, prefix: getQueuePrefix(name) });
    await queue.waitUntilReady();
    vi.spyOn(TraceBatchQueue, "getInstance").mockReturnValue(queue);
  });

  afterEach(async () => {
    for (const dispatcher of runners) await dispatcher.drain();
    runners.length = 0;
    vi.restoreAllMocks();
    vi.clearAllMocks();
    env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED = originalEnabled;
    await queue.obliterate({ force: true });
    await queue.close();
    connection.disconnect();
    await client().del(dueKey, stateKey, "{trace-batch}:dispatcher");
  });
  afterAll(() => client().disconnect());

  it("ingests through BullMQ, postpones readiness on new activity, and consumes full ClickHouse payloads once due", async () => {
    const original = {
      LANGFUSE_TRACE_BATCH_IDLE_MS: env.LANGFUSE_TRACE_BATCH_IDLE_MS,
      LANGFUSE_MIGRATION_V4_WRITE_MODE: env.LANGFUSE_MIGRATION_V4_WRITE_MODE,
      LANGFUSE_OTEL_MEDIA_UPLOAD_ENABLED:
        env.LANGFUSE_OTEL_MEDIA_UPLOAD_ENABLED,
      LANGFUSE_OBSERVATION_FIELD_OVERFLOW_ENABLED:
        env.LANGFUSE_OBSERVATION_FIELD_OVERFLOW_ENABLED,
    };
    env.LANGFUSE_TRACE_BATCH_IDLE_MS = 4_000;
    env.LANGFUSE_MIGRATION_V4_WRITE_MODE = "events_only";
    env.LANGFUSE_OTEL_MEDIA_UPLOAD_ENABLED = "false";
    env.LANGFUSE_OBSERVATION_FIELD_OVERFLOW_ENABLED = "false";

    const ingestionName = `trace-batch-ingestion-test-${randomUUID()}`;
    const ingestionQueue = new Queue<
      TQueueJobTypes[QueueName.OtelIngestionQueue]
    >(ingestionName, { connection, prefix: getQueuePrefix(ingestionName) });
    const ingestionEvents = new QueueEvents(ingestionName, {
      connection,
      prefix: ingestionQueue.opts.prefix,
    });
    const ingestionWorker = new Worker(
      ingestionName,
      otelIngestionQueueProcessorBuilder(false),
      { connection, prefix: ingestionQueue.opts.prefix },
    );
    const batchEvents = new QueueEvents(queue.name, {
      connection,
      prefix: queue.opts.prefix,
    });
    const batchWorker = new Worker(queue.name, traceBatchQueueProcessor, {
      connection,
      prefix: queue.opts.prefix,
    });
    const writer = ClickhouseWriter.getInstance();

    try {
      await Promise.all([
        ingestionWorker.waitUntilReady(),
        ingestionEvents.waitUntilReady(),
        batchWorker.waitUntilReady(),
        batchEvents.waitUntilReady(),
      ]);
      const projectId = randomUUID();
      const traceId = randomUUID().replaceAll("-", "");
      const otherTraceId = randomUUID().replaceAll("-", "");
      const input = JSON.stringify({ message: "input".repeat(1_000) });
      const output = JSON.stringify({ message: "output".repeat(1_000) });
      const metadata = JSON.stringify({ context: "metadata".repeat(1_000) });
      const nano = BigInt(Date.now()) * 1_000_000n;
      const timestamp = {
        low: Number(nano & 0xffffffffn),
        high: Number(nano >> 32n),
        unsigned: true,
      };
      async function ingest(traceIds: string[]) {
        // S3 transport and unrelated evaluator configuration are stubbed;
        // OTLP conversion, writer, Redis scripts and both queue workers are real.
        vi.mocked(getS3EventStorageClient).mockReturnValue({
          download: vi.fn().mockResolvedValue(
            JSON.stringify([
              {
                resource: { attributes: [] },
                scopeSpans: [
                  {
                    scope: { name: "langfuse-sdk", version: "4.0.0" },
                    spans: traceIds.map((id) => ({
                      traceId: Buffer.from(id, "hex").toJSON(),
                      spanId: randomBytes(8).toJSON(),
                      name: "trace-batch-integration",
                      kind: 1,
                      startTimeUnixNano: timestamp,
                      endTimeUnixNano: timestamp,
                      attributes: Object.entries({
                        "langfuse.observation.type": "span",
                        "langfuse.observation.input": input,
                        "langfuse.observation.output": output,
                        "langfuse.observation.metadata": metadata,
                      }).map(([key, value]) => ({
                        key,
                        value: { stringValue: value },
                      })),
                    })),
                  },
                ],
              },
            ]),
          ),
        } as unknown as ReturnType<typeof getS3EventStorageClient>);
        const job = await ingestionQueue.add(QueueJobs.OtelIngestionJob, {
          id: randomUUID(),
          timestamp: new Date(),
          name: QueueJobs.OtelIngestionJob,
          payload: {
            data: { fileKey: "trace-batch-integration.json" },
            authCheck: {
              validKey: true,
              scope: { projectId, orgId: randomUUID(), accessLevel: "project" },
            },
            ingestionVersion: "4",
          },
        });
        await job.waitUntilFinished(ingestionEvents, 10_000);
      }
      async function waitUntilRedisTime(deadline: number) {
        await expect
          .poll(
            async () => {
              const [seconds, microseconds] = await client().time();
              return (
                Number(seconds) * 1_000 +
                Math.floor(Number(microseconds) / 1_000)
              );
            },
            { interval: 25, timeout: 10_000 },
          )
          .toBeGreaterThanOrEqual(deadline);
      }

      await ingest([traceId]);
      expect(await client().hlen(stateKey)).toBe(1);
      const firstDue = Number(
        await client().zscore(dueKey, member(projectId, traceId)),
      );
      await waitUntilRedisTime(firstDue - 2_000);
      // Leave ample time to check the old deadline even on a busy CI worker.
      env.LANGFUSE_TRACE_BATCH_IDLE_MS = 10_000;
      await ingest([traceId, otherTraceId]);
      const renewedDue = Number(
        await client().zscore(dueKey, member(projectId, traceId)),
      );
      expect(renewedDue).toBeGreaterThan(firstDue);
      expect(await client().hlen(stateKey)).toBe(2);

      const dispatcher = runner();
      await waitUntilRedisTime(firstDue);
      await dispatcher.processBatch();
      expect(await queue.getJobCounts("wait", "active", "completed")).toEqual({
        wait: 0,
        active: 0,
        completed: 0,
      });

      await writer.flushAll(true);
      env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED = "false";
      await waitUntilRedisTime(renewedDue);
      await dispatcher.processBatch();
      const [batch] = await queue.getJobs(["wait", "active", "completed"]);
      expect(
        batch.data.payload.traces.map((trace) => trace.traceId).sort(),
      ).toEqual([traceId, otherTraceId].sort());
      const result = await batch.waitUntilFinished(batchEvents, 10_000);
      expect(result).toMatchObject({ observationCount: 3, traceCount: 2 });
      // All three observations must carry their untruncated I/O and metadata.
      expect(result.ioMetadataBytes).toBeGreaterThanOrEqual(
        3 * (Buffer.byteLength(input) + Buffer.byteLength(output) + 8_000),
      );
      expect(recordDistribution).toHaveBeenCalledWith(
        "langfuse.trace_batch.size",
        2,
      );
      expect(recordDistribution).toHaveBeenCalledWith(
        "langfuse.trace_batch.io_metadata_bytes",
        result.ioMetadataBytes,
      );
      expect(await client().zcard(dueKey)).toBe(0);
      expect(await client().hlen(stateKey)).toBe(0);
      await dispatcher.processBatch();
      expect(await queue.getCompletedCount()).toBe(1);
    } finally {
      try {
        await Promise.all([ingestionWorker.close(), batchWorker.close()]);
        await Promise.all([ingestionEvents.close(), batchEvents.close()]);
        await ingestionQueue.obliterate({ force: true });
        await ingestionQueue.close();
        await writer.shutdown();
      } finally {
        Object.assign(env, original);
      }
    }
  }, 30_000);

  it("preserves min/max across concurrent out-of-order arrivals, resets readiness, and separates tenants", async () => {
    await Promise.all(
      [30, 0, 20, 10].map((start) =>
        trackTraceBatchActivity("project", [event("trace", start)]),
      ),
    );
    const state = JSON.parse(
      (await client().hget(stateKey, member("project", "trace")))!,
    );
    expect(state).toMatchObject({ minStart: 0, maxStart: 30 });
    await makeDue("project", "trace");
    await trackTraceBatchActivity("project", [event("trace", 15)]);
    expect(
      Number(await client().zscore(dueKey, member("project", "trace"))),
    ).toBeGreaterThan(Date.now() + 590_000);
    await trackTraceBatchActivity("other", [event("trace", 100)]);
    expect(
      JSON.parse((await client().hget(stateKey, member("other", "trace")))!),
    ).toMatchObject({ minStart: 100, maxStart: 100 });
    await runner().processBatch();
    expect(await queue.getWaitingCount()).toBe(0);
  });

  it("dispatches project batches and singletons at 100%, records their distribution, and drains with intake off", async () => {
    const traces = Array.from({ length: 201 }, (_, index) => `trace-${index}`);
    await trackTraceBatchActivity(
      "project",
      traces.map((traceId) => event(traceId)),
    );
    await trackTraceBatchActivity("other", [event("trace-0")]);
    await makeDue("project", ...traces);
    await makeDue("other", "trace-0");
    env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED = "false";
    await trackTraceBatchActivity("disabled", [event("ignored")]);
    await runner().processBatch();
    const jobs = await queue.getJobs(["wait"]);
    for (const job of jobs) TraceBatchEventSchema.parse(job.data);
    expect(
      jobs.map((job) => job.data.payload.traces.length).sort((a, b) => a - b),
    ).toEqual([1, 201]);
    expect(
      jobs
        .filter((job) => job.data.payload.projectId === "project")
        .flatMap((job) => job.data.payload.traces.map((trace) => trace.traceId))
        .sort(),
    ).toEqual(traces.sort());
    expect(await client().zcard(dueKey)).toBe(0);
    expect(await client().hlen(stateKey)).toBe(0);
    expect(
      vi
        .mocked(recordDistribution)
        .mock.calls.filter(([name]) => name === "langfuse.trace_batch.size")
        .map(([, value]) => value)
        .sort((a, b) => Number(a) - Number(b)),
    ).toEqual([1, 201]);
    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.trace_batch.dispatched_traces",
      1,
      { batch_kind: "singleton" },
    );
  });

  it("keeps due state on enqueue failure and retries it on the next dispatch", async () => {
    await trackTraceBatchActivity("project", [event("trace")]);
    await makeDue("project", "trace");
    vi.spyOn(queue, "add").mockRejectedValueOnce(
      new Error("enqueue unavailable"),
    );
    const dispatcher = runner();
    await dispatcher.processBatch();
    expect(await client().zcard(dueKey)).toBe(1);
    expect(await client().hlen(stateKey)).toBe(1);
    await dispatcher.processBatch();
    expect(await queue.getWaitingCount()).toBe(1);
    expect(await client().zcard(dueKey)).toBe(0);
  });

  it.each([false, true])(
    "preserves arrivals during enqueue, including deleted/recreated state: %s",
    async (recreate) => {
      await trackTraceBatchActivity("project", [event("trace")]);
      await makeDue("project", "trace");
      const add = queue.add.bind(queue);
      vi.spyOn(queue, "add").mockImplementationOnce(async (...args) => {
        const job = await add(...args);
        if (recreate) await client().hdel(stateKey, member("project", "trace"));
        await trackTraceBatchActivity("project", [event("trace", 2_000_000)]);
        return job;
      });
      const dispatcher = runner();
      await dispatcher.processBatch();
      expect(await queue.getWaitingCount()).toBe(1);
      expect(await client().zcard(dueKey)).toBe(1);
      const current = JSON.parse(
        (await client().hget(stateKey, member("project", "trace")))!,
      );
      const [job] = await queue.getJobs(["wait"]);
      expect(current.revision).not.toBe(job.data.payload.traces[0].revision);
      expect(current.maxStart).toBe(2_000_000);
      await makeDue("project", "trace");
      await dispatcher.processBatch();
      expect(await queue.getWaitingCount()).toBe(2);
      expect(await client().hlen(stateKey)).toBe(0);
    },
  );

  it("reuses a queued batch when its acknowledgement fails", async () => {
    await trackTraceBatchActivity("project", [event("trace")]);
    await makeDue("project", "trace");
    const add = queue.add.bind(queue);
    vi.spyOn(queue, "add").mockImplementationOnce(async (...args) => {
      const job = await add(...args);
      // The next Redis operation is the post-enqueue acknowledgement.
      vi.spyOn(client(), "eval").mockRejectedValueOnce(
        new Error("ACK unavailable"),
      );
      return job;
    });
    const dispatcher = runner();
    await dispatcher.processBatch();
    expect(await queue.getWaitingCount()).toBe(1);
    expect(await client().hlen(stateKey)).toBe(1);
    await dispatcher.processBatch();
    expect(await queue.getWaitingCount()).toBe(1);
    expect(await client().hlen(stateKey)).toBe(0);
  });

  it("allows only one dispatcher and waits for its in-flight enqueue before shutdown", async () => {
    const traces = ["trace"];
    await trackTraceBatchActivity(
      "project",
      traces.map((traceId) => event(traceId)),
    );
    await makeDue("project", ...traces);
    await trackTraceBatchActivity("other", [event("trace")]);
    await makeDue("other", "trace");
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const add = queue.add.bind(queue);
    vi.spyOn(queue, "add").mockImplementationOnce(async (...args) => {
      entered.resolve();
      await release.promise;
      return add(...args);
    });
    const first = runner();
    const active = first.processBatch();
    await entered.promise;
    await runner().processBatch();
    expect(queue.add).toHaveBeenCalledTimes(1);
    let drained = false;
    const drain = first.drain().then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained).toBe(false);
    release.resolve();
    await Promise.all([active, drain]);
    expect(drained).toBe(true);
    expect(await queue.getWaitingCount()).toBe(1);
    expect(await client().hlen(stateKey)).toBe(1);
    await first.processBatch();
    expect(queue.add).toHaveBeenCalledTimes(1);
  });
});
