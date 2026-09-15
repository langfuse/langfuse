// Synthetic Redis-only benchmark. Never imports app configuration or DB clients.
// Usage: pnpm exec node scripts/benchmarks/trace-batch-redis.cjs <disposable-port>
// Requires an EMPTY, disposable local Redis. It creates and removes its own data.
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { createHash, randomUUID } = require("node:crypto");
const repo = path.resolve(__dirname, "../..");
const Redis = require(`${repo}/worker/node_modules/ioredis`);
const { Queue } = require(`${repo}/worker/node_modules/bullmq`);
const source = fs.readFileSync(
  `${repo}/worker/src/features/traces/traceBatching.ts`,
  "utf8",
);
const extract = (name) => {
  const match = source.match(
    new RegExp(`const ${name} = \x60([\\s\\S]*?)\x60;`),
  );
  if (!match) throw new Error(`Missing production script: ${name}`);
  return match[1];
};
const script = (name) =>
  extract(name)
    .replace("${EXPIRE_PENDING_SCRIPT}", extract("EXPIRE_PENDING_SCRIPT"))
    .replaceAll("${CHUNK_SIZE}", "1000");
const track = script("TRACK_SCRIPT"),
  snapshot = script("SNAPSHOT_SCRIPT");
const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Supply disposable local Redis port");
const connection = { host: "127.0.0.1", port, maxRetriesPerRequest: null };
const redis = new Redis(connection),
  probe = new Redis(connection);
const keys = ["loadtest:{trace-batch}:due", "loadtest:{trace-batch}:state"];
const retention = 7200000,
  idle = 300000;
