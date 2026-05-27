import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import {
  MonitorScheduler,
  type MonitorQueueEvent,
} from "@langfuse/shared/monitors/server";
import { prisma } from "@langfuse/shared/src/db";
import type { Prisma } from "@prisma/client";

type MonitorStatus = "ACTIVE" | "PAUSED" | "ERROR_BAD_QUERY";
type MonitorView = "OBSERVATIONS" | "SCORES_NUMERIC" | "SCORES_CATEGORICAL";

type SeedOverrides = Partial<{
  id: string;
  schedulerBatchId: bigint;
  cadenceMs: bigint;
  windowMs: bigint;
  nextRunAt: Date | null;
  lastPublishedAt: Date | null;
  lastCompletedAt: Date | null;
  status: MonitorStatus;
  view: MonitorView;
  metric: { measure: string; aggregation: string };
}>;

type MonitorSeed = { id: string } & SeedOverrides;

type ExpectedEvent = {
  schedulerBatchId: bigint;
  runAt: Date;
  monitorIds: string[];
};

type ExpectedRow = {
  id: string;
  nextRunAt: Date | null;
  lastPublishedAt: Date | null;
  lastCompletedAt: Date | null;
};

type SchedulerCase = {
  name: string;
  scheduler?: { id: number; total: number };
  tick: Date;
  monitors: MonitorSeed[];
  expect: { events: ExpectedEvent[]; rows: ExpectedRow[] };
};

const oneMinuteMs = 60n * 1000n;

// Scheduler times
const now = new Date("2026-05-27T12:00:30.000Z");
const twoMinutesAgo = new Date("2026-05-27T11:58:30.000Z");
const threeMinutesAgo = new Date("2026-05-27T11:57:30.000Z");
const tenMinutesAgo = new Date("2026-05-27T11:50:30.000Z");
const oneMinuteFromNow = new Date("2026-05-27T12:01:30.000Z");

// Cadence-aligned boundaries (cadence=1m), offset by (batchId % 60) seconds.
const prevCadence = new Date("2026-05-27T12:00:00.000Z");
const nextCadence = new Date("2026-05-27T12:01:00.000Z");
const nextCadenceBatch1 = new Date("2026-05-27T12:01:01.000Z");
const nextCadenceBatch2 = new Date("2026-05-27T12:01:02.000Z");
const nextCadenceBatch5 = new Date("2026-05-27T12:01:05.000Z");
const nextCadenceBatch7 = new Date("2026-05-27T12:01:07.000Z");

async function seedMonitor(projectId: string, seed: MonitorSeed) {
  return prisma.monitor.create({
    data: {
      id: seed.id,
      projectId,
      view: seed.view ?? "OBSERVATIONS",
      filters: [] as unknown as Prisma.InputJsonValue,
      metric: (seed.metric ?? {
        measure: "count",
        aggregation: "count",
      }) as unknown as Prisma.InputJsonValue,
      windowMs: seed.windowMs ?? 5n * oneMinuteMs,
      cadenceMs: seed.cadenceMs ?? oneMinuteMs,
      thresholdOperator: "GT",
      alertThreshold: 100,
      warningThreshold: null,
      noData: { mode: "SILENT" } as unknown as Prisma.InputJsonValue,
      renotify: { mode: "OFF" } as unknown as Prisma.InputJsonValue,
      status: seed.status ?? "ACTIVE",
      schedulerBatchId: seed.schedulerBatchId ?? 0n,
      nextRunAt: seed.nextRunAt === undefined ? null : seed.nextRunAt,
      lastPublishedAt: seed.lastPublishedAt ?? null,
      lastCompletedAt: seed.lastCompletedAt ?? null,
      name: `Test ${seed.id}`,
      tags: [],
    },
  });
}

function makeScheduler(
  publish: (events: MonitorQueueEvent[]) => Promise<void>,
  shard: { id: number; total: number } = { id: 0, total: 1 },
) {
  return new MonitorScheduler({
    schedulerId: shard.id,
    totalSchedulers: shard.total,
    db: prisma,
    publish,
  });
}

