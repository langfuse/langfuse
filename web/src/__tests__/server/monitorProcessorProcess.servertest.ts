import { v4 } from "uuid";
import { vi } from "vitest";

import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import {
  MonitorProcessor,
  type MonitorPublisher,
  type MonitorQueryExecutor,
  type MonitorQueueEvent,
  type MonitorTriggerLoader,
} from "@langfuse/shared/monitors/server";
import { prisma } from "@langfuse/shared/src/db";
import type { Prisma, PrismaClient } from "@prisma/client";

type MonitorStatus = "ACTIVE" | "PAUSED" | "ERROR_BAD_QUERY";
type MonitorView = "OBSERVATIONS" | "SCORES_NUMERIC" | "SCORES_CATEGORICAL";
type MonitorSeverity =
  | "UNKNOWN"
  | "OK"
  | "WARNING"
  | "ALERT"
  | "NO_DATA"
  | "PAUSED";
type ThresholdOperator = "GT" | "GTE" | "LT" | "LTE" | "EQ" | "NEQ";

type SeedOverrides = Partial<{
  schedulerBatchId: bigint;
  windowMs: bigint;
  status: MonitorStatus;
  view: MonitorView;
  alertThreshold: number;
  warningThreshold: number | null;
  thresholdOperator: ThresholdOperator;
  noData: { mode: "SILENT" } | { mode: "NOTIFY"; intervalMinutes: number };
  renotify: { mode: "OFF" } | { mode: "EVERY"; intervalMinutes: number };
  severity: MonitorSeverity;
  severityChangedAt: Date | null;
  alertedAt: Date | null;
  tags: string[];
  lastPublishedAt: Date | null;
  lastClaimedAt: Date | null;
  lastCompletedAt: Date | null;
}>;

type MonitorSeed = { id: string } & SeedOverrides;

type TriggerSeed = {
  filter: { column: string; operator: string; value: unknown; type: string }[];
  eventActions?: string[];
};

type ExpectedRow = {
  id: string;
  severity: MonitorSeverity;
  severityChangedAt: Date | null;
  alertedAt: Date | null;
  lastClaimedAt: Date | null;
  lastCompletedAt: Date | null;
};

type InjectErrorStage =
  | "claim"
  | "executeQuery"
  | "getTriggers"
  | "publish"
  | "complete";

type ProcessCase = {
  name: string;
  monitors: MonitorSeed[];
  triggers?: TriggerSeed[];
  ch?: Record<string, unknown>[];
  injectError?: { stage: InjectErrorStage; message: string };
  expect: {
    throws?: string;
    publishCallCount: number;
    publishMatch?: Record<string, unknown>;
    rows: ExpectedRow[];
  };
};

const oneMinuteMs = 60n * 1000n;
const fiveMinutesMs = 5n * oneMinuteMs;

const runAt = new Date("2026-05-27T12:00:00.000Z");
const justAfterRunAt = new Date("2026-05-27T12:00:01.000Z");
const tenMinutesAgo = new Date("2026-05-27T11:50:00.000Z");

const matchAnyAlertTrigger: TriggerSeed = {
  filter: [
    {
      column: "severity",
      operator: "any of",
      value: ["WARNING", "ALERT", "NO_DATA"],
      type: "stringOptions",
    },
  ],
};

const monitorAId = `m_a_${v4()}`;
const monitorBId = `m_b_${v4()}`;

/** seedMonitor writes one Monitor row from a seed; defaults align with a fresh ACTIVE monitor whose run was just published. */
async function seedMonitor(projectId: string, seed: MonitorSeed) {
  return prisma.monitor.create({
    data: {
      id: seed.id,
      projectId,
      view: seed.view ?? "OBSERVATIONS",
      filters: [] as unknown as Prisma.InputJsonValue,
      metric: {
        measure: "count",
        aggregation: "count",
      } as unknown as Prisma.InputJsonValue,
      windowMs: seed.windowMs ?? fiveMinutesMs,
      cadenceMs: oneMinuteMs,
      thresholdOperator: seed.thresholdOperator ?? "GT",
      alertThreshold: seed.alertThreshold ?? 100,
      warningThreshold: seed.warningThreshold ?? null,
      noData: (seed.noData ?? {
        mode: "SILENT",
      }) as unknown as Prisma.InputJsonValue,
      renotify: (seed.renotify ?? {
        mode: "OFF",
      }) as unknown as Prisma.InputJsonValue,
      status: seed.status ?? "ACTIVE",
      schedulerBatchId: seed.schedulerBatchId ?? 0n,
      nextRunAt: new Date("2099-01-01T00:00:00.000Z"),
      lastPublishedAt: seed.lastPublishedAt ?? runAt,
      lastClaimedAt: seed.lastClaimedAt ?? null,
      lastCompletedAt: seed.lastCompletedAt ?? null,
      severity: seed.severity ?? "UNKNOWN",
      severityChangedAt: seed.severityChangedAt ?? null,
      alertedAt: seed.alertedAt ?? null,
      tags: seed.tags ?? [],
      name: `Test ${seed.id}`,
    },
  });
}

