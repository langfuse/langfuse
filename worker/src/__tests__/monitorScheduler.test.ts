import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import {
  MonitorScheduler,
  type MonitorQueueEventInput,
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
  schedulerBatchId: string;
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
const thirtyMinutesMs = 30n * 60n * 1000n;

// Scheduler times
const now = new Date("2026-05-27T12:00:30.000Z");
const twoMinutesAgo = new Date("2026-05-27T11:58:30.000Z");
const threeMinutesAgo = new Date("2026-05-27T11:57:30.000Z");
const fourMinutesAgo = new Date("2026-05-27T11:56:30.000Z");
const sixMinutesAgo = new Date("2026-05-27T11:54:30.000Z");
const tenMinutesAgo = new Date("2026-05-27T11:50:30.000Z");
const oneMinuteFromNow = new Date("2026-05-27T12:01:30.000Z");
const prevCadence30m = new Date("2026-05-27T12:00:00.000Z");
const nextCadence30m = new Date("2026-05-27T12:30:00.000Z");

// Cadence-aligned boundaries (cadence=1m), offset by (batchId % 60) seconds.
const prevCadence = new Date("2026-05-27T12:00:00.000Z");
const nextCadence = new Date("2026-05-27T12:01:00.000Z");
const prevCadenceBatch1 = new Date("2026-05-27T12:00:01.000Z");
const nextCadenceBatch1 = new Date("2026-05-27T12:01:01.000Z");
const prevCadenceBatch2 = new Date("2026-05-27T12:00:02.000Z");
const nextCadenceBatch2 = new Date("2026-05-27T12:01:02.000Z");
const prevCadenceBatch5 = new Date("2026-05-27T12:00:05.000Z");
const nextCadenceBatch5 = new Date("2026-05-27T12:01:05.000Z");
const prevCadenceBatch7 = new Date("2026-05-27T12:00:07.000Z");
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
  publish: (event: MonitorQueueEventInput) => Promise<void>,
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
      events: [{ schedulerBatchId: "0", runAt: now, monitorIds: ["m_new"] }],
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
          schedulerBatchId: "0",
          runAt: prevCadence,
          monitorIds: ["m_behind"],
        },
      ],
      rows: [
        {
          id: "m_behind",
          nextRunAt: nextCadence,
          lastPublishedAt: now,
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
          schedulerBatchId: "0",
          runAt: prevCadence,
          monitorIds: ["m_stuck"],
        },
      ],
      rows: [
        {
          id: "m_stuck",
          nextRunAt: nextCadence,
          lastPublishedAt: now,
          lastCompletedAt: null,
        },
      ],
    },
  },
  {
    name: "long-cadence in-flight past TTL: rescue branch republishes",
    tick: now,
    monitors: [
      {
        id: "m_long_stuck",
        cadenceMs: thirtyMinutesMs,
        nextRunAt: nextCadence30m,
        lastPublishedAt: sixMinutesAgo,
        lastCompletedAt: null,
      },
    ],
    expect: {
      events: [
        {
          schedulerBatchId: "0",
          runAt: prevCadence30m,
          monitorIds: ["m_long_stuck"],
        },
      ],
      rows: [
        {
          id: "m_long_stuck",
          nextRunAt: nextCadence30m,
          lastPublishedAt: now,
          lastCompletedAt: null,
        },
      ],
    },
  },
  {
    name: "long-cadence in-flight within TTL: rescue branch does not fire",
    tick: now,
    monitors: [
      {
        id: "m_long_pending",
        cadenceMs: thirtyMinutesMs,
        nextRunAt: nextCadence30m,
        lastPublishedAt: fourMinutesAgo,
        lastCompletedAt: null,
      },
    ],
    expect: {
      events: [],
      rows: [
        {
          id: "m_long_pending",
          nextRunAt: nextCadence30m,
          lastPublishedAt: fourMinutesAgo,
          lastCompletedAt: null,
        },
      ],
    },
  },
  {
    name: "very behind: snaps forward to most recent boundary, skips intermediates",
    tick: now,
    monitors: [{ id: "m_far_behind", nextRunAt: tenMinutesAgo }],
    expect: {
      events: [
        {
          schedulerBatchId: "0",
          runAt: prevCadence,
          monitorIds: ["m_far_behind"],
        },
      ],
      rows: [
        {
          id: "m_far_behind",
          nextRunAt: nextCadence,
          lastPublishedAt: now,
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
          schedulerBatchId: "7",
          runAt: prevCadenceBatch7,
          monitorIds: ["m_a", "m_b"],
        },
      ],
      rows: [
        {
          id: "m_a",
          nextRunAt: nextCadenceBatch7,
          lastPublishedAt: now,
          lastCompletedAt: null,
        },
        {
          id: "m_b",
          nextRunAt: nextCadenceBatch7,
          lastPublishedAt: now,
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
          schedulerBatchId: "1",
          runAt: prevCadenceBatch1,
          monitorIds: ["m_a1", "m_a2", "m_a3"],
        },
        {
          schedulerBatchId: "2",
          runAt: prevCadenceBatch2,
          monitorIds: ["m_b1", "m_b2"],
        },
      ],
      rows: [
        {
          id: "m_a1",
          nextRunAt: nextCadenceBatch1,
          lastPublishedAt: now,
          lastCompletedAt: null,
        },
        {
          id: "m_a2",
          nextRunAt: nextCadenceBatch1,
          lastPublishedAt: now,
          lastCompletedAt: null,
        },
        {
          id: "m_a3",
          nextRunAt: nextCadenceBatch1,
          lastPublishedAt: now,
          lastCompletedAt: null,
        },
        {
          id: "m_b1",
          nextRunAt: nextCadenceBatch2,
          lastPublishedAt: now,
          lastCompletedAt: null,
        },
        {
          id: "m_b2",
          nextRunAt: nextCadenceBatch2,
          lastPublishedAt: now,
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
          schedulerBatchId: "5",
          runAt: prevCadenceBatch5,
          monitorIds: ["m_in"],
        },
      ],
      rows: [
        {
          id: "m_in",
          nextRunAt: nextCadenceBatch5,
          lastPublishedAt: now,
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
  {
    name: "new monitor, 1m cadence: publishes at tick, advances to cadence-aligned + 17s slot",
    tick: now,
    monitors: [
      { id: "m_cadence_1m", schedulerBatchId: 17n, cadenceMs: oneMinuteMs },
    ],
    expect: {
      events: [
        { schedulerBatchId: "17", runAt: now, monitorIds: ["m_cadence_1m"] },
      ],
      rows: [
        {
          id: "m_cadence_1m",
          nextRunAt: new Date("2026-05-27T12:01:17.000Z"),
          lastPublishedAt: now,
          lastCompletedAt: null,
        },
      ],
    },
  },
  {
    name: "new monitor, 30m cadence: publishes at tick, advances to cadence-aligned + 17s slot",
    tick: now,
    monitors: [
      {
        id: "m_cadence_30m",
        schedulerBatchId: 17n,
        cadenceMs: thirtyMinutesMs,
      },
    ],
    expect: {
      events: [
        { schedulerBatchId: "17", runAt: now, monitorIds: ["m_cadence_30m"] },
      ],
      rows: [
        {
          id: "m_cadence_30m",
          nextRunAt: new Date("2026-05-27T12:30:17.000Z"),
          lastPublishedAt: now,
          lastCompletedAt: null,
        },
      ],
    },
  },
  {
    name: "new monitor, 1d cadence: publishes at tick, advances to cadence-aligned + 17s slot",
    tick: now,
    monitors: [
      {
        id: "m_cadence_1d",
        schedulerBatchId: 17n,
        cadenceMs: 24n * 60n * 60n * 1000n,
      },
    ],
    expect: {
      events: [
        { schedulerBatchId: "17", runAt: now, monitorIds: ["m_cadence_1d"] },
      ],
      rows: [
        {
          id: "m_cadence_1d",
          nextRunAt: new Date("2026-05-28T00:00:17.000Z"),
          lastPublishedAt: now,
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

    const publish = vi.fn<(event: MonitorQueueEventInput) => Promise<void>>();
    await makeScheduler(publish, c.scheduler).schedule(c.tick);

    // Filter to this project's events — the scheduler is global, so concurrent
    // test files in the same shard can leak monitors into the publish call.
    const myEvents = publish.mock.calls
      .flatMap((call) => call[0])
      .filter((e) => e.projectId === projectId);

    expect(myEvents).toHaveLength(c.expect.events.length);
    myEvents.forEach((event, i) => {
      const exp = c.expect.events[i];
      expect(event.schedulerBatchId).toBe(exp.schedulerBatchId);
      expect(event.runAt).toEqual(exp.runAt);
      expect(event.monitors.map((m) => m.monitorId).sort()).toEqual(
        [...exp.monitorIds].sort(),
      );
    });

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

    const publish1 = vi.fn<(event: MonitorQueueEventInput) => Promise<void>>();
    await makeScheduler(publish1).schedule(now);
    const firstNext = (
      await prisma.monitor.findUniqueOrThrow({ where: { id: "m_det" } })
    ).nextRunAt;

    await prisma.monitor.update({
      where: { id: "m_det" },
      data: { nextRunAt: prevCadence, lastPublishedAt: null },
    });

    const publish2 = vi.fn<(event: MonitorQueueEventInput) => Promise<void>>();
    await makeScheduler(publish2).schedule(now);
    const secondNext = (
      await prisma.monitor.findUniqueOrThrow({ where: { id: "m_det" } })
    ).nextRunAt;

    expect(firstNext?.toISOString()).toBe(secondNext?.toISOString());
  });
});