const cases: SchedulerCase[] = [
  {
    name: "no monitors on the system: schedule returns 0, publish not called",
    tick: now,
    monitors: [],
    expect: { events: [], rows: [] },
  },
  {
    name: "all monitors ahead: every row filtered by WHERE, nothing published or advanced",
    tick: now,
    monitors: [
      { id: "m_ahead_a", nextRunAt: oneMinuteFromNow },
      { id: "m_ahead_b", nextRunAt: oneMinuteFromNow },
    ],
    expect: {
      events: [],
      rows: [
        {
          id: "m_ahead_a",
          nextRunAt: oneMinuteFromNow,
          lastPublishedAt: null,
          lastCompletedAt: null,
        },
        {
          id: "m_ahead_b",
          nextRunAt: oneMinuteFromNow,
          lastPublishedAt: null,
          lastCompletedAt: null,
        },
      ],
    },
  },
  {
    name: "new monitor: publishes at tick, advances to next boundary",
    tick: now,
    monitors: [{ id: "m_new", nextRunAt: null }],
    expect: {
      events: [{ schedulerBatchId: 0n, runAt: now, monitorIds: ["m_new"] }],
      rows: [
        {
          id: "m_new",
          nextRunAt: nextCadence,
          lastPublishedAt: now,
          lastCompletedAt: null,
        },
      ],
    },
  },
  {
    name: "behind monitor: publishes at prior next_run_at, advances",
    tick: now,
    monitors: [{ id: "m_behind", nextRunAt: prevCadence }],
    expect: {
      events: [
        {
          schedulerBatchId: 0n,
          runAt: prevCadence,
          monitorIds: ["m_behind"],
        },
      ],
      rows: [
        {
          id: "m_behind",
          nextRunAt: nextCadence,
          lastPublishedAt: prevCadence,
          lastCompletedAt: null,
        },
      ],
    },
  },
  {
    name: "in-flight + last_completed=NULL within TTL: not published, advanced",
    tick: now,
    monitors: [
      {
        id: "m_pending",
        nextRunAt: prevCadence,
        lastPublishedAt: twoMinutesAgo,
        lastCompletedAt: null,
      },
    ],
    expect: {
      events: [],
      rows: [
        {
          id: "m_pending",
          nextRunAt: nextCadence,
          lastPublishedAt: twoMinutesAgo,
          lastCompletedAt: null,
        },
      ],
    },
  },
  {
    name: "in-flight + completed-before-published within TTL: not published, advanced",
    tick: now,
    monitors: [
      {
        id: "m_inflight_completed",
        nextRunAt: prevCadence,
        lastPublishedAt: twoMinutesAgo,
        lastCompletedAt: threeMinutesAgo,
      },
    ],
    expect: {
      events: [],
      rows: [
        {
          id: "m_inflight_completed",
          nextRunAt: nextCadence,
          lastPublishedAt: twoMinutesAgo,
          lastCompletedAt: threeMinutesAgo,
        },
      ],
    },
  },
  {
    name: "in-flight past TTL: republishes (rescue), advances",
    tick: now,
    monitors: [
      {
        id: "m_stuck",
        nextRunAt: prevCadence,
        lastPublishedAt: tenMinutesAgo,
        lastCompletedAt: null,
      },
    ],
    expect: {
      events: [
        {
          schedulerBatchId: 0n,
          runAt: prevCadence,
          monitorIds: ["m_stuck"],
        },
      ],
      rows: [
        {
          id: "m_stuck",
          nextRunAt: nextCadence,
          lastPublishedAt: prevCadence,
          lastCompletedAt: null,
        },
      ],
    },
  },
  {
    name: "very behind: catches up to next boundary, skips intermediates",
    tick: now,
    monitors: [{ id: "m_far_behind", nextRunAt: tenMinutesAgo }],
    expect: {
      events: [
        {
          schedulerBatchId: 0n,
          runAt: tenMinutesAgo,
          monitorIds: ["m_far_behind"],
        },
      ],
      rows: [
        {
          id: "m_far_behind",
          nextRunAt: nextCadence,
          lastPublishedAt: tenMinutesAgo,
          lastCompletedAt: null,
        },
      ],
    },
  },
  {
    name: "paused monitor: untouched",
    tick: now,
    monitors: [
      {
        id: "m_paused",
        status: "PAUSED",
        nextRunAt: prevCadence,
      },
    ],
    expect: {
      events: [],
      rows: [
        {
          id: "m_paused",
          nextRunAt: prevCadence,
          lastPublishedAt: null,
          lastCompletedAt: null,
        },
      ],
    },
  },
  {
    name: "error monitor: untouched",
    tick: now,
    monitors: [
      {
        id: "m_error",
        status: "ERROR_BAD_QUERY",
        nextRunAt: prevCadence,
      },
    ],
    expect: {
      events: [],
      rows: [
        {
          id: "m_error",
          nextRunAt: prevCadence,
          lastPublishedAt: null,
          lastCompletedAt: null,
        },
      ],
    },
  },
  {
    name: "multi-monitor batch: one event, both monitors, deduped metrics",
    tick: now,
    monitors: [
      {
        id: "m_a",
        schedulerBatchId: 7n,
        nextRunAt: prevCadence,
        metric: { measure: "count", aggregation: "count" },
      },
      {
        id: "m_b",
        schedulerBatchId: 7n,
        nextRunAt: prevCadence,
        metric: { measure: "latency", aggregation: "p95" },
      },
    ],
    expect: {
      events: [
        {
          schedulerBatchId: 7n,
          runAt: prevCadence,
          monitorIds: ["m_a", "m_b"],
        },
      ],
      rows: [
        {
          id: "m_a",
          nextRunAt: nextCadenceBatch7,
          lastPublishedAt: prevCadence,
          lastCompletedAt: null,
        },
        {
          id: "m_b",
          nextRunAt: nextCadenceBatch7,
          lastPublishedAt: prevCadence,
          lastCompletedAt: null,
        },
      ],
    },
  },
  {
    name: "5 monitors batched into 2 events (batching + ordering)",
    tick: now,
    monitors: [
      { id: "m_a1", schedulerBatchId: 1n, nextRunAt: twoMinutesAgo },
      { id: "m_a2", schedulerBatchId: 1n, nextRunAt: twoMinutesAgo },
      { id: "m_a3", schedulerBatchId: 1n, nextRunAt: twoMinutesAgo },
      { id: "m_b1", schedulerBatchId: 2n, nextRunAt: tenMinutesAgo },
      { id: "m_b2", schedulerBatchId: 2n, nextRunAt: tenMinutesAgo },
    ],
    expect: {
      events: [
        {
          schedulerBatchId: 2n,
          runAt: tenMinutesAgo,
          monitorIds: ["m_b1", "m_b2"],
        },
        {
          schedulerBatchId: 1n,
          runAt: twoMinutesAgo,
          monitorIds: ["m_a1", "m_a2", "m_a3"],
        },
      ],
      rows: [
        {
          id: "m_a1",
          nextRunAt: nextCadenceBatch1,
          lastPublishedAt: twoMinutesAgo,
          lastCompletedAt: null,
        },
        {
          id: "m_a2",
          nextRunAt: nextCadenceBatch1,
          lastPublishedAt: twoMinutesAgo,
          lastCompletedAt: null,
        },
        {
          id: "m_a3",
          nextRunAt: nextCadenceBatch1,
          lastPublishedAt: twoMinutesAgo,
          lastCompletedAt: null,
        },
        {
          id: "m_b1",
          nextRunAt: nextCadenceBatch2,
          lastPublishedAt: tenMinutesAgo,
          lastCompletedAt: null,
        },
        {
          id: "m_b2",
          nextRunAt: nextCadenceBatch2,
          lastPublishedAt: tenMinutesAgo,
          lastCompletedAt: null,
        },
      ],
    },
  },
  {
    name: "sharding: only this scheduler's slot is claimed",
    scheduler: { id: 1, total: 4 },
    tick: now,
    monitors: [
      { id: "m_in", schedulerBatchId: 5n, nextRunAt: prevCadence },
      { id: "m_out", schedulerBatchId: 4n, nextRunAt: prevCadence },
    ],
    expect: {
      events: [
        {
          schedulerBatchId: 5n,
          runAt: prevCadence,
          monitorIds: ["m_in"],
        },
      ],
      rows: [
        {
          id: "m_in",
          nextRunAt: nextCadenceBatch5,
          lastPublishedAt: prevCadence,
          lastCompletedAt: null,
        },
        {
          id: "m_out",
          nextRunAt: prevCadence,
          lastPublishedAt: null,
          lastCompletedAt: null,
        },
      ],
    },
  },
];