/** makeEvent builds the MonitorQueueEvent for the seeded monitors; metricName matches `${aggregation}_${measure}` from the seed's default metric. */
function makeEvent(projectId: string, monitorIds: string[]): MonitorQueueEvent {
  return {
    projectId,
    schedulerBatchId: 0n,
    runAt,
    publishedAt: runAt,
    view: "observations",
    filters: [],
    window: "5m",
    metrics: [{ measure: "count", aggregation: "count" }],
    monitors: monitorIds.map((id) => ({
      monitorId: id,
      metricName: "count_count",
    })),
  };
}

/** wrapDbToThrow returns a Proxy over `db` that rejects when `method` is called, delegating everything else through. Used to inject claim ($queryRaw) and complete ($executeRaw) errors without per-method seams. */
function wrapDbToThrow(
  db: PrismaClient,
  method: "$queryRaw" | "$executeRaw",
  message: string,
): PrismaClient {
  return new Proxy(db, {
    get(target, prop, _receiver) {
      if (prop === method) {
        return () => Promise.reject(new Error(message));
      }
      return Reflect.get(target, prop, target);
    },
  }) as PrismaClient;
}

const cases: ProcessCase[] = [
  {
    name: "all monitors claimed: no ack, no ts changes, no emit",
    monitors: [
      {
        id: monitorAId,
        severity: "OK",
        severityChangedAt: tenMinutesAgo,
        lastPublishedAt: runAt,
        lastClaimedAt: runAt,
        lastCompletedAt: runAt,
      },
    ],
    expect: {
      publishCallCount: 0,
      rows: [
        {
          id: monitorAId,
          severity: "OK",
          severityChangedAt: tenMinutesAgo,
          alertedAt: null,
          lastClaimedAt: runAt,
          lastCompletedAt: runAt,
        },
      ],
    },
  },
  {
    name: "no severity change: ack, ts changes, no emit",
    monitors: [
      {
        id: monitorAId,
        severity: "OK",
        severityChangedAt: tenMinutesAgo,
        lastPublishedAt: runAt,
      },
    ],
    ch: [{ count_count: 50 }],
    expect: {
      publishCallCount: 0,
      rows: [
        {
          id: monitorAId,
          severity: "OK",
          severityChangedAt: tenMinutesAgo,
          alertedAt: null,
          lastClaimedAt: runAt,
          lastCompletedAt: runAt,
        },
      ],
    },
  },
  {
    name: "no triggers match: ack, ts + sev changes, no emit",
    monitors: [
      {
        id: monitorAId,
        severity: "UNKNOWN",
        lastPublishedAt: runAt,
      },
    ],
    ch: [{ count_count: 200 }],
    triggers: [
      {
        filter: [
          {
            column: "severity",
            operator: "any of",
            value: ["WARNING"],
            type: "stringOptions",
          },
        ],
      },
    ],
    expect: {
      publishCallCount: 0,
      rows: [
        {
          id: monitorAId,
          severity: "ALERT",
          severityChangedAt: runAt,
          alertedAt: runAt,
          lastClaimedAt: runAt,
          lastCompletedAt: runAt,
        },
      ],
    },
  },
  {
    name: "alert: ack, ts + sev changes, emit",
    monitors: [
      {
        id: monitorAId,
        severity: "UNKNOWN",
        lastPublishedAt: runAt,
      },
    ],
    ch: [{ count_count: 200 }],
    triggers: [matchAnyAlertTrigger],
    expect: {
      publishCallCount: 1,
      publishMatch: {
        type: "monitor-alert",
        version: "v1",
        payload: {
          monitorId: monitorAId,
          severity: "ALERT",
          message: {
            title: `[ALERT] Test ${monitorAId}`,
            body: "count(observations.count) is above 100",
          },
          view: "observations",
          window: "5m",
        },
      },
      rows: [
        {
          id: monitorAId,
          severity: "ALERT",
          severityChangedAt: runAt,
          alertedAt: runAt,
          lastClaimedAt: runAt,
          lastCompletedAt: runAt,
        },
      ],
    },
  },
  {
    name: "renotify on: ack, ts changes, emit",
    monitors: [
      {
        id: monitorAId,
        severity: "ALERT",
        severityChangedAt: tenMinutesAgo,
        alertedAt: tenMinutesAgo,
        lastPublishedAt: runAt,
        renotify: { mode: "EVERY", intervalMinutes: 5 },
      },
    ],
    ch: [{ count_count: 200 }],
    triggers: [matchAnyAlertTrigger],
    expect: {
      publishCallCount: 1,
      rows: [
        {
          id: monitorAId,
          severity: "ALERT",
          severityChangedAt: tenMinutesAgo,
          alertedAt: runAt,
          lastClaimedAt: runAt,
          lastCompletedAt: runAt,
        },
      ],
    },
  },
  {
    name: "renotify off: ack, ts changes, no emit",
    monitors: [
      {
        id: monitorAId,
        severity: "ALERT",
        severityChangedAt: tenMinutesAgo,
        alertedAt: tenMinutesAgo,
        lastPublishedAt: runAt,
        renotify: { mode: "OFF" },
      },
    ],
    ch: [{ count_count: 200 }],
    triggers: [matchAnyAlertTrigger],
    expect: {
      publishCallCount: 0,
      rows: [
        {
          id: monitorAId,
          severity: "ALERT",
          severityChangedAt: tenMinutesAgo,
          alertedAt: tenMinutesAgo,
          lastClaimedAt: runAt,
          lastCompletedAt: runAt,
        },
      ],
    },
  },
  {
    name: "nodata on: ack, ts + sev changes, emit",
    monitors: [
      {
        id: monitorAId,
        severity: "OK",
        severityChangedAt: tenMinutesAgo,
        lastPublishedAt: runAt,
        noData: { mode: "NOTIFY", intervalMinutes: 5 },
      },
    ],
    ch: [{}],
    triggers: [matchAnyAlertTrigger],
    expect: {
      publishCallCount: 1,
      rows: [
        {
          id: monitorAId,
          severity: "NO_DATA",
          severityChangedAt: runAt,
          alertedAt: runAt,
          lastClaimedAt: runAt,
          lastCompletedAt: runAt,
        },
      ],
    },
  },
  {
    name: "nodata off: ack, ts + sev changes, no emit",
    monitors: [
      {
        id: monitorAId,
        severity: "OK",
        severityChangedAt: tenMinutesAgo,
        lastPublishedAt: runAt,
        noData: { mode: "SILENT" },
      },
    ],
    ch: [{}],
    triggers: [matchAnyAlertTrigger],
    expect: {
      publishCallCount: 0,
      rows: [
        {
          id: monitorAId,
          severity: "NO_DATA",
          severityChangedAt: runAt,
          alertedAt: null,
          lastClaimedAt: runAt,
          lastCompletedAt: runAt,
        },
      ],
    },
  },
  {
    name: "error on claim: no ack, no changes, no emit",
    monitors: [
      {
        id: monitorAId,
        severity: "OK",
        severityChangedAt: tenMinutesAgo,
        lastPublishedAt: runAt,
      },
    ],
    injectError: { stage: "claim", message: "PG down (claim)" },
    expect: {
      throws: "PG down (claim)",
      publishCallCount: 0,
      rows: [
        {
          id: monitorAId,
          severity: "OK",
          severityChangedAt: tenMinutesAgo,
          alertedAt: null,
          lastClaimedAt: null,
          lastCompletedAt: null,
        },
      ],
    },
  },
  {
    name: "error on executeQuery: no ack, no changes, no emit",
    monitors: [
      {
        id: monitorAId,
        severity: "OK",
        severityChangedAt: tenMinutesAgo,
        lastPublishedAt: runAt,
      },
    ],
    injectError: { stage: "executeQuery", message: "CH timeout" },
    expect: {
      throws: "CH timeout",
      publishCallCount: 0,
      rows: [
        {
          id: monitorAId,
          severity: "OK",
          severityChangedAt: tenMinutesAgo,
          alertedAt: null,
          lastClaimedAt: runAt,
          lastCompletedAt: null,
        },
      ],
    },
  },
  {
    name: "error on getTriggers: no ack, no changes, no emit",
    monitors: [
      {
        id: monitorAId,
        severity: "OK",
        severityChangedAt: tenMinutesAgo,
        lastPublishedAt: runAt,
      },
    ],
    injectError: { stage: "getTriggers", message: "trigger lookup failed" },
    expect: {
      throws: "trigger lookup failed",
      publishCallCount: 0,
      rows: [
        {
          id: monitorAId,
          severity: "OK",
          severityChangedAt: tenMinutesAgo,
          alertedAt: null,
          lastClaimedAt: runAt,
          lastCompletedAt: null,
        },
      ],
    },
  },
  {
    name: "error on publish: no ack, no changes, emit (publish fired before throwing)",
    monitors: [
      {
        id: monitorAId,
        severity: "UNKNOWN",
        lastPublishedAt: runAt,
      },
    ],
    ch: [{ count_count: 200 }],
    triggers: [matchAnyAlertTrigger],
    injectError: { stage: "publish", message: "webhook queue rejected" },
    expect: {
      throws: "webhook queue rejected",
      publishCallCount: 1,
      rows: [
        {
          id: monitorAId,
          severity: "UNKNOWN",
          severityChangedAt: null,
          alertedAt: null,
          lastClaimedAt: runAt,
          lastCompletedAt: null,
        },
      ],
    },
  },
  {
    name: "error on complete: no ack, no changes, emit (publish fired before throwing)",
    monitors: [
      {
        id: monitorAId,
        severity: "UNKNOWN",
        lastPublishedAt: runAt,
      },
    ],
    ch: [{ count_count: 200 }],
    triggers: [matchAnyAlertTrigger],
    injectError: { stage: "complete", message: "PG down (complete)" },
    expect: {
      throws: "PG down (complete)",
      publishCallCount: 1,
      rows: [
        {
          id: monitorAId,
          severity: "UNKNOWN",
          severityChangedAt: null,
          alertedAt: null,
          lastClaimedAt: runAt,
          lastCompletedAt: null,
        },
      ],
    },
  },
  {
    name: "partial claim: ack + ts + sev changes + emit for claimable, untouched for already-completed",
    monitors: [
      // already-completed: claim's clause 2 rejects it (lastCompletedAt == lastPublishedAt)
      {
        id: monitorAId,
        schedulerBatchId: 7n,
        severity: "OK",
        severityChangedAt: tenMinutesAgo,
        lastPublishedAt: runAt,
        lastClaimedAt: runAt,
        lastCompletedAt: runAt,
      },
      // claimable: fresh, will emit ALERT
      {
        id: monitorBId,
        schedulerBatchId: 7n,
        severity: "UNKNOWN",
        lastPublishedAt: runAt,
      },
    ],
    ch: [{ count_count: 200 }],
    triggers: [matchAnyAlertTrigger],
    expect: {
      publishCallCount: 1,
      publishMatch: {
        payload: {
          monitorId: monitorBId,
          severity: "ALERT",
        },
      },
      rows: [
        // done: untouched
        {
          id: monitorAId,
          severity: "OK",
          severityChangedAt: tenMinutesAgo,
          alertedAt: null,
          lastClaimedAt: runAt,
          lastCompletedAt: runAt,
        },
        // claimable: fully processed
        {
          id: monitorBId,
          severity: "ALERT",
          severityChangedAt: runAt,
          alertedAt: runAt,
          lastClaimedAt: runAt,
          lastCompletedAt: runAt,
        },
      ],
    },
  },
];

