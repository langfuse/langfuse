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
  lastPublishedRunAt: Date | null;
  lastClaimedRunAt: Date | null;
  lastCompletedRunAt: Date | null;
  status: MonitorStatus;
  view: MonitorView;
  metric: { measure: string; aggregation: string };
}>;

type MonitorSeed = { id: string } & SeedOverrides;

type ExpectedRow = {
  id: string;
  lastPublishedRunAt: Date | null;
  lastClaimedRunAt: Date | null;
  lastCompletedRunAt: Date | null;
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
const t0Plus5m = new Date("2026-05-27T12:05:00.000Z"); // exactly TTL after T0
const t0Plus5mPlus1ms = new Date("2026-05-27T12:05:00.001Z");
const t0Plus6m = new Date("2026-05-27T12:06:00.000Z"); // past TTL
const tMinus10m = new Date("2026-05-27T11:50:00.000Z"); // prior run

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
      lastPublishedRunAt: seed.lastPublishedRunAt ?? null,
      lastClaimedRunAt: seed.lastClaimedRunAt ?? null,
      lastCompletedRunAt: seed.lastCompletedRunAt ?? null,
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
}): MonitorQueueEvent {
  return {
    projectId: args.projectId,
    schedulerBatchId: args.schedulerBatchId ?? 0n,
    runAt: args.runAt,
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
    name: "fresh publish, never claimed: claims and writes last_claimed_run_at = event.runAt",
    monitors: [
      {
        id: "m_fresh",
        lastPublishedRunAt: t0,
        lastClaimedRunAt: null,
        lastCompletedRunAt: null,
      },
    ],
    event: { runAt: t0, monitorIds: ["m_fresh"] },
    now: t0Plus1s,
    expect: {
      claimedMonitorIds: ["m_fresh"],
      rows: [
        {
          id: "m_fresh",
          lastPublishedRunAt: t0,
          lastClaimedRunAt: t0,
          lastCompletedRunAt: null,
        },
      ],
    },
  },
  {
    name: "prior-run claim (older value branch): claims",
    monitors: [
      {
        id: "m_prior",
        lastPublishedRunAt: t0,
        lastClaimedRunAt: tMinus10m,
        lastCompletedRunAt: tMinus10m,
      },
    ],
    event: { runAt: t0, monitorIds: ["m_prior"] },
    now: t0Plus1s,
    expect: {
      claimedMonitorIds: ["m_prior"],
      rows: [
        {
          id: "m_prior",
          lastPublishedRunAt: t0,
          lastClaimedRunAt: t0,
          lastCompletedRunAt: tMinus10m,
        },
      ],
    },
  },
  {
    name: "current-run claim past TTL (TTL branch): claims",
    monitors: [
      {
        id: "m_ttl_past",
        lastPublishedRunAt: t0,
        lastClaimedRunAt: t0,
        lastCompletedRunAt: null,
      },
    ],
    event: { runAt: t0, monitorIds: ["m_ttl_past"] },
    now: t0Plus6m,
    expect: {
      claimedMonitorIds: ["m_ttl_past"],
      rows: [
        {
          id: "m_ttl_past",
          lastPublishedRunAt: t0,
          lastClaimedRunAt: t0,
          lastCompletedRunAt: null,
        },
      ],
    },
  },
  {
    name: "TTL boundary + 1ms: claims (TTL is strict `>`)",
    monitors: [
      {
        id: "m_ttl_plus",
        lastPublishedRunAt: t0,
        lastClaimedRunAt: t0,
        lastCompletedRunAt: null,
      },
    ],
    event: { runAt: t0, monitorIds: ["m_ttl_plus"] },
    now: t0Plus5mPlus1ms,
    expect: {
      claimedMonitorIds: ["m_ttl_plus"],
      rows: [
        {
          id: "m_ttl_plus",
          lastPublishedRunAt: t0,
          lastClaimedRunAt: t0,
          lastCompletedRunAt: null,
        },
      ],
    },
  },

  // === single-monitor denial branches ===
  {
    name: "current-run claim within TTL (BullMQ dup delivery): 0 claimed",
    monitors: [
      {
        id: "m_inflight",
        lastPublishedRunAt: t0,
        lastClaimedRunAt: t0,
        lastCompletedRunAt: null,
      },
    ],
    event: { runAt: t0, monitorIds: ["m_inflight"] },
    now: t0Plus1m,
    expect: {
      claimedMonitorIds: [],
      rows: [
        {
          id: "m_inflight",
          lastPublishedRunAt: t0,
          lastClaimedRunAt: t0,
          lastCompletedRunAt: null,
        },
      ],
    },
  },
  {
    name: "TTL boundary exact: 0 claimed (strict `>`)",
    monitors: [
      {
        id: "m_ttl_exact",
        lastPublishedRunAt: t0,
        lastClaimedRunAt: t0,
        lastCompletedRunAt: null,
      },
    ],
    event: { runAt: t0, monitorIds: ["m_ttl_exact"] },
    now: t0Plus5m,
    expect: {
      claimedMonitorIds: [],
      rows: [
        {
          id: "m_ttl_exact",
          lastPublishedRunAt: t0,
          lastClaimedRunAt: t0,
          lastCompletedRunAt: null,
        },
      ],
    },
  },
  {
    name: "run already completed (BullMQ replay after success): 0 claimed",
    monitors: [
      {
        id: "m_done",
        lastPublishedRunAt: t0,
        lastClaimedRunAt: t0,
        lastCompletedRunAt: t0,
      },
    ],
    event: { runAt: t0, monitorIds: ["m_done"] },
    now: t0Plus1s,
    expect: {
      claimedMonitorIds: [],
      rows: [
        {
          id: "m_done",
          lastPublishedRunAt: t0,
          lastClaimedRunAt: t0,
          lastCompletedRunAt: t0,
        },
      ],
    },
  },
  {
    name: "stale event (scheduler republished, event.runAt older than row): 0 claimed",
    monitors: [
      {
        id: "m_advanced",
        lastPublishedRunAt: t0,
        lastClaimedRunAt: null,
        lastCompletedRunAt: null,
      },
    ],
    event: { runAt: tMinus10m, monitorIds: ["m_advanced"] },
    now: t0Plus1s,
    expect: {
      claimedMonitorIds: [],
      rows: [
        {
          id: "m_advanced",
          lastPublishedRunAt: t0,
          lastClaimedRunAt: null,
          lastCompletedRunAt: null,
        },
      ],
    },
  },
  {
    name: "never-published monitor (last_published_run_at NULL): 0 claimed",
    monitors: [
      {
        id: "m_never_pub",
        lastPublishedRunAt: null,
        lastClaimedRunAt: null,
        lastCompletedRunAt: null,
      },
    ],
    event: { runAt: t0, monitorIds: ["m_never_pub"] },
    now: t0Plus1s,
    expect: {
      claimedMonitorIds: [],
      rows: [
        {
          id: "m_never_pub",
          lastPublishedRunAt: null,
          lastClaimedRunAt: null,
          lastCompletedRunAt: null,
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
        lastPublishedRunAt: t0,
        lastClaimedRunAt: null,
        lastCompletedRunAt: null,
      },
    ],
    event: { runAt: t0, monitorIds: [] },
    now: t0Plus1s,
    expect: {
      claimedMonitorIds: [],
      rows: [
        {
          id: "m_untouched",
          lastPublishedRunAt: t0,
          lastClaimedRunAt: null,
          lastCompletedRunAt: null,
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
      { id: "m_a", lastPublishedRunAt: t0 },
      { id: "m_b", lastPublishedRunAt: t0 },
      { id: "m_c", lastPublishedRunAt: t0 },
    ],
    event: { runAt: t0, monitorIds: ["m_a", "m_b", "m_c"] },
    now: t0Plus1s,
    expect: {
      claimedMonitorIds: ["m_a", "m_b", "m_c"],
      rows: [
        {
          id: "m_a",
          lastPublishedRunAt: t0,
          lastClaimedRunAt: t0,
          lastCompletedRunAt: null,
        },
        {
          id: "m_b",
          lastPublishedRunAt: t0,
          lastClaimedRunAt: t0,
          lastCompletedRunAt: null,
        },
        {
          id: "m_c",
          lastPublishedRunAt: t0,
          lastClaimedRunAt: t0,
          lastCompletedRunAt: null,
        },
      ],
    },
  },
  {
    name: "multi-monitor batch with partial eligibility: only eligible claimed",
    monitors: [
      // claimable
      { id: "m_ok", lastPublishedRunAt: t0 },
      // already completed
      {
        id: "m_done",
        lastPublishedRunAt: t0,
        lastClaimedRunAt: t0,
        lastCompletedRunAt: t0,
      },
      // row advanced past this event
      { id: "m_advanced", lastPublishedRunAt: t0Plus1m },
      // currently in-flight within TTL
      {
        id: "m_inflight",
        lastPublishedRunAt: t0,
        lastClaimedRunAt: t0,
        lastCompletedRunAt: null,
      },
    ],
    event: {
      runAt: t0,
      monitorIds: ["m_ok", "m_done", "m_advanced", "m_inflight"],
    },
    now: t0Plus1s,
    expect: {
      claimedMonitorIds: ["m_ok"],
      rows: [
        {
          id: "m_ok",
          lastPublishedRunAt: t0,
          lastClaimedRunAt: t0,
          lastCompletedRunAt: null,
        },
        {
          id: "m_done",
          lastPublishedRunAt: t0,
          lastClaimedRunAt: t0,
          lastCompletedRunAt: t0,
        },
        {
          id: "m_advanced",
          lastPublishedRunAt: t0Plus1m,
          lastClaimedRunAt: null,
          lastCompletedRunAt: null,
        },
        {
          id: "m_inflight",
          lastPublishedRunAt: t0,
          lastClaimedRunAt: t0,
          lastCompletedRunAt: null,
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
        lastPublishedRunAt: t0,
        lastClaimedRunAt: null,
        lastCompletedRunAt: null,
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
          lastPublishedRunAt: t0,
          lastClaimedRunAt: null,
          lastCompletedRunAt: null,
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

    const processor = new MonitorProcessor({ db: prisma });
    const event = makeEvent({
      projectId: c.event.projectId ?? projectId,
      runAt: c.event.runAt,
      monitorIds: c.event.monitorIds,
      schedulerBatchId: c.event.schedulerBatchId,
    });

    const claimedMonitorIds = await processor.claim(event, c.now);

    expect([...claimedMonitorIds].sort()).toEqual(
      [...c.expect.claimedMonitorIds].sort(),
    );

    for (const exp of c.expect.rows) {
      const row = await prisma.monitor.findUniqueOrThrow({
        where: { id: exp.id },
      });
      expect(row.lastPublishedRunAt?.toISOString() ?? null).toBe(
        exp.lastPublishedRunAt?.toISOString() ?? null,
      );
      expect(row.lastClaimedRunAt?.toISOString() ?? null).toBe(
        exp.lastClaimedRunAt?.toISOString() ?? null,
      );
      expect(row.lastCompletedRunAt?.toISOString() ?? null).toBe(
        exp.lastCompletedRunAt?.toISOString() ?? null,
      );
    }
  });
});