describe("MonitorScheduler (integration)", () => {
  let projectId: string;

  beforeAll(async () => {
    const org = await createOrgProjectAndApiKey();
    projectId = org.projectId;
  });

  afterEach(async () => {
    await prisma.monitor.deleteMany({ where: { projectId } });
  });

  it.each(cases)("$name", async (c) => {
    for (const m of c.monitors) {
      await seedMonitor(projectId, m);
    }

    const publish = vi.fn<(events: MonitorQueueEvent[]) => Promise<void>>();
    await makeScheduler(publish, c.scheduler).schedule(c.tick);

    if (c.expect.events.length === 0) {
      expect(publish).not.toHaveBeenCalled();
    } else {
      expect(publish).toHaveBeenCalledTimes(1);
      const events = publish.mock.calls[0][0];
      expect(events).toHaveLength(c.expect.events.length);
      events.forEach((event, i) => {
        const exp = c.expect.events[i];
        expect(event.schedulerBatchId).toBe(exp.schedulerBatchId);
        expect(event.runAt.toISOString()).toBe(exp.runAt.toISOString());
        expect(event.monitors.map((m) => m.monitorId).sort()).toEqual(
          [...exp.monitorIds].sort(),
        );
      });
    }

    for (const exp of c.expect.rows) {
      const row = await prisma.monitor.findUniqueOrThrow({
        where: { id: exp.id },
      });
      expect(row.nextRunAt?.toISOString() ?? null).toBe(
        exp.nextRunAt?.toISOString() ?? null,
      );
      expect(row.lastPublishedAt?.toISOString() ?? null).toBe(
        exp.lastPublishedAt?.toISOString() ?? null,
      );
      expect(row.lastCompletedAt?.toISOString() ?? null).toBe(
        exp.lastCompletedAt?.toISOString() ?? null,
      );
    }
  });

  it("computes the same next_run_at across two ticks with the same (cadence, schedulerBatchId)", async () => {
    await seedMonitor(projectId, {
      id: "m_det",
      schedulerBatchId: 17n,
      nextRunAt: prevCadence,
    });

    const publish1 = vi.fn<(events: MonitorQueueEvent[]) => Promise<void>>();
    await makeScheduler(publish1).schedule(now);
    const firstNext = (
      await prisma.monitor.findUniqueOrThrow({ where: { id: "m_det" } })
    ).nextRunAt;

    await prisma.monitor.update({
      where: { id: "m_det" },
      data: { nextRunAt: prevCadence, lastPublishedAt: null },
    });

    const publish2 = vi.fn<(events: MonitorQueueEvent[]) => Promise<void>>();
    await makeScheduler(publish2).schedule(now);
    const secondNext = (
      await prisma.monitor.findUniqueOrThrow({ where: { id: "m_det" } })
    ).nextRunAt;

    expect(firstNext?.toISOString()).toBe(secondNext?.toISOString());
  });

  it.each([
    {
      label: "1m",
      cadenceMs: 60n * 1000n,
      expectedNext: new Date("2026-05-27T12:01:17.000Z"),
    },
    {
      label: "30m",
      cadenceMs: 30n * 60n * 1000n,
      expectedNext: new Date("2026-05-27T12:30:17.000Z"),
    },
    {
      label: "1d",
      cadenceMs: 24n * 60n * 60n * 1000n,
      expectedNext: new Date("2026-05-28T00:00:17.000Z"),
    },
  ])(
    "advances next_run_at to the next cadence-aligned + 17s slot for $label cadence",
    async ({ cadenceMs, expectedNext }) => {
      await seedMonitor(projectId, {
        id: "m_cadence",
        schedulerBatchId: 17n,
        cadenceMs,
        nextRunAt: null,
      });
      const publish = vi.fn<(events: MonitorQueueEvent[]) => Promise<void>>();
      await makeScheduler(publish).schedule(now);

      const row = await prisma.monitor.findUniqueOrThrow({
        where: { id: "m_cadence" },
      });
      expect(row.nextRunAt?.toISOString()).toBe(expectedNext.toISOString());
    },
  );
});
