import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { cpus, totalmem } from "node:os";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

/** Synthetic Redis/BullMQ probe. No ClickHouse writes or reads. */
async function main() {
  const { values } = parseArgs({
    options: {
      rate: { type: "string", default: "1200" },
      duration: { type: "string", default: "60" },
      events: { type: "string", default: "5" },
      batch: { type: "string", default: "1000" },
      skew: { type: "string", default: "0.3" },
      late: { type: "string", default: "0.06" },
      "late-delay": { type: "string", default: "5" },
      idle: { type: "string", default: "1000" },
      "dispatch-interval": { type: "string", default: "1000" },
      "stall-at": { type: "string", default: "0" },
      "stall-seconds": { type: "string", default: "0" },
      shards: { type: "string" },
      output: { type: "string", default: "/tmp/trace-batch-load" },
    },
  });
  const number = (key: keyof typeof values) => {
    const value = Number(values[key]);
    if (!Number.isFinite(value) || value < 0)
      throw new Error(`Invalid --${key}`);
    return value;
  };
  const rate = number("rate");
  const duration = number("duration") * 1000;
  const eventsPerTrace = number("events");
  const batchTraces = Math.floor(number("batch") / eventsPerTrace);
  const skew = number("skew");
  const lateFraction = number("late");
  const lateDelay = number("late-delay") * 1000;
  const idle = number("idle");
  const dispatchInterval = number("dispatch-interval");
  const stallAt = number("stall-at") * 1000;
  const stallDuration = number("stall-seconds") * 1000;
  if (
    !rate ||
    !duration ||
    !eventsPerTrace ||
    !batchTraces ||
    !Number.isInteger(eventsPerTrace) ||
    skew > 1 ||
    lateFraction > 1 ||
    lateDelay <= idle + dispatchInterval
  )
    throw new Error(
      "Positive rate/duration/events/batch required; fractions <= 1; late-delay must exceed idle + dispatch-interval",
    );

  // Unique prefixes prevent this probe from consuming the local worker's jobs.
  const prefix = `trace-load-${randomUUID()}:`;
  Object.assign(process.env, {
    REDIS_KEY_PREFIX: prefix,
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "DEV",
    LANGFUSE_TRACE_BATCH_INGESTION_ENABLED: "true",
    LANGFUSE_TRACE_BATCH_DISPATCHER_ENABLED: "true",
    LANGFUSE_TRACE_BATCH_READ_ENABLED: "false",
    LANGFUSE_TRACE_BATCH_SAMPLING_RATE: "1",
    LANGFUSE_TRACE_BATCH_IDLE_MS: String(idle),
    LANGFUSE_TRACE_BATCH_DISPATCH_INTERVAL_MS: String(dispatchInterval),
    ...(values.shards
      ? { LANGFUSE_TRACE_BATCH_SHARD_COUNT: values.shards }
      : {}),
  });

  const { Worker } = await import("bullmq");
  const {
    redis,
    QueueName,
    TraceBatchQueue,
    createBullMQWorkerOptionsWithRedis,
  } = await import("@langfuse/shared/src/server");
  const { trackTraceBatchActivity, TraceBatchDispatcher } =
    await import("../features/traceBatching/traceBatching.js");
  const { getTraceBatchReadinessKeys, getTraceBatchFirstKeys } =
    await import("../features/traceBatching/traceBatchReadiness.js");
  const { traceBatchQueueProcessor } =
    await import("../queues/traceBatchQueue.js");
  const { env } = await import("../env.js");
  if (!redis) throw new Error("Redis is required");
  const queue = TraceBatchQueue.getInstance();
  const workerOptions = createBullMQWorkerOptionsWithRedis(
    QueueName.TraceBatch,
  );
  if (!queue || !workerOptions)
    throw new Error("Trace-batch queue is unavailable");

  type Entry = {
    projectId: string;
    traceId: string;
    start: number;
    due: number;
    late: boolean;
    seen: Set<string>;
    initialDispatches: number;
    lateDispatches: number;
  };
  const ledger = new Map<string, Entry>();
  const delayed: Entry[] = [];
  let delayedOffset = 0;
  let duplicates = 0;
  let wrongEarliest = 0;
  let unknown = 0;
  let completedJobs = 0;
  let queueErrors = 0;
  let trackingCpuUs = 0;
  const trackingMs: number[] = [];
  const dispatcherMs: number[] = [];
  const consumer = new Worker(
    queue.name,
    async (job) => {
      for (const trace of job.data.payload.traces) {
        const entry = ledger.get(trace.traceId);
        if (!entry) {
          unknown++;
          continue;
        }
        if (entry.seen.has(trace.revision)) duplicates++;
        entry.seen.add(trace.revision);
        if (trace.maxStart >= entry.start + 600_000) entry.lateDispatches++;
        else entry.initialDispatches++;
        if (trace.minStart !== entry.start) wrongEarliest++;
      }
      await traceBatchQueueProcessor(job);
      completedJobs++;
    },
    { ...workerOptions, concurrency: 4 },
  );
  consumer.on("error", () => {
    queueErrors++;
  });
  consumer.on("failed", () => {
    queueErrors++;
  });
  await consumer.waitUntilReady();
  const dispatcher = new TraceBatchDispatcher();
  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();
  const started = Date.now();
  let nextDispatch = started;
  let nextSample = started;
  let sequence = 0;
  const projectIds = Array.from({ length: 101 }, () => randomUUID());
  let lateSent = 0;
  const samples: Record<string, unknown>[] = [];
  const sample = async () => {
    const redisNodes = "nodes" in redis ? redis.nodes("master") : [redis];
    const shards = await Promise.all(
      Array.from(
        { length: env.LANGFUSE_TRACE_BATCH_SHARD_COUNT },
        async (_, shard) => {
          const keys = getTraceBatchReadinessKeys(shard);
          const firstKeys = getTraceBatchFirstKeys(shard, Date.now()).keys;
          // EVAL declares keys so ioredis applies the prefix and cluster route.
          const [
            dueEntries,
            stateEntries,
            dueBytes,
            stateBytes,
            firstEntries,
            firstBytes,
          ] = (await redis.eval(
            `
            local firstEntries, firstBytes = 0, 0
            for i = 3, #KEYS do
              firstEntries = firstEntries + redis.call('HLEN', KEYS[i])
              firstBytes = firstBytes + (redis.call('MEMORY', 'USAGE', KEYS[i]) or 0)
            end
            return {
              redis.call('ZCARD', KEYS[1]), redis.call('HLEN', KEYS[2]),
              redis.call('MEMORY', 'USAGE', KEYS[1]) or 0,
              redis.call('MEMORY', 'USAGE', KEYS[2]) or 0,
              firstEntries, firstBytes
            }
          `,
            2 + firstKeys.length,
            keys.due,
            keys.state,
            ...firstKeys,
          )) as number[];
          return {
            shard,
            dueEntries,
            stateEntries,
            dueBytes,
            stateBytes,
            firstEntries,
            firstBytes,
          };
        },
      ),
    );
    const nodes = await Promise.all(
      redisNodes.map(async (node) => {
        const pingStarted = performance.now();
        await node.ping();
        const latencyMs = performance.now() - pingStarted;
        return {
          latencyMs,
          info: await node.info(),
          slowlog: await node.call("SLOWLOG", "GET", "10"),
          config: await node.config("GET", "maxmemory", "appendonly", "save"),
        };
      }),
    );
    samples.push({
      elapsedMs: Date.now() - started,
      cpu: process.cpuUsage(),
      ...process.memoryUsage(),
      loopP50Ms: loop.percentile(50) / 1e6,
      loopP99Ms: loop.percentile(99) / 1e6,
      admitted: ledger.size,
      lateSent,
      completedJobs,
      shards,
      nodes,
    });
    loop.reset();
  };
  const dispatch = async () => {
    const before = performance.now();
    await dispatcher.processBatch();
    dispatcherMs.push(performance.now() - before);
  };
  const track = async (projectId: string, entries: Entry[], late = false) => {
    const cpuBefore = process.cpuUsage();
    const before = performance.now();
    await trackTraceBatchActivity(
      projectId,
      entries.flatMap((entry) =>
        Array.from({ length: late ? 1 : eventsPerTrace }, (_, event) => ({
          traceId: entry.traceId,
          startTimeISO: new Date(
            entry.start + (late ? 600_000 : event),
          ).toISOString(),
          serializedEventBytes: 500,
        })),
      ),
    );
    const cpu = process.cpuUsage(cpuBefore);
    trackingCpuUs += cpu.user + cpu.system;
    trackingMs.push(performance.now() - before);
  };
  try {
    while (Date.now() - started < duration) {
      const expected = Math.floor(((Date.now() - started) * rate) / 1000);
      if (expected - sequence >= batchTraces) {
        const count = batchTraces;
        const batchIndex = Math.floor(sequence / batchTraces);
        const projectId =
          (batchIndex * 37) % 100 < skew * 100
            ? projectIds[0]!
            : projectIds[1 + (batchIndex % 100)]!;
        const entries: Entry[] = [];
        for (let n = 0; n < count; n++) {
          const id = sequence++;
          const entry: Entry = {
            projectId,
            traceId: randomUUID(),
            start: started + id,
            due: Date.now() + lateDelay,
            late: id % 1000 < lateFraction * 1000,
            seen: new Set(),
            initialDispatches: 0,
            lateDispatches: 0,
          };
          ledger.set(entry.traceId, entry);
          entries.push(entry);
          if (entry.late) delayed.push(entry);
        }
        await track(projectId, entries);
      }
      while (
        delayedOffset < delayed.length &&
        delayed[delayedOffset]!.due <= Date.now()
      ) {
        const entry = delayed[delayedOffset++]!;
        await track(entry.projectId, [entry], true);
        lateSent++;
      }
      const now = Date.now();
      if (
        now >= nextDispatch &&
        !(
          stallDuration &&
          now - started >= stallAt &&
          now - started < stallAt + stallDuration
        )
      ) {
        await dispatch();
        nextDispatch = Date.now() + dispatchInterval;
      }
      if (now >= nextSample) {
        await sample();
        nextSample = Date.now() + 10_000;
      }
      await sleep(10);
    }
    // Flush the final initial windows before sending their scheduled late events.
    await sleep(idle + 20);
    await dispatch();
    for (let attempt = 0; attempt < 100; attempt++) {
      const counts = await queue.getJobCounts("waiting", "active", "delayed");
      if (!counts.waiting && !counts.active && !counts.delayed) break;
      await sleep(100);
    }
    // Send the remaining scheduled late arrivals, then drain every pending window.
    while (delayedOffset < delayed.length) {
      const entry = delayed[delayedOffset++]!;
      await sleep(Math.max(0, entry.due - Date.now()));
      await track(entry.projectId, [entry], true);
      lateSent++;
    }
    await sleep(idle + 20);
    for (let attempt = 0; attempt < 100; attempt++) {
      await dispatch();
      const counts = await queue.getJobCounts("waiting", "active", "delayed");
      const missing = [...ledger.values()].some(
        (entry) =>
          !entry.initialDispatches || (entry.late && !entry.lateDispatches),
      );
      if (!missing && !counts.waiting && !counts.active && !counts.delayed)
        break;
      await sleep(100);
    }
    await sample();
    const percentile = (values: number[], fraction: number) =>
      [...values].sort((a, b) => a - b)[
        Math.max(0, Math.ceil(values.length * fraction) - 1)
      ] ?? 0;
    const lost = [...ledger.values()].filter(
      (entry) =>
        !entry.initialDispatches || (entry.late && !entry.lateDispatches),
    ).length;
    const extraDispatches = [...ledger.values()].reduce(
      (total, entry) =>
        total +
        Math.max(0, entry.initialDispatches - 1) +
        Math.max(0, entry.lateDispatches - (entry.late ? 1 : 0)),
      0,
    );
    const result = {
      parameters: values,
      shardCount: env.LANGFUSE_TRACE_BATCH_SHARD_COUNT,
      firstSeenTtlMs: env.LANGFUSE_TRACE_BATCH_FIRST_SEEN_TTL_MS,
      pendingTtlMs: env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS,
      prefix,
      hardware: {
        cpu: cpus()[0]?.model,
        cores: cpus().length,
        ramBytes: totalmem(),
      },
      elapsedMs: Date.now() - started,
      admitted: ledger.size,
      lateSent,
      completedJobs,
      lost,
      duplicates,
      extraDispatches,
      wrongEarliest,
      unknown,
      queueErrors,
      trackingCpuUpperBoundUs: trackingCpuUs,
      trackingCallP99Ms: percentile(trackingMs, 0.99),
      dispatcherP99Ms: percentile(dispatcherMs, 0.99),
      dispatcherMaxMs: Math.max(...dispatcherMs),
      samples,
    };
    await writeFile(`${values.output}.json`, JSON.stringify(result, null, 2));
    const columns = [
      "elapsedMs",
      "rss",
      "heapUsed",
      "loopP50Ms",
      "loopP99Ms",
      "admitted",
      "lateSent",
      "completedJobs",
      "cpu",
      "shards",
      "nodes",
    ];
    await writeFile(
      `${values.output}.csv`,
      [
        columns.join(","),
        ...samples.map((row) =>
          columns
            .map((column) => {
              const value =
                typeof row[column] === "object"
                  ? JSON.stringify(row[column])
                  : String(row[column]);
              return `"${value.replaceAll('"', '""')}"`;
            })
            .join(","),
        ),
      ].join("\n") + "\n",
    );
    console.log(JSON.stringify({ ...result, samples: undefined }, null, 2));
    if (
      lost ||
      duplicates ||
      extraDispatches ||
      wrongEarliest ||
      unknown ||
      queueErrors
    )
      process.exitCode = 1;
  } finally {
    loop.disable();
    await dispatcher.drain();
    await consumer.close();
    await queue.obliterate({ force: true });
    await queue.close();
    for (let shard = 0; shard < env.LANGFUSE_TRACE_BATCH_SHARD_COUNT; shard++) {
      const keys = getTraceBatchReadinessKeys(shard);
      await redis.del(
        keys.due,
        keys.state,
        ...getTraceBatchFirstKeys(shard, Date.now()).keys,
      );
    }
    await redis.quit();
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
