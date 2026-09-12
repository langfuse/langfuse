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
  getTraceBatchEventStream,
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
  selectTraceBatches,
  trackTraceBatchActivity,
  TraceBatchDispatcher,
  type PendingTrace,
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

describe("trace batch selection", () => {
  const minute = 60_000;
  const pendingTrace = (
    projectId: string,
    traceId: string,
    due: number,
    minStart: number,
    maxStart: number,
  ): PendingTrace => ({
    member: JSON.stringify([projectId, traceId]),
    due,
    trace: {
      projectId,
      traceId,
      minStart,
      maxStart,
      revision: `revision-${projectId}-${traceId}`,
    },
  });
  const ids = (batches: PendingTrace[][]) =>
    batches.map((batch) => batch.map(({ member }) => member));

  it("groups nearby narrow traces while separating a wide-window outlier", () => {
    const candidates = [
      pendingTrace("project-a", "short-1", 1, 10 * minute, 12 * minute),
      pendingTrace("project-a", "wide", 2, 0, 8 * 60 * minute),
      pendingTrace("project-b", "short-2", 3, 11 * minute, 13 * minute),
    ];

    expect(ids(selectTraceBatches(candidates, 60, "locality"))).toEqual([
      [candidates[0].member, candidates[2].member],
      [candidates[1].member],
    ]);
  });

  it("separates distant narrow traces and groups overlapping wide traces", () => {
    const candidates = [
      pendingTrace("project", "day-one", 1, 0, minute),
      pendingTrace("project", "wide-1", 2, 10 * minute, 250 * minute),
      pendingTrace("other", "day-two", 3, 24 * 60 * minute, 24 * 61 * minute),
      pendingTrace("other", "wide-2", 4, 20 * minute, 260 * minute),
    ];

    expect(ids(selectTraceBatches(candidates, 60, "locality"))).toEqual([
      [candidates[0].member],
      [candidates[1].member, candidates[3].member],
      [candidates[2].member],
    ]);
  });

  it("bounds chained wide-trace expansion relative to the oldest seed", () => {
    const candidates = [
      pendingTrace("project", "seed", 1, 0, 120 * minute),
      pendingTrace("project", "compatible", 2, 0, 144 * minute),
      pendingTrace("project", "would-chain", 3, 0, 168 * minute),
    ];

    expect(ids(selectTraceBatches(candidates, 60, "locality"))).toEqual([
      [candidates[0].member, candidates[1].member],
      [candidates[2].member],
    ]);
  });

  it("first-fits the earliest compatible companion in due order", () => {
    const seed = pendingTrace("project-a", "seed", 1, 0, 10 * minute);
    const otherProject = pendingTrace(
      "project-b",
      "other",
      2,
      5 * minute,
      15 * minute,
    );
    const sameProject = pendingTrace(
      "project-a",
      "later-same",
      3,
      8 * minute,
      18 * minute,
    );

    expect(
      ids(
        selectTraceBatches([seed, otherProject, sameProject], 60, "locality"),
      ),
    ).toEqual([[seed.member, otherProject.member], [sameProject.member]]);
  });

  it("fills compatible batches across small projects and is deterministic", () => {
    const candidates = Array.from({ length: 12 }, (_, index) =>
      pendingTrace(
        `project-${index % 4}`,
        `trace-${index}`,
        index,
        100 * minute + index * 1_000,
        101 * minute + index * 1_000,
      ),
    );
    const expected = selectTraceBatches(candidates, 5, "locality");

    expect(expected.map((batch) => batch.length)).toEqual([5, 5, 2]);
    expect(
      expected.every(
        (batch) =>
          new Set(batch.map((entry) => entry.trace.projectId)).size > 1,
      ),
    ).toBe(true);
    expect(selectTraceBatches(candidates.toReversed(), 5, "locality")).toEqual(
      expected,
    );
  });

  it("dispatches the oldest incompatible trace without starvation", () => {
    const oldest = pendingTrace(
      "project",
      "old-outlier",
      1,
      365 * 24 * 60 * minute,
      365 * 24 * 60 * minute + minute,
    );
    const recent = Array.from({ length: 20 }, (_, index) =>
      pendingTrace("project", `recent-${index}`, index + 2, 0, minute),
    );

    const batches = selectTraceBatches([oldest, ...recent], 10, "locality");

    expect(batches[0]).toEqual([oldest]);
    expect(batches.flat()).toHaveLength(21);
  });

  it("handles empty input, cap boundaries, and lossless chunked assignment", () => {
    expect(selectTraceBatches([], 3, "locality")).toEqual([]);

    let seed = 0x12345678;
    const random = () => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return seed / 0x1_0000_0000;
    };
    const candidates = Array.from({ length: 2_503 }, (_, index) => {
      const minStart = Math.floor(random() * 30 * 24 * 60 * minute);
      const span =
        random() < 0.1
          ? (2 + Math.floor(random() * 10)) * 60 * minute
          : Math.floor(random() * 30 * minute);
      return pendingTrace(
        `project-${Math.floor(random() * 17)}`,
        `trace-${index}`,
        Math.floor(random() * 100_000),
        minStart,
        minStart + span,
      );
    });
    const batches = [
      candidates.slice(0, 1_000),
      candidates.slice(1_000, 2_000),
      candidates.slice(2_000),
    ].flatMap((chunk) => selectTraceBatches(chunk, 60, "locality"));
    const assigned = batches.flat().map(({ member }) => member);

    expect(
      batches.every((batch) => batch.length > 0 && batch.length <= 60),
    ).toBe(true);
    expect(assigned).toHaveLength(candidates.length);
    expect(new Set(assigned)).toEqual(
      new Set(candidates.map(({ member }) => member)),
    );
  });
});

