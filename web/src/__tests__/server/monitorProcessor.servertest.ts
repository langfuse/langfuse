import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import {
  MonitorProcessor,
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
  lastClaimedAt: Date | null;
  lastCompletedAt: Date | null;
  status: MonitorStatus;
  view: MonitorView;
  metric: { measure: string; aggregation: string };
}>;

type MonitorSeed = { id: string } & SeedOverrides;

type ExpectedRow = {
  id: string;
  lastPublishedAt: Date | null;
  lastClaimedAt: Date | null;
  lastCompletedAt: Date | null;
};

type EventOverrides = Partial<{
  projectId: string;
  schedulerBatchId: bigint;
}>;

type ClaimCase = {
  name: string;
  monitors: MonitorSeed[];
  event: { runAt: Date; monitorIds: string[] } & EventOverrides;
  now: Date;
  expect: { claimedMonitorIds: string[]; rows: ExpectedRow[] };
};

const oneMinuteMs = 60n * 1000n;

// Anchor T0 = the publish time of the current run.
const t0 = new Date("2026-05-27T12:00:00.000Z");
const t0Plus1s = new Date("2026-05-27T12:00:01.000Z");
const t0Plus1m = new Date("2026-05-27T12:01:00.000Z");
const tMinus10m = new Date("2026-05-27T11:50:00.000Z"); // prior run
// Far-future default so parallel MonitorScheduler tests can't sweep these rows.
const farFuture = new Date("2099-01-01T00:00:00.000Z");

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
      nextRunAt: seed.nextRunAt === undefined ? farFuture : seed.nextRunAt,
      lastPublishedAt: seed.lastPublishedAt ?? null,
      lastClaimedAt: seed.lastClaimedAt ?? null,
      lastCompletedAt: seed.lastCompletedAt ?? null,
      name: `Test ${seed.id}`,
      tags: [],
    },
  });
}

function makeEvent(args: {
  projectId: string;
  runAt: Date;
  monitorIds: string[];
  schedulerBatchId?: bigint;
  publishedAt?: Date;
}): MonitorQueueEvent {
  return {
    projectId: args.projectId,
    schedulerBatchId: args.schedulerBatchId ?? 0n,
    runAt: args.runAt,
    publishedAt: args.publishedAt ?? args.runAt,
    view: "observations",
    filters: [],
    window: "5m",
    metrics: [{ measure: "count", aggregation: "count" }],
    monitors: args.monitorIds.map((id) => ({
      monitorId: id,
      metricName: "count_count",
    })),
  };
}

