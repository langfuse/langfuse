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
const BOUNDARY_PREV_MINUTE = new Date("2026-05-27T12:00:00.000Z");
const BOUNDARY_NEXT_MINUTE = new Date("2026-05-27T12:01:00.000Z");
const TWO_MIN_AGO = new Date("2026-05-27T11:58:30.000Z");

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
});
