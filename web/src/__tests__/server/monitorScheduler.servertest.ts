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
  lastPublishedRunAt: Date | null;
  lastCompletedRunAt: Date | null;
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
  lastPublishedRunAt: Date | null;
  lastCompletedRunAt: Date | null;
};

type SchedulerCase = {
  name: string;
  scheduler?: { id: number; total: number };
  tick: Date;
  monitors: MonitorSeed[];
  expect: { events: ExpectedEvent[]; rows: ExpectedRow[] };
};

const ONE_MINUTE_MS = 60n * 1000n;

const TICK = new Date("2026-05-27T12:00:30.000Z");
// Next 1-minute cadence boundary strictly after TICK, offset by (batchId % 60) seconds.
const BOUNDARY_PREV_MINUTE = new Date("2026-05-27T12:00:00.000Z");
const BOUNDARY_NEXT_MINUTE = new Date("2026-05-27T12:01:00.000Z");
const NEXT_BOUNDARY_BATCH_1 = new Date("2026-05-27T12:01:01.000Z");
const NEXT_BOUNDARY_BATCH_2 = new Date("2026-05-27T12:01:02.000Z");
const NEXT_BOUNDARY_BATCH_5 = new Date("2026-05-27T12:01:05.000Z");
const NEXT_BOUNDARY_BATCH_7 = new Date("2026-05-27T12:01:07.000Z");
const TWO_MIN_AGO = new Date("2026-05-27T11:58:30.000Z");
const THREE_MIN_AGO = new Date("2026-05-27T11:57:30.000Z");
const TEN_MIN_AGO = new Date("2026-05-27T11:50:30.000Z");
const FUTURE_RUN = new Date("2026-05-27T12:01:30.000Z");

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
      windowMs: seed.windowMs ?? 5n * ONE_MINUTE_MS,
      cadenceMs: seed.cadenceMs ?? ONE_MINUTE_MS,
      thresholdOperator: "GT",
      alertThreshold: 100,
      warningThreshold: null,
      noData: { mode: "SILENT" } as unknown as Prisma.InputJsonValue,
      renotify: { mode: "OFF" } as unknown as Prisma.InputJsonValue,
      status: seed.status ?? "ACTIVE",
      schedulerBatchId: seed.schedulerBatchId ?? 0n,
      nextRunAt: seed.nextRunAt === undefined ? null : seed.nextRunAt,
      lastPublishedRunAt: seed.lastPublishedRunAt ?? null,
      lastCompletedRunAt: seed.lastCompletedRunAt ?? null,
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
    tick: TICK,
    monitors: [],
    expect: { events: [], rows: [] },
  },
  {
    name: "all monitors ahead: every row filtered by WHERE, nothing published or advanced",
    tick: TICK,
    monitors: [
      { id: "m_ahead_a", nextRunAt: FUTURE_RUN },
      { id: "m_ahead_b", nextRunAt: FUTURE_RUN },
    ],
    expect: {
      events: [],
      rows: [
        {
          id: "m_ahead_a",
          nextRunAt: FUTURE_RUN,
          lastPublishedRunAt: null,
          lastCompletedRunAt: null,
        },
        {
          id: "m_ahead_b",
          nextRunAt: FUTURE_RUN,
          lastPublishedRunAt: null,
          lastCompletedRunAt: null,
        },
      ],
    },
  },
  {
    name: "new monitor: publishes at tick, advances to next boundary",
    tick: TICK,
    monitors: [{ id: "m_new", nextRunAt: null }],
    expect: {
      events: [{ schedulerBatchId: 0n, runAt: TICK, monitorIds: ["m_new"] }],
      rows: [
        {
          id: "m_new",
          nextRunAt: BOUNDARY_NEXT_MINUTE,
          lastPublishedRunAt: TICK,
          lastCompletedRunAt: null,
        },
      ],
    },
  },
  {
    name: "behind monitor: publishes at prior next_run_at, advances",
    tick: TICK,
    monitors: [{ id: "m_behind", nextRunAt: BOUNDARY_PREV_MINUTE }],
    expect: {
      events: [
        {
          schedulerBatchId: 0n,
          runAt: BOUNDARY_PREV_MINUTE,
          monitorIds: ["m_behind"],
        },
      ],
      rows: [
        {
          id: "m_behind",
          nextRunAt: BOUNDARY_NEXT_MINUTE,
          lastPublishedRunAt: BOUNDARY_PREV_MINUTE,
          lastCompletedRunAt: null,
        },
      ],
    },
  },
  {
    name: "in-flight + last_completed=NULL within TTL: not published, advanced",
    tick: TICK,
    monitors: [
      {
        id: "m_pending",
        nextRunAt: BOUNDARY_PREV_MINUTE,
        lastPublishedRunAt: TWO_MIN_AGO,
        lastCompletedRunAt: null,
      },
    ],
    expect: {
      events: [],
      rows: [
        {
          id: "m_pending",
          nextRunAt: BOUNDARY_NEXT_MINUTE,
          lastPublishedRunAt: TWO_MIN_AGO,
          lastCompletedRunAt: null,
        },
      ],
    },
  },
  {
    name: "in-flight + completed-before-published within TTL: not published, advanced",
    tick: TICK,
    monitors: [
      {
        id: "m_inflight_completed",
        nextRunAt: BOUNDARY_PREV_MINUTE,
        lastPublishedRunAt: TWO_MIN_AGO,
        lastCompletedRunAt: THREE_MIN_AGO,
      },
    ],
    expect: {
      events: [],
      rows: [
        {
          id: "m_inflight_completed",
          nextRunAt: BOUNDARY_NEXT_MINUTE,
          lastPublishedRunAt: TWO_MIN_AGO,
          lastCompletedRunAt: THREE_MIN_AGO,
        },
      ],
    },
  },
  {
    name: "in-flight past TTL: republishes (rescue), advances",
    tick: TICK,
    monitors: [
      {
        id: "m_stuck",
        nextRunAt: BOUNDARY_PREV_MINUTE,
        lastPublishedRunAt: TEN_MIN_AGO,
        lastCompletedRunAt: null,
      },
    ],
    expect: {
      events: [
        {
          schedulerBatchId: 0n,
          runAt: BOUNDARY_PREV_MINUTE,
          monitorIds: ["m_stuck"],
        },
      ],
      rows: [
        {
          id: "m_stuck",
          nextRunAt: BOUNDARY_NEXT_MINUTE,
          lastPublishedRunAt: BOUNDARY_PREV_MINUTE,
          lastCompletedRunAt: null,
        },
      ],
    },
  },
  {
    name: "very behind: catches up to next boundary, skips intermediates",
    tick: TICK,
    monitors: [{ id: "m_far_behind", nextRunAt: TEN_MIN_AGO }],
    expect: {
      events: [
        {
          schedulerBatchId: 0n,
          runAt: TEN_MIN_AGO,
          monitorIds: ["m_far_behind"],
        },
      ],
      rows: [
        {
          id: "m_far_behind",
          nextRunAt: BOUNDARY_NEXT_MINUTE,
          lastPublishedRunAt: TEN_MIN_AGO,
          lastCompletedRunAt: null,
        },
      ],
    },
  },
  {
    name: "paused monitor: untouched",
    tick: TICK,
    monitors: [
      {
        id: "m_paused",
        status: "PAUSED",
        nextRunAt: BOUNDARY_PREV_MINUTE,
      },
    ],
    expect: {
      events: [],
      rows: [
        {
          id: "m_paused",
          nextRunAt: BOUNDARY_PREV_MINUTE,
          lastPublishedRunAt: null,
          lastCompletedRunAt: null,
        },
      ],
    },
  },
  {
    name: "error monitor: untouched",
    tick: TICK,
    monitors: [
      {
        id: "m_error",
        status: "ERROR_BAD_QUERY",
        nextRunAt: BOUNDARY_PREV_MINUTE,
      },
    ],
    expect: {
      events: [],
      rows: [
        {
          id: "m_error",
          nextRunAt: BOUNDARY_PREV_MINUTE,
          lastPublishedRunAt: null,
          lastCompletedRunAt: null,
        },
      ],
    },
  },
  {
    name: "multi-monitor batch: one event, both monitors, deduped metrics",
    tick: TICK,
    monitors: [
      {
        id: "m_a",
        schedulerBatchId: 7n,
        nextRunAt: BOUNDARY_PREV_MINUTE,
        metric: { measure: "count", aggregation: "count" },
      },
      {
        id: "m_b",
        schedulerBatchId: 7n,
        nextRunAt: BOUNDARY_PREV_MINUTE,
        metric: { measure: "latency", aggregation: "p95" },
      },
    ],
    expect: {
      events: [
        {
          schedulerBatchId: 7n,
          runAt: BOUNDARY_PREV_MINUTE,
          monitorIds: ["m_a", "m_b"],
        },
      ],
      rows: [
        {
          id: "m_a",
          nextRunAt: NEXT_BOUNDARY_BATCH_7,
          lastPublishedRunAt: BOUNDARY_PREV_MINUTE,
          lastCompletedRunAt: null,
        },
        {
          id: "m_b",
          nextRunAt: NEXT_BOUNDARY_BATCH_7,
          lastPublishedRunAt: BOUNDARY_PREV_MINUTE,
          lastCompletedRunAt: null,
        },
      ],
    },
  },
  {
    name: "5 monitors batched into 2 events (batching + ordering)",
    tick: TICK,
    monitors: [
      { id: "m_a1", schedulerBatchId: 1n, nextRunAt: TWO_MIN_AGO },
      { id: "m_a2", schedulerBatchId: 1n, nextRunAt: TWO_MIN_AGO },
      { id: "m_a3", schedulerBatchId: 1n, nextRunAt: TWO_MIN_AGO },
      { id: "m_b1", schedulerBatchId: 2n, nextRunAt: TEN_MIN_AGO },
      { id: "m_b2", schedulerBatchId: 2n, nextRunAt: TEN_MIN_AGO },
    ],
    expect: {
      events: [
        {
          schedulerBatchId: 2n,
          runAt: TEN_MIN_AGO,
          monitorIds: ["m_b1", "m_b2"],
        },
        {
          schedulerBatchId: 1n,
          runAt: TWO_MIN_AGO,
          monitorIds: ["m_a1", "m_a2", "m_a3"],
        },
      ],
      rows: [
        {
          id: "m_a1",
          nextRunAt: NEXT_BOUNDARY_BATCH_1,
          lastPublishedRunAt: TWO_MIN_AGO,
          lastCompletedRunAt: null,
        },
        {
          id: "m_a2",
          nextRunAt: NEXT_BOUNDARY_BATCH_1,
          lastPublishedRunAt: TWO_MIN_AGO,
          lastCompletedRunAt: null,
        },
        {
          id: "m_a3",
          nextRunAt: NEXT_BOUNDARY_BATCH_1,
          lastPublishedRunAt: TWO_MIN_AGO,
          lastCompletedRunAt: null,
        },
        {
          id: "m_b1",
          nextRunAt: NEXT_BOUNDARY_BATCH_2,
          lastPublishedRunAt: TEN_MIN_AGO,
          lastCompletedRunAt: null,
        },
        {
          id: "m_b2",
          nextRunAt: NEXT_BOUNDARY_BATCH_2,
          lastPublishedRunAt: TEN_MIN_AGO,
          lastCompletedRunAt: null,
        },
      ],
    },
  },
  {
    name: "sharding: only this scheduler's slot is claimed",
    scheduler: { id: 1, total: 4 },
    tick: TICK,
    monitors: [
      { id: "m_in", schedulerBatchId: 5n, nextRunAt: BOUNDARY_PREV_MINUTE },
      { id: "m_out", schedulerBatchId: 4n, nextRunAt: BOUNDARY_PREV_MINUTE },
    ],
    expect: {
      events: [
        {
          schedulerBatchId: 5n,
          runAt: BOUNDARY_PREV_MINUTE,
          monitorIds: ["m_in"],
        },
      ],
      rows: [
        {
          id: "m_in",
          nextRunAt: NEXT_BOUNDARY_BATCH_5,
          lastPublishedRunAt: BOUNDARY_PREV_MINUTE,
          lastCompletedRunAt: null,
        },
        {
          id: "m_out",
          nextRunAt: BOUNDARY_PREV_MINUTE,
          lastPublishedRunAt: null,
          lastCompletedRunAt: null,
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
      expect(row.lastPublishedRunAt?.toISOString() ?? null).toBe(
        exp.lastPublishedRunAt?.toISOString() ?? null,
      );
      expect(row.lastCompletedRunAt?.toISOString() ?? null).toBe(
        exp.lastCompletedRunAt?.toISOString() ?? null,
      );
    }
  });

  it("computes the same next_run_at across two ticks with the same (cadence, schedulerBatchId)", async () => {
    await seedMonitor(projectId, {
      id: "m_det",
      schedulerBatchId: 17n,
      nextRunAt: BOUNDARY_PREV_MINUTE,
    });

    const publish1 = vi.fn<(events: MonitorQueueEvent[]) => Promise<void>>();
    await makeScheduler(publish1).schedule(TICK);
    const firstNext = (
      await prisma.monitor.findUniqueOrThrow({ where: { id: "m_det" } })
    ).nextRunAt;

    await prisma.monitor.update({
      where: { id: "m_det" },
      data: { nextRunAt: BOUNDARY_PREV_MINUTE, lastPublishedRunAt: null },
    });

    const publish2 = vi.fn<(events: MonitorQueueEvent[]) => Promise<void>>();
    await makeScheduler(publish2).schedule(TICK);
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
      await makeScheduler(publish).schedule(TICK);

      const row = await prisma.monitor.findUniqueOrThrow({
        where: { id: "m_cadence" },
      });
      expect(row.nextRunAt?.toISOString()).toBe(expectedNext.toISOString());
    },
  );
});