describe("trace micro-batch scheduling with Redis", () => {
  const dueKey = "{trace-batch}:due";
  const stateKey = "{trace-batch}:state";
  const originalEnabled = env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED;
  const originalSamplingRate = env.LANGFUSE_TRACE_BATCH_SAMPLING_RATE;
  const originalMaxSize = env.LANGFUSE_TRACE_BATCH_MAX_SIZE;
  const originalStrategy = env.LANGFUSE_TRACE_BATCH_STRATEGY;
  const originalPendingTtl = env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS;
  const originalIdle = env.LANGFUSE_TRACE_BATCH_IDLE_MS;
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
      await client().zadd(
        dueKey,
        Date.now() - 10_000,
        member(projectId, traceId),
      );
  }

  beforeEach(async () => {
    env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED = "true";
    env.LANGFUSE_TRACE_BATCH_SAMPLING_RATE = 1;
    env.LANGFUSE_TRACE_BATCH_MAX_SIZE = 60;
    env.LANGFUSE_TRACE_BATCH_STRATEGY = "project";
    env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS = 7_200_000;
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
    env.LANGFUSE_TRACE_BATCH_SAMPLING_RATE = originalSamplingRate;
    env.LANGFUSE_TRACE_BATCH_MAX_SIZE = originalMaxSize;
    env.LANGFUSE_TRACE_BATCH_STRATEGY = originalStrategy;
    env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS = originalPendingTtl;
    env.LANGFUSE_TRACE_BATCH_IDLE_MS = originalIdle;
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
    env.LANGFUSE_TRACE_BATCH_SAMPLING_RATE = 0.1;
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
      // The evaluator sampler assigns these scores 0.0593, 0.0291 and 0.7116.
      const traceId = "00000000000000000000000000000001";
      const otherTraceId = "00000000000000000000000000000003";
      const excludedTraceId = "00000000000000000000000000000002";
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

      await ingest([traceId, excludedTraceId]);
      expect(await client().hlen(stateKey)).toBe(1);
      const firstDue = Number(
        await client().zscore(dueKey, member(projectId, traceId)),
      );
      await waitUntilRedisTime(firstDue - 2_000);
      // Leave ample time to check the old deadline even on a busy CI worker.
      env.LANGFUSE_TRACE_BATCH_IDLE_MS = 10_000;
      await ingest([traceId, otherTraceId, excludedTraceId]);
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
      // Sampling only gates readiness; excluded observations are still ingested.
      let excludedObservations = 0;
      for await (const observation of getTraceBatchEventStream({
        traces: [
          {
            projectId,
            traceId: excludedTraceId,
            minStart: Number(nano / 1_000_000n),
            maxStart: Number(nano / 1_000_000n),
          },
        ],
      })) {
        expect(observation.trace_id).toBe(excludedTraceId);
        excludedObservations++;
      }
      expect(excludedObservations).toBe(2);
      env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED = "false";
      env.LANGFUSE_TRACE_BATCH_SAMPLING_RATE = 0;
      await waitUntilRedisTime(renewedDue);
      await dispatcher.processBatch();
      const [batch] = await queue.getJobs(["wait", "active", "completed"]);
      expect(
        batch.data.payload.traces.map((trace) => trace.traceId).sort(),
      ).toEqual([traceId, otherTraceId].sort());
      const result = await batch.waitUntilFinished(batchEvents, 10_000);
      expect(result).toMatchObject({
        observationCount: 3,
        traceCount: 2,
        projectCount: 1,
      });
      expect(recordDistribution).toHaveBeenCalledWith(
        "langfuse.trace_batch.found_project_count",
        1,
      );
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

  it("keeps stable nested trace samples across replay and counts decisions once per trace in each ingestion batch", async () => {
    const traceIds = Array.from({ length: 1_000 }, (_, i) =>
      i.toString(16).padStart(32, "0"),
    );
    let previous: string[] = [];
    // Fixed fixtures pin the evaluator's sampling cohort, including both endpoints.
    for (const [rate, expectedCount] of [
      [0, 0],
      [0.1, 78],
      [0.1, 78],
      [0.5, 478],
      [1, 1_000],
    ]) {
      await client().del(dueKey, stateKey);
      vi.mocked(recordIncrement).mockClear();
      env.LANGFUSE_TRACE_BATCH_SAMPLING_RATE = rate;
      traceIds.reverse();
      await trackTraceBatchActivity(
        "project",
        traceIds.flatMap((id) => [
          event(id, 100),
          event(id, 200),
          event(id, 150),
        ]),
      );
      const selected = (await client().hkeys(stateKey)).sort();
      expect(selected).toHaveLength(expectedCount);
      expect(await client().zcard(dueKey)).toBe(expectedCount);
      expect(selected).toEqual(expect.arrayContaining(previous));
      if (previous.length === expectedCount) expect(selected).toEqual(previous);
      expect(recordIncrement).toHaveBeenCalledWith(
        "langfuse.trace_batch.sampling_decisions",
        expectedCount,
        { decision: "selected" },
      );
      expect(recordIncrement).toHaveBeenCalledWith(
        "langfuse.trace_batch.sampling_decisions",
        1_000 - expectedCount,
        { decision: "excluded" },
      );
      previous = selected;
    }
  });

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

  it.each([
    { maxSize: 60, sizes: [22, 60, 60, 60], projectCounts: [1, 1, 1, 2] },
    { maxSize: 80, sizes: [42, 80, 80], projectCounts: [1, 1, 2] },
  ])(
    "dispatches cross-project batches capped at $maxSize, records their distribution, and drains with intake off",
    async ({ maxSize, sizes, projectCounts }) => {
      env.LANGFUSE_TRACE_BATCH_MAX_SIZE = maxSize;
      const traces = Array.from(
        { length: 201 },
        (_, index) => `trace-${index}`,
      );
      await trackTraceBatchActivity(
        "project",
        traces.map((traceId) => event(traceId)),
      );
      await trackTraceBatchActivity("other", [event("trace-0")]);
      await client().zadd(
        dueKey,
        ...traces.flatMap((traceId, index) => [
          Date.now() - 1_000 + index,
          member("project", traceId),
        ]),
      );
      await makeDue("other", "trace-0");
      const add = vi.spyOn(queue, "add");
      env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED = "false";
      await trackTraceBatchActivity("disabled", [event("ignored")]);
      await runner().processBatch();
      const jobs = await queue.getJobs(["wait"]);
      for (const job of jobs) TraceBatchEventSchema.parse(job.data);
      expect(
        jobs.map((job) => job.data.payload.traces.length).sort((a, b) => a - b),
      ).toEqual(sizes);
      expect(
        jobs
          .flatMap((job) =>
            job.data.payload.traces.map((trace) =>
              member(trace.projectId, trace.traceId),
            ),
          )
          .sort(),
      ).toEqual(
        [
          ...traces.map((traceId) => member("project", traceId)),
          member("other", "trace-0"),
        ].sort(),
      );
      expect(
        add.mock.calls.flatMap(([, job]) =>
          job.payload.traces.map((trace) =>
            member(trace.projectId, trace.traceId),
          ),
        ),
      ).toEqual([
        member("other", "trace-0"),
        ...traces.map((traceId) => member("project", traceId)),
      ]);
      expect(await client().zcard(dueKey)).toBe(0);
      expect(await client().hlen(stateKey)).toBe(0);
      expect(
        vi
          .mocked(recordDistribution)
          .mock.calls.filter(([name]) => name === "langfuse.trace_batch.size")
          .map(([, value]) => value)
          .sort((a, b) => Number(a) - Number(b)),
      ).toEqual(sizes);
      expect(
        vi
          .mocked(recordDistribution)
          .mock.calls.filter(
            ([name]) => name === "langfuse.trace_batch.project_count",
          )
          .map(([, value]) => value)
          .sort((a, b) => Number(a) - Number(b)),
      ).toEqual(projectCounts);
      await runner().processBatch();
      expect(await queue.getWaitingCount()).toBe(sizes.length);
    },
  );

  it("dispatches with locality selection and records bounded selector measurements", async () => {
    env.LANGFUSE_TRACE_BATCH_STRATEGY = "locality";
    const minute = 60_000;
    await trackTraceBatchActivity("project-a", [
      event("short-1", 10 * minute),
      event("short-1", 12 * minute),
      event("wide", 0),
      event("wide", 8 * 60 * minute),
    ]);
    await trackTraceBatchActivity("project-b", [
      event("short-2", 11 * minute),
      event("short-2", 13 * minute),
    ]);
    const due = Date.now() - 1_000;
    await client().zadd(
      dueKey,
      due,
      member("project-a", "short-1"),
      due + 1,
      member("project-a", "wide"),
      due + 2,
      member("project-b", "short-2"),
    );

    await runner().processBatch();

    const jobs = await queue.getJobs(["wait"]);
    expect(
      jobs
        .map((job) =>
          job.data.payload.traces
            .map(({ traceId }) => traceId)
            .sort()
            .join(","),
        )
        .sort(),
    ).toEqual(["short-1,short-2", "wide"]);
    expect(recordDistribution).toHaveBeenCalledWith(
      "langfuse.trace_batch.candidate_buffer_size",
      3,
      { strategy: "locality" },
    );
    expect(recordDistribution).toHaveBeenCalledWith(
      "langfuse.trace_batch.event_time_envelope_ms",
      29_040_000,
      { strategy: "locality" },
    );
    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.trace_batch.dispatched_batches",
      1,
      { strategy: "locality", fill: "singleton" },
    );
    expect(
      vi
        .mocked(recordDistribution)
        .mock.calls.some(
          ([name, value, tags]) =>
            name === "langfuse.trace_batch.selector_duration_ms" &&
            Number(value) >= 0 &&
            tags?.strategy === "locality",
        ),
    ).toBe(true);
  });

  it("groups the complete due cohort by sorted project across hydration chunks and the former run limit", async () => {
    const due = Date.now() - 100_000;
    const traces = Array.from({ length: 10_061 }, (_, i) => ({
      projectId: ["project-c", "project-a", "project-b"][i % 3],
      traceId: `trace-${String(i).padStart(5, "0")}`,
      due: due + Math.floor(i / 2_000) * 1_000,
    }));
    for (const projectId of ["project-c", "project-a", "project-b"]) {
      await trackTraceBatchActivity(
        projectId,
        traces
          .filter((trace) => trace.projectId === projectId)
          .map((trace) => event(trace.traceId)),
      );
    }
    await client().zadd(
      dueKey,
      ...traces.flatMap((trace) => [
        trace.due,
        member(trace.projectId, trace.traceId),
      ]),
    );
    const add = vi.spyOn(queue, "add");
    await runner().processBatch();
    const batches = add.mock.calls.map(([, job]) => job.payload.traces);
    expect(batches.map((batch) => batch.length)).toEqual([
      ...Array(167).fill(60),
      41,
    ]);
    const expected = traces.sort(
      (a, b) =>
        a.projectId.localeCompare(b.projectId) ||
        a.due - b.due ||
        a.traceId.localeCompare(b.traceId),
    );
    expect(
      batches.flat().map((trace) => member(trace.projectId, trace.traceId)),
    ).toEqual(expected.map((trace) => member(trace.projectId, trace.traceId)));
    expect(await client().zcard(dueKey)).toBe(0);
    expect(await client().hlen(stateKey)).toBe(0);
  });

  it("revalidates the due ID list after deletion, missing state, reactivation and new arrivals", async () => {
    const traces = Array.from(
      { length: 2_001 },
      (_, i) => `trace-${String(i).padStart(5, "0")}`,
    );
    await trackTraceBatchActivity(
      "project",
      traces.map((id) => event(id)),
    );
    const due = Date.now() - 1_000;
    await client().zadd(
      dueKey,
      ...traces.flatMap((id) => [due, member("project", id)]),
    );
    const range = client().zrange.bind(client());
    let changed = false;
    vi.spyOn(client(), "zrange").mockImplementation(async (...args) => {
      const result = await range(...args);
      if (!changed && args.includes("BYSCORE")) {
        changed = true;
        // Change Redis after the complete ID list has been read but before hydration.
        await client().zrem(dueKey, member("project", traces[0]));
        await client().hdel(stateKey, member("project", traces[0]));
        await client().hdel(stateKey, member("project", traces[1_000]));
        env.LANGFUSE_TRACE_BATCH_IDLE_MS = 1;
        await trackTraceBatchActivity("project", [
          event(traces[999]),
          event("new-after-cutoff"),
        ]);
      }
      return result;
    });
    const add = vi.spyOn(queue, "add");
    await runner().processBatch();
    expect(changed).toBe(true);
    expect(
      add.mock.calls.flatMap(([, job]) =>
        job.payload.traces.map((trace) => trace.traceId),
      ),
    ).toEqual(traces.filter((_, i) => i !== 0 && i !== 999 && i !== 1_000));
    expect(
      await client().zscore(dueKey, member("project", traces[1_000])),
    ).toBeNull();
    expect((await client().hkeys(stateKey)).sort()).toEqual(
      [
        member("project", "new-after-cutoff"),
        member("project", traces[999]),
      ].sort(),
    );
  });

  it("expires bounded pending state during ingestion without dispatch and preserves refreshed traces", async () => {
    env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS = 60_000;
    const expired = Array.from({ length: 1_001 }, (_, i) =>
      event(`expired-${i}`),
    );
    await trackTraceBatchActivity("project", [
      ...expired,
      event("refreshed"),
      event("recent"),
    ]);
    const cutoff = Date.now() - 70_000;
    await client().zadd(
      dueKey,
      ...expired.flatMap(({ traceId }) => [cutoff, member("project", traceId)]),
      cutoff,
      member("project", "refreshed"),
    );
    await makeDue("project", "recent");
    await trackTraceBatchActivity("project", [event("refreshed", 2_000_000)]);
    expect(await client().zcard(dueKey)).toBe(3);
    expect(await client().hlen(stateKey)).toBe(3);
    expect(
      await client().hget(stateKey, member("project", "recent")),
    ).not.toBeNull();
    expect(
      Number(await client().zscore(dueKey, member("project", "refreshed"))),
    ).toBeGreaterThan(Date.now());
    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.trace_batch.expired_traces",
      1_000,
    );
    await trackTraceBatchActivity("project", [event("refreshed", 3_000_000)]);
    expect((await client().hkeys(stateKey)).sort()).toEqual([
      member("project", "recent"),
      member("project", "refreshed"),
    ]);
    expect(await client().zcard(dueKey)).toBe(2);
    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.trace_batch.expired_traces",
      1,
    );
    expect(await queue.getWaitingCount()).toBe(0);
  });

  it("cleans an expired backlog in bounded pages without queueing expired traces", async () => {
    env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS = 60_000;
    const expired = Array.from({ length: 10_001 }, (_, i) =>
      event(`expired-${i}`),
    );
    await trackTraceBatchActivity("project", [...expired, event("ready")]);
    await client().zadd(
      dueKey,
      ...expired.flatMap(({ traceId }) => [
        Date.now() - 70_000,
        member("project", traceId),
      ]),
    );
    await makeDue("project", "ready");
    env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED = "false";
    const dispatcher = runner();
    await dispatcher.processBatch();
    expect(
      vi
        .mocked(recordIncrement)
        .mock.calls.filter(
          ([name]) => name === "langfuse.trace_batch.expired_traces",
        )
        .every(([, count]) => count <= 1_000),
    ).toBe(true);
    const jobs = await queue.getJobs(["wait"]);
    expect(
      jobs.flatMap((job) =>
        job.data.payload.traces.map((trace) => trace.traceId),
      ),
    ).toEqual(["ready"]);
    expect(await client().hlen(stateKey)).toBe(0);
    expect(await client().zcard(dueKey)).toBe(0);
    expect(
      vi
        .mocked(recordIncrement)
        .mock.calls.filter(
          ([name]) => name === "langfuse.trace_batch.expired_traces",
        )
        .reduce((sum, [, value]) => sum + value, 0),
    ).toBe(10_001);
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

  it.each(["updated", "deleted", "expired"] as const)(
    "preserves arrivals during enqueue, including deleted/recreated state: %s",
    async (mode) => {
      await trackTraceBatchActivity("project", [event("trace")]);
      await makeDue("project", "trace");
      const add = queue.add.bind(queue);
      vi.spyOn(queue, "add").mockImplementationOnce(async (...args) => {
        const job = await add(...args);
        if (mode === "deleted")
          await client().hdel(stateKey, member("project", "trace"));
        if (mode === "expired") {
          await client().zadd(dueKey, 0, member("project", "trace"));
          await trackTraceBatchActivity("other", [event("trigger")]);
          expect(
            await client().hget(stateKey, member("project", "trace")),
          ).toBeNull();
          await client().zrem(dueKey, member("other", "trigger"));
          await client().hdel(stateKey, member("other", "trigger"));
        }
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
    await trackTraceBatchActivity("other", [event("trace")]);
    await makeDue("other", "trace");
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
    expect(await client().hlen(stateKey)).toBe(2);
    await dispatcher.processBatch();
    expect(await queue.getWaitingCount()).toBe(1);
    expect(await client().hlen(stateKey)).toBe(0);
    const [job] = await queue.getJobs(["wait"]);
    expect(
      job.data.payload.traces
        .map((trace) => member(trace.projectId, trace.traceId))
        .sort(),
    ).toEqual([member("other", "trace"), member("project", "trace")]);
  });

  it("subtracts dispatcher runtime from the next delay and catches up after an overrun", async () => {
    let clock = Date.now();
    const interval = env.LANGFUSE_TRACE_BATCH_DISPATCH_INTERVAL_MS;
    let elapsed = Math.floor(interval / 2);
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    const range = client().zrange.bind(client());
    vi.spyOn(client(), "zrange").mockImplementation(async (...args) => {
      const result = await range(...args);
      if (args.includes("BYSCORE")) clock += elapsed;
      return result;
    });
    const dispatcher = runner();
    expect(await dispatcher.processBatch()).toBe(interval - elapsed);
    elapsed = interval + 1_000;
    expect(await dispatcher.processBatch()).toBe(0);
  });

  it("allows only one dispatcher and waits for its in-flight enqueue before shutdown", async () => {
    env.LANGFUSE_TRACE_BATCH_MAX_SIZE = 1;
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
