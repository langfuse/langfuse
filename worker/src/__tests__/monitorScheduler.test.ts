import { expect, describe, it, afterEach, beforeEach } from "vitest";
import { Queue } from "bullmq";
import {
  createOrgProjectAndApiKey,
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
  redis,
  QueueName,
  QueueJobs,
  TQueueJobTypes,
  MonitorScheduler,
} from "@langfuse/shared/src/server";
import type { MonitorQueueEvent } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  MonitorSchedulerRunner,
  MONITOR_SCHEDULER_LOCK_PREFIX,
} from "../features/monitor-scheduler";

const MINUTE_MS = 60 * 1000;

type SeedOverrides = Partial<{
  id: string;
  projectId: string;
  schedulerBatchId: bigint;
  windowMs: bigint;
  cadenceMs: bigint;
  nextRunAt: Date;
  lastPublishedRunAt: Date | null;
  lastCompletedRunAt: Date | null;
  status: "ACTIVE" | "PAUSED" | "ERROR_BAD_QUERY";
  view: "OBSERVATIONS" | "SCORES_NUMERIC" | "SCORES_CATEGORICAL";
  filters: unknown;
  metric: { measure: string; aggregation: string };
  alertThreshold: number;
}>;

async function seedMonitor(projectId: string, overrides: SeedOverrides = {}) {
  const id =
    overrides.id ??
    `mon_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
  return prisma.monitor.create({
    data: {
      id,
      projectId,
      view: overrides.view ?? "OBSERVATIONS",
      filters: (overrides.filters as object) ?? [],
      metric: overrides.metric ?? { measure: "count", aggregation: "count" },
      windowMs: overrides.windowMs ?? BigInt(5 * MINUTE_MS),
      cadenceMs: overrides.cadenceMs ?? BigInt(MINUTE_MS),
      thresholdOperator: "GT",
      alertThreshold: overrides.alertThreshold ?? 100,
      noData: { mode: "SILENT" },
      renotify: { mode: "OFF" },
      name: "Test Monitor",
      message: "",
      tags: [],
      status: overrides.status ?? "ACTIVE",
      schedulerBatchId: overrides.schedulerBatchId ?? 0n,
      nextRunAt: overrides.nextRunAt ?? new Date(Date.now() - 1000),
      lastPublishedRunAt: overrides.lastPublishedRunAt ?? null,
      lastCompletedRunAt: overrides.lastCompletedRunAt ?? null,
    },
  });
}

async function withIsolatedMonitorQueue<T>(
  fn: (queue: Queue<TQueueJobTypes[QueueName.MonitorQueue]>) => Promise<T>,
): Promise<T> {
  const queueName = `${QueueName.MonitorQueue}-test-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  const conn = createNewRedisInstance({
    enableOfflineQueue: false,
    ...redisQueueRetryOptions,
  });
  if (!conn) throw new Error("Redis is not initialized");

  const queue = new Queue<TQueueJobTypes[QueueName.MonitorQueue]>(queueName, {
    connection: conn,
    prefix: getQueuePrefix(queueName),
  });

  try {
    return await fn(queue);
  } finally {
    try {
      await queue.obliterate({ force: true });
    } finally {
      try {
        await queue.close();
      } finally {
        conn.disconnect();
      }
    }
  }
}

function fakePublisher() {
  const events: MonitorQueueEvent[] = [];
  return {
    events,
    publish: async (es: MonitorQueueEvent[]) => {
      events.push(...es);
    },
  };
}