const cases: ClaimCase[] = [
  // === single-monitor success branches ===
  {
    name: "fresh publish, never claimed: claims and stamps last_claimed_at = now",
    monitors: [
      {
        id: "m_fresh",
        lastPublishedAt: t0,
        lastClaimedAt: null,
        lastCompletedAt: null,
      },
    ],
    event: { runAt: t0, monitorIds: ["m_fresh"] },
    now: t0Plus1s,
    expect: {
      claimedMonitorIds: ["m_fresh"],
      rows: [
        {
          id: "m_fresh",
          lastPublishedAt: t0,
          lastClaimedAt: t0Plus1s,
          lastCompletedAt: null,
        },
      ],
    },
  },
  {
    name: "prior-run claim (last_completed_at < event.publishedAt): claims",
    monitors: [
      {
        id: "m_prior",
        lastPublishedAt: t0,
        lastClaimedAt: tMinus10m,
        lastCompletedAt: tMinus10m,
      },
    ],
    event: { runAt: t0, monitorIds: ["m_prior"] },
    now: t0Plus1s,
    expect: {
      claimedMonitorIds: ["m_prior"],
      rows: [
        {
          id: "m_prior",
          lastPublishedAt: t0,
          lastClaimedAt: t0Plus1s,
          lastCompletedAt: tMinus10m,
        },
      ],
    },
  },
  {
    name: "run already completed (BullMQ replay after success): 0 claimed",
    monitors: [
      {
        id: "m_done",
        lastPublishedAt: t0,
        lastClaimedAt: t0,
        lastCompletedAt: t0,
      },
    ],
    event: { runAt: t0, monitorIds: ["m_done"] },
    now: t0Plus1s,
    expect: {
      claimedMonitorIds: [],
      rows: [
        {
          id: "m_done",
          lastPublishedAt: t0,
          lastClaimedAt: t0,
          lastCompletedAt: t0,
        },
      ],
    },
  },
  {
    name: "stale event (scheduler republished, event.runAt older than row): 0 claimed",
    monitors: [
      {
        id: "m_advanced",
        lastPublishedAt: t0,
        lastClaimedAt: null,
        lastCompletedAt: null,
      },
    ],
    event: { runAt: tMinus10m, monitorIds: ["m_advanced"] },
    now: t0Plus1s,
    expect: {
      claimedMonitorIds: [],
      rows: [
        {
          id: "m_advanced",
          lastPublishedAt: t0,
          lastClaimedAt: null,
          lastCompletedAt: null,
        },
      ],
    },
  },
  {
    name: "never-published monitor (last_published_at NULL): 0 claimed",
    monitors: [
      {
        id: "m_never_pub",
        lastPublishedAt: null,
        lastClaimedAt: null,
        lastCompletedAt: null,
      },
    ],
    event: { runAt: t0, monitorIds: ["m_never_pub"] },
    now: t0Plus1s,
    expect: {
      claimedMonitorIds: [],
      rows: [
        {
          id: "m_never_pub",
          lastPublishedAt: null,
          lastClaimedAt: null,
          lastCompletedAt: null,
        },
      ],
    },
  },

  // === empty / missing inputs ===
  {
    name: "empty monitorIds: 0 claimed, no-op",
    monitors: [
      {
        id: "m_untouched",
        lastPublishedAt: t0,
        lastClaimedAt: null,
        lastCompletedAt: null,
      },
    ],
    event: { runAt: t0, monitorIds: [] },
    now: t0Plus1s,
    expect: {
      claimedMonitorIds: [],
      rows: [
        {
          id: "m_untouched",
          lastPublishedAt: t0,
          lastClaimedAt: null,
          lastCompletedAt: null,
        },
      ],
    },
  },
  {
    name: "monitorIds reference non-existent rows: 0 claimed",
    monitors: [],
    event: { runAt: t0, monitorIds: ["m_bogus_1", "m_bogus_2"] },
    now: t0Plus1s,
    expect: { claimedMonitorIds: [], rows: [] },
  },

  // === multi-monitor batches ===
  {
    name: "multi-monitor batch all eligible: all claimed",
    monitors: [
      { id: "m_a", lastPublishedAt: t0 },
      { id: "m_b", lastPublishedAt: t0 },
      { id: "m_c", lastPublishedAt: t0 },
    ],
    event: { runAt: t0, monitorIds: ["m_a", "m_b", "m_c"] },
    now: t0Plus1s,
    expect: {
      claimedMonitorIds: ["m_a", "m_b", "m_c"],
      rows: [
        {
          id: "m_a",
          lastPublishedAt: t0,
          lastClaimedAt: t0Plus1s,
          lastCompletedAt: null,
        },
        {
          id: "m_b",
          lastPublishedAt: t0,
          lastClaimedAt: t0Plus1s,
          lastCompletedAt: null,
        },
        {
          id: "m_c",
          lastPublishedAt: t0,
          lastClaimedAt: t0Plus1s,
          lastCompletedAt: null,
        },
      ],
    },
  },
  {
    name: "multi-monitor batch with partial eligibility: only eligible claimed",
    monitors: [
      // claimable
      { id: "m_ok", lastPublishedAt: t0 },
      // already completed for this publish
      {
        id: "m_done",
        lastPublishedAt: t0,
        lastClaimedAt: t0,
        lastCompletedAt: t0,
      },
      // row advanced past this event (superseded by newer publish)
      { id: "m_advanced", lastPublishedAt: t0Plus1m },
    ],
    event: {
      runAt: t0,
      monitorIds: ["m_ok", "m_done", "m_advanced"],
    },
    now: t0Plus1s,
    expect: {
      claimedMonitorIds: ["m_ok"],
      rows: [
        {
          id: "m_ok",
          lastPublishedAt: t0,
          lastClaimedAt: t0Plus1s,
          lastCompletedAt: null,
        },
        {
          id: "m_done",
          lastPublishedAt: t0,
          lastClaimedAt: t0,
          lastCompletedAt: t0,
        },
        {
          id: "m_advanced",
          lastPublishedAt: t0Plus1m,
          lastClaimedAt: null,
          lastCompletedAt: null,
        },
      ],
    },
  },

  // === cross-project defense ===
  {
    name: "event.projectId doesn't match the row's project: 0 claimed",
    monitors: [
      {
        id: "m_other_project",
        lastPublishedAt: t0,
        lastClaimedAt: null,
        lastCompletedAt: null,
      },
    ],
    event: {
      projectId: "proj_does_not_match",
      runAt: t0,
      monitorIds: ["m_other_project"],
    },
    now: t0Plus1s,
    expect: {
      claimedMonitorIds: [],
      rows: [
        {
          id: "m_other_project",
          lastPublishedAt: t0,
          lastClaimedAt: null,
          lastCompletedAt: null,
        },
      ],
    },
  },
];

describe("MonitorProcessor.claim (integration)", () => {
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

    const processor = new MonitorProcessor({
      db: prisma,
      publish: async () => {},
    });
    const event = makeEvent({
      projectId: c.event.projectId ?? projectId,
      runAt: c.event.runAt,
      monitorIds: c.event.monitorIds,
      schedulerBatchId: c.event.schedulerBatchId,
    });

    const claims = await processor.claim(event, c.now);

    expect(claims.map((c) => c.id).sort()).toEqual(
      [...c.expect.claimedMonitorIds].sort(),
    );

    for (const exp of c.expect.rows) {
      const row = await prisma.monitor.findUniqueOrThrow({
        where: { id: exp.id },
      });
      expect(row.lastPublishedAt?.toISOString() ?? null).toBe(
        exp.lastPublishedAt?.toISOString() ?? null,
      );
      expect(row.lastClaimedAt?.toISOString() ?? null).toBe(
        exp.lastClaimedAt?.toISOString() ?? null,
      );
      expect(row.lastCompletedAt?.toISOString() ?? null).toBe(
        exp.lastCompletedAt?.toISOString() ?? null,
      );
    }
  });
});