const member = (i) =>
  JSON.stringify([
    `p${String(i % 10000).padStart(24, "0")}`,
    createHash("md5").update(String(i)).digest("hex"),
  ]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitForLazyFree() {
  const started = performance.now();
  while (
    Number(info(await redis.info("memory")).lazyfree_pending_objects) > 0
  ) {
    if (performance.now() - started > 30000)
      throw new Error("Background freeing timed out");
    await sleep(20);
  }
}
const info = (text) =>
  Object.fromEntries(
    text
      .split("\r\n")
      .filter((line) => line.includes(":"))
      .map((line) => {
        const split = line.indexOf(":");
        return [line.slice(0, split), line.slice(split + 1)];
      }),
  );
const cpu = async () => {
  const data = info(await redis.info("cpu"));
  return Number(data.used_cpu_sys) + Number(data.used_cpu_user);
};
const emit = (data) => console.log(JSON.stringify(data));
const percentile = (values, fraction) =>
  values.length
    ? [...values].sort((a, b) => a - b)[
        Math.floor((values.length - 1) * fraction)
      ]
    : null;
const stats = (values) => ({
  count: values.length,
  p50: percentile(values, 0.5),
  p95: percentile(values, 0.95),
  p99: percentile(values, 0.99),
  max: values.length ? Math.max(...values) : null,
});
async function measured(name, fn) {
  const pings = [];
  let active = true;
  const loop = (async () => {
    while (active) {
      const start = performance.now();
      await probe.ping();
      pings.push(performance.now() - start);
      await sleep(2);
    }
  })();
  const before = await cpu(),
    start = performance.now();
  let result;
  try {
    result = await fn();
  } finally {
    active = false;
    await loop;
  }
  const elapsedMs = performance.now() - start,
    cpuMs = ((await cpu()) - before) * 1000;
  emit({
    name,
    ...result,
    elapsedMs,
    redisCpuMs: cpuMs,
    redisCpuPercentOfOneCore: (cpuMs / elapsedMs) * 100,
    pingMs: stats(pings),
  });
}
async function memory(name) {
  const data = info(await redis.info("memory"));
  emit({
    name,
    traces: await redis.zcard(keys[0]),
    hashEntries: await redis.hlen(keys[1]),
    dueBytes: await redis.memory("USAGE", keys[0]),
    stateBytes: await redis.memory("USAGE", keys[1]),
    usedBytes: Number(data.used_memory),
    rssBytes: Number(data.used_memory_rss),
    peakBytes: Number(data.used_memory_peak),
    dueTtlMs: await redis.pttl(keys[0]),
    stateTtlMs: await redis.pttl(keys[1]),
  });
}
const argsFor = (id, observation = 0) => [
  member(id),
  1789470000000 + observation * 1000,
  1789470000000 + observation * 1000,
  randomUUID(),
];
async function fill(from, to) {
  await measured(`fill-${from}-${to}`, async () => {
    const latencies = [];
    for (let offset = from; offset < to; offset += 1000) {
      const count = Math.min(1000, to - offset);
      for (let observation = 0; observation < 2; observation++) {
        const args = Array.from({ length: count }, (_, i) =>
          argsFor(offset + i, observation),
        ).flat();
        const start = performance.now();
        await redis.eval(track, 2, ...keys, idle, retention, ...args);
        latencies.push(performance.now() - start);
      }
    }
    return {
      events: (to - from) * 2,
      tracesAdded: to - from,
      maxTracesPerCall: 1000,
      callMs: stats(latencies),
    };
  });
  await memory(`memory-${to}`);
}
async function paced(eventsPerSecond, seconds, base) {
  let sent = 0;
  await measured(`paced-${eventsPerSecond}`, async () => {
    const start = performance.now(),
      latency = [];
    while (performance.now() - start < seconds * 1000) {
      await sleep(Math.max(0, 10 - ((performance.now() - start) % 10)));
      const target = Math.min(
        eventsPerSecond * seconds,
        Math.floor(((performance.now() - start) / 1000) * eventsPerSecond),
      );
      // Simulate independent producer calls: one Lua EVAL per observation.
      // A small pipeline supplies concurrency without a per-client RTT ceiling.
      const pipeline = redis.pipeline();
      for (; sent < target; sent++)
        pipeline.eval(
          track,
          2,
          ...keys,
          idle,
          retention,
          ...argsFor(base + Math.floor(sent / 2), sent % 2),
        );
      const callStart = performance.now();
      for (const [error] of await pipeline.exec()) if (error) throw error;
      latency.push(performance.now() - callStart);
    }
    return {
      requestedEventsPerSecond: eventsPerSecond,
      events: sent,
      achievedEventsPerSecond: sent / ((performance.now() - start) / 1000),
      traces: Math.ceil(sent / 2),
      pipelineMs: stats(latency),
    };
  });
  // Remove only this phase's synthetic IDs, keeping the preload cardinality.
  for (let offset = 0; offset < Math.ceil(sent / 2); offset += 1000) {
    const ids = Array.from(
      { length: Math.min(1000, Math.ceil(sent / 2) - offset) },
      (_, i) => member(base + offset + i),
    );
    const replies = await redis
      .pipeline()
      .zrem(keys[0], ...ids)
      .hdel(keys[1], ...ids)
      .exec();
    for (const [error] of replies) if (error) throw error;
  }
}
async function rangeRead(count) {
  await measured(`range-${count}`, async () => {
    const cutoff = Date.now() + idle + 1000;
    const rows = await redis.zrange(
      keys[0],
      `(${cutoff - retention}`,
      cutoff,
      "BYSCORE",
      "LIMIT",
      0,
      count,
    );
    if (rows.length !== count) throw new Error("Range cardinality mismatch");
    return {
      members: rows.length,
      memberBytes: rows.reduce((sum, row) => sum + Buffer.byteLength(row), 0),
    };
  });
  // LIMIT 0 models the first N ready IDs; production has no LIMIT.
}
async function queueStorage(cap) {
  const queue = new Queue(`trace-batch-${cap}`, {
    connection,
    prefix: "loadtest:{queue}",
    defaultJobOptions: {
      removeOnComplete: { age: 3600, count: 10000 },
      removeOnFail: 1000,
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
    },
  });
  try {
    await queue.waitUntilReady();
    const before = Number(info(await redis.info("memory")).used_memory);
    await measured(`queue-${cap}`, async () => {
      for (let offset = 0; offset < 120000; offset += cap) {
        const traces = Array.from({ length: cap }, (_, i) => {
          const [projectId, traceId] = JSON.parse(member(offset + i));
          return {
            projectId,
            traceId,
            minStart: 1789470000000,
            maxStart: 1789470001000,
            revision: randomUUID(),
          };
        });
        const id = createHash("sha256")
          .update(JSON.stringify(traces))
          .digest("hex");
        await queue.add(
          "trace-batch",
          {
            id,
            timestamp: new Date(),
            name: "trace-batch",
            payload: { traces },
          },
          { jobId: id },
        );
      }
      const after = Number(info(await redis.info("memory")).used_memory);
      return {
        cap,
        traces: 120000,
        jobs: await queue.count(),
        allocatedBytes: after - before,
        bytesPerTrace: (after - before) / 120000,
      };
    });
  } finally {
    await queue.obliterate({ force: true });
    await queue.close();
    await waitForLazyFree();
  }
}
(async () => {
  try {
    if ((await redis.dbsize()) !== 0)
      throw new Error(
        "Refusing nonempty Redis: use a new disposable container",
      );
    emit({
      name: "environment",
      node: process.version,
      redis: info(await redis.info("server")).redis_version,
      valkey: info(await redis.info("server")).valkey_version ?? null,
      sourceSha256: createHash("sha256").update(source).digest("hex"),
      projectIdLength: 25,
      traceIdLength: 32,
      revisionLength: 36,
      observationsPerTrace: 2,
      idleMs: idle,
      retentionMs: retention,
      persistence: "disabled by disposable container command",
      client: "host to Docker loopback",
    });
    await measured("idle-baseline", async () => {
      await sleep(5000);
      return {};
    });
    await memory("empty");
    await fill(0, 100000);
    await fill(100000, 1000000);
    for (const [rate, seconds] of [
      [695, 30],
      [1852, 30],
      [18520, 10],
    ])
      await paced(rate, seconds, 10000000);
    await fill(1000000, 2500000);
    await fill(2500000, 6944445);
    await paced(1852, 30, 10000000);
    for (const size of [27778, 1000000, 6944445]) await rangeRead(size);
    // Cleanup workload: age only the due score of 100k known fixture members.
    // State shape and production cleanup script remain unchanged.
    for (let offset = 0; offset < 100000; offset += 1000) {
      await redis.zadd(
        keys[0],
        ...Array.from({ length: 1000 }, (_, i) => [
          Date.now() - retention - 1000,
          member(offset + i),
        ]).flat(),
      );
    }
    await measured("expire-100000", async () => {
      let removed = 0,
        calls = 0;
      while (removed < 100000) {
        const result = await redis.eval(snapshot, 2, ...keys, retention, "");
        removed += Number(result[5]);
        calls++;
        if (calls > 101) throw new Error("Cleanup cardinality mismatch");
      }
      return { removed, calls };
    });
    // Test native whole-key expiration on the fully populated map using a short
    // experimental TTL; this advances time without a two-hour benchmark wait.
    await measured("native-expiry-large-map", async () => {
      const started = performance.now();
      await redis.pexpire(keys[0], 100);
      await redis.pexpire(keys[1], 100);
      await sleep(200);
      const remaining = await redis.exists(...keys);
      if (remaining) throw new Error("Native expiry failed");
      const keysInvisibleMs = performance.now() - started;
      await waitForLazyFree();
      return {
        expiredTraces: 6844445,
        remainingKeys: remaining,
        keysInvisibleMs,
        lazyfreeLazyExpire: await redis.config("GET", "lazyfree-lazy-expire"),
      };
    });
    for (const cap of [60, 120, 1000, 10000]) await queueStorage(cap);
    emit({ name: "complete", remainingKeys: await redis.dbsize() });
  } finally {
    await redis.quit();
    await probe.quit();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