describe("MonitorScheduler.tick", () => {
  let projectId: string;

  beforeEach(async () => {
    ({ projectId } = await createOrgProjectAndApiKey());
  });

  afterEach(async () => {
    await prisma.monitor.deleteMany({ where: { projectId } });
  });

  it("publishes one event per schedulerBatchId and groups monitors by id", async () => {
    const tick = new Date();
    const past = new Date(tick.getTime() - 1000);

    // Three monitors in batch A (one shared metric for two of them, one different)
    await seedMonitor(projectId, {
      id: "mon_a3",
      schedulerBatchId: 100n,
      nextRunAt: past,
      metric: { measure: "count", aggregation: "count" },
    });
    await seedMonitor(projectId, {
      id: "mon_a1",
      schedulerBatchId: 100n,
      nextRunAt: past,
      metric: { measure: "count", aggregation: "count" },
    });
    await seedMonitor(projectId, {
      id: "mon_a2",
      schedulerBatchId: 100n,
      nextRunAt: past,
      metric: { measure: "value", aggregation: "avg" },
    });
    // One monitor in batch B
    await seedMonitor(projectId, {
      id: "mon_b1",
      schedulerBatchId: 200n,
      nextRunAt: past,
      metric: { measure: "value", aggregation: "p95" },
    });

    const pub = fakePublisher();
    const scheduler = new MonitorScheduler({
      schedulerId: 0,
      totalSchedulers: 1,
      db: prisma,
      publish: pub.publish,
    });

    const published = await scheduler.tick(tick);
    expect(published).toBe(2);
    expect(pub.events).toHaveLength(2);

    const byBatch = new Map(pub.events.map((e) => [e.schedulerBatchId, e]));
    const batchA = byBatch.get(100n);
    const batchB = byBatch.get(200n);
    expect(batchA).toBeDefined();
    expect(batchB).toBeDefined();

    expect(batchA?.monitors.map((m) => m.monitorId)).toEqual([
      "mon_a1",
      "mon_a2",
      "mon_a3",
    ]);
    expect(batchA?.monitors.map((m) => m.metricName).sort()).toEqual(
      ["avg_value", "count_count", "count_count"].sort(),
    );
    expect(batchA?.metrics).toHaveLength(2);
    expect(batchA?.view).toBe("OBSERVATIONS");
    expect(batchA?.window).toBe(BigInt(5 * MINUTE_MS));

    expect(batchB?.monitors).toHaveLength(1);
    expect(batchB?.monitors[0]).toEqual({
      monitorId: "mon_b1",
      metricName: "p95_value",
    });
  });

  it("advances nextRunAt for inactive monitors but never publishes them", async () => {
    const tick = new Date();
    const past = new Date(tick.getTime() - 5000);
    const inactive = await seedMonitor(projectId, {
      id: "mon_paused",
      schedulerBatchId: 1n,
      status: "PAUSED",
      nextRunAt: past,
      cadenceMs: BigInt(MINUTE_MS),
    });

    const pub = fakePublisher();
    const scheduler = new MonitorScheduler({
      schedulerId: 0,
      totalSchedulers: 1,
      db: prisma,
      publish: pub.publish,
    });

    const published = await scheduler.tick(tick);
    expect(published).toBe(0);
    expect(pub.events).toHaveLength(0);

    const after = await prisma.monitor.findUniqueOrThrow({
      where: { id: inactive.id },
    });
    expect(after.lastPublishedRunAt).toBeNull();
    expect(after.nextRunAt.getTime()).toBe(past.getTime() + MINUTE_MS);
  });

  it("re-publishes pending monitors past the 5-minute TTL", async () => {
    const tick = new Date();
    const past = new Date(tick.getTime() - 1000);
    const sixMinAgo = new Date(tick.getTime() - 6 * MINUTE_MS);

    await seedMonitor(projectId, {
      id: "mon_stuck",
      schedulerBatchId: 7n,
      nextRunAt: past,
      lastPublishedRunAt: sixMinAgo,
      lastCompletedRunAt: null,
    });

    const pub = fakePublisher();
    const scheduler = new MonitorScheduler({
      schedulerId: 0,
      totalSchedulers: 1,
      db: prisma,
      publish: pub.publish,
    });

    const published = await scheduler.tick(tick);
    expect(published).toBe(1);
    expect(pub.events[0]?.monitors[0]?.monitorId).toBe("mon_stuck");
  });

  it("skips pending monitors still within the 5-minute TTL", async () => {
    const tick = new Date();
    const past = new Date(tick.getTime() - 1000);
    const twoMinAgo = new Date(tick.getTime() - 2 * MINUTE_MS);

    const m = await seedMonitor(projectId, {
      id: "mon_recent_pending",
      schedulerBatchId: 8n,
      nextRunAt: past,
      lastPublishedRunAt: twoMinAgo,
      lastCompletedRunAt: null,
    });

    const pub = fakePublisher();
    const scheduler = new MonitorScheduler({
      schedulerId: 0,
      totalSchedulers: 1,
      db: prisma,
      publish: pub.publish,
    });

    const published = await scheduler.tick(tick);
    expect(published).toBe(0);

    const after = await prisma.monitor.findUniqueOrThrow({
      where: { id: m.id },
    });
    expect(after.nextRunAt.getTime()).toBe(past.getTime() + MINUTE_MS);
    expect(after.lastPublishedRunAt?.getTime()).toBe(twoMinAgo.getTime());
  });

  it("only claims monitors whose schedulerBatchId % totalSchedulers matches schedulerId", async () => {
    const tick = new Date();
    const past = new Date(tick.getTime() - 1000);

    await seedMonitor(projectId, {
      id: "mon_slot0_a",
      schedulerBatchId: 0n,
      nextRunAt: past,
    });
    await seedMonitor(projectId, {
      id: "mon_slot0_b",
      schedulerBatchId: 2n,
      nextRunAt: past,
    });
    await seedMonitor(projectId, {
      id: "mon_slot1",
      schedulerBatchId: 1n,
      nextRunAt: past,
    });

    const pub = fakePublisher();
    const scheduler = new MonitorScheduler({
      schedulerId: 0,
      totalSchedulers: 2,
      db: prisma,
      publish: pub.publish,
    });

    const published = await scheduler.tick(tick);
    expect(published).toBe(2);
    const ids = pub.events.flatMap((e) => e.monitors.map((m) => m.monitorId));
    expect(ids.sort()).toEqual(["mon_slot0_a", "mon_slot0_b"]);

    const slot1 = await prisma.monitor.findUniqueOrThrow({
      where: { id: "mon_slot1" },
    });
    expect(slot1.nextRunAt.getTime()).toBe(past.getTime()); // untouched
  });

  it("threads all required fields onto the MonitorQueueEvent payload", async () => {
    const tick = new Date(Date.UTC(2026, 4, 18, 12, 0, 0));
    const past = new Date(tick.getTime() - 1000);
    const filters = [
      { column: "level", operator: "=", value: "ERROR", type: "string" },
    ];

    await seedMonitor(projectId, {
      id: "mon_threaded",
      schedulerBatchId: 999n,
      nextRunAt: past,
      view: "SCORES_NUMERIC",
      filters,
      windowMs: BigInt(15 * MINUTE_MS),
      metric: { measure: "value", aggregation: "p95" },
    });

    const pub = fakePublisher();
    const scheduler = new MonitorScheduler({
      schedulerId: 0,
      totalSchedulers: 1,
      db: prisma,
      publish: pub.publish,
    });

    await scheduler.tick(tick);
    expect(pub.events).toHaveLength(1);
    const event = pub.events[0]!;
    expect(event.projectId).toBe(projectId);
    expect(event.schedulerBatchId).toBe(999n);
    expect(event.scheduledAt.getTime()).toBe(past.getTime()); // echoes original next_run_at
    expect(event.view).toBe("SCORES_NUMERIC");
    expect(event.filters).toEqual(filters);
    expect(event.window).toBe(BigInt(15 * MINUTE_MS));
    expect(event.metrics).toEqual([{ measure: "value", aggregation: "p95" }]);
    expect(event.monitors[0]?.metricName).toBe("p95_value");
  });

  it("publishes to the real MonitorQueue with a deterministic jobId so repeat ticks dedupe", async () => {
    const tick = new Date();
    const past = new Date(tick.getTime() - 1000);

    await seedMonitor(projectId, {
      id: "mon_dedupe",
      schedulerBatchId: 42n,
      nextRunAt: past,
      lastPublishedRunAt: new Date(tick.getTime() - 6 * MINUTE_MS), // republishable
      lastCompletedRunAt: null,
    });

    await withIsolatedMonitorQueue(async (queue) => {
      const publish = async (events: MonitorQueueEvent[]) => {
        await queue.addBulk(
          events.map((event) => {
            const jobId = `${event.schedulerBatchId}-${event.scheduledAt.getTime()}`;
            // BullMQ JSON-encodes payloads; serialize bigints to strings on
            // the wire (the schema's z.coerce.bigint() reparses them on read).
            const wire: MonitorQueueEvent = {
              ...event,
              schedulerBatchId:
                event.schedulerBatchId.toString() as unknown as bigint,
              window: event.window.toString() as unknown as bigint,
            };
            return {
              name: QueueJobs.MonitorJob,
              data: {
                timestamp: new Date(),
                id: jobId,
                payload: wire,
                name: QueueJobs.MonitorJob,
              },
              opts: { jobId },
            };
          }),
        );
      };

      const scheduler = new MonitorScheduler({
        schedulerId: 0,
        totalSchedulers: 1,
        db: prisma,
        publish,
      });

      // First tick — publishes 1 event
      await scheduler.tick(tick);
      // Reset monitor row so a second tick would publish the same scheduledAt again
      await prisma.monitor.update({
        where: { id: "mon_dedupe" },
        data: {
          nextRunAt: past,
          lastPublishedRunAt: new Date(tick.getTime() - 6 * MINUTE_MS),
          lastCompletedRunAt: null,
        },
      });
      await scheduler.tick(tick);

      const counts = await queue.getJobCounts(
        "waiting",
        "delayed",
        "active",
        "completed",
        "failed",
      );
      const total =
        counts.waiting +
        counts.delayed +
        counts.active +
        counts.completed +
        counts.failed;
      expect(total).toBe(1); // dedupe via jobId
    });
  });
});

describe("MonitorSchedulerRunner", () => {
  afterEach(async () => {
    if (redis) {
      const keys = await redis.keys(`${MONITOR_SCHEDULER_LOCK_PREFIX}:*`);
      if (keys.length > 0) await redis.del(...keys);
    }
  });

  it("two runners sharing a schedulerId — exactly one acquires the lock when contended", async () => {
    if (!redis) throw new Error("Redis not initialized");

    // Pre-acquire the lock to simulate another live runner holding the slot.
    // Without this, both calls run in rapid succession (lock releases between
    // ticks) and both appear to "win" — the lock guarantees mutual exclusion
    // during a tick, not across release boundaries.
    const lockKey = `${MONITOR_SCHEDULER_LOCK_PREFIX}:0`;
    await redis.set(lockKey, "external-holder", "EX", 30, "NX");

    const runner = new MonitorSchedulerRunner(0, 1);
    const result = await runner.processBatch();
    expect(result).toBeUndefined(); // lock denied → scheduler did not run

    // Release the lock; a follow-up call now succeeds, returning the number of
    // published events (0 because no monitors are seeded).
    await redis.del(lockKey);
    const second = await runner.processBatch();
    expect(typeof second).toBe("number");
  });
});