describe("MonitorProcessor.process (integration)", () => {
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

    const publish = vi.fn<MonitorPublisher>(async () => {});
    if (c.injectError?.stage === "publish") {
      publish.mockRejectedValueOnce(new Error(c.injectError.message));
    }

    const executeQuery: MonitorQueryExecutor = async () => {
      if (c.injectError?.stage === "executeQuery") {
        throw new Error(c.injectError.message);
      }
      return c.ch ?? [{ count_count: 0 }];
    };

    const getTriggers: MonitorTriggerLoader = async () => {
      if (c.injectError?.stage === "getTriggers") {
        throw new Error(c.injectError.message);
      }
      // matchesTriggerFilter only reads filter + eventActions; cast minimal seeds.
      return (c.triggers ?? []).map((t) => ({
        filter: t.filter,
        eventActions: t.eventActions ?? [],
      })) as unknown as Awaited<ReturnType<MonitorTriggerLoader>>;
    };

    let db: PrismaClient = prisma;
    if (c.injectError?.stage === "claim") {
      db = wrapDbToThrow(prisma, "$queryRaw", c.injectError.message);
    } else if (c.injectError?.stage === "complete") {
      db = wrapDbToThrow(prisma, "$executeRaw", c.injectError.message);
    }

    const processor = new MonitorProcessor({
      db,
      publish,
      executeQuery,
      getTriggers,
    });

    const event = makeEvent(
      projectId,
      c.monitors.map((m) => m.id),
    );
    if (c.expect.throws) {
      await expect(processor.process(event, justAfterRunAt)).rejects.toThrow(
        c.expect.throws,
      );
    } else {
      await processor.process(event, justAfterRunAt);
    }

    expect(publish).toHaveBeenCalledTimes(c.expect.publishCallCount);
    if (c.expect.publishMatch && c.expect.publishCallCount > 0) {
      expect(publish.mock.calls[0][0]).toMatchObject(c.expect.publishMatch);
    }

    for (const exp of c.expect.rows) {
      const row = await prisma.monitor.findUniqueOrThrow({
        where: { id: exp.id },
      });
      expect(row.severity).toBe(exp.severity);
      expect(row.severityChangedAt?.toISOString() ?? null).toBe(
        exp.severityChangedAt?.toISOString() ?? null,
      );
      expect(row.alertedAt?.toISOString() ?? null).toBe(
        exp.alertedAt?.toISOString() ?? null,
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
