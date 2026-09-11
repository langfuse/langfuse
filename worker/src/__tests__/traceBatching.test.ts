import { randomUUID } from "node:crypto";
import { Queue } from "bullmq";
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
  QueueName,
  recordDistribution,
  recordIncrement,
  redis,
  TraceBatchQueue,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import { env } from "../env";
import {
  trackTraceBatchActivity,
  TraceBatchDispatcher,
} from "../features/traces/traceBatching";

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
  };
});

describe("trace micro-batch scheduling with Redis", () => {
  const dueKey = "{trace-batch}:due";
  const stateKey = "{trace-batch}:state";
  const originalEnabled = env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED;
  const originalSize = env.LANGFUSE_TRACE_BATCH_MAX_SIZE;
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
    env.LANGFUSE_TRACE_BATCH_MAX_SIZE = 20;
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
    env.LANGFUSE_TRACE_BATCH_MAX_SIZE = originalSize;
    await queue.obliterate({ force: true });
    await queue.close();
    connection.disconnect();
    await client().del(dueKey, stateKey, "{trace-batch}:dispatcher");
  });
  afterAll(() => client().disconnect());

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
    const traces = Array.from({ length: 41 }, (_, index) => `trace-${index}`);
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
    expect(
      jobs.map((job) => job.data.payload.traces.length).sort((a, b) => a - b),
    ).toEqual([1, 1, 20, 20]);
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
    ).toEqual([1, 1, 20, 20]);
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
    const traces = Array.from({ length: 21 }, (_, index) => `trace-${index}`);
    await trackTraceBatchActivity(
      "project",
      traces.map((traceId) => event(traceId)),
    );
    await makeDue("project", ...traces);
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
