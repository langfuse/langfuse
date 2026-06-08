import { v4 } from "uuid";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { InvalidRequestError } from "@langfuse/shared";
import {
  MonitorProcessor,
  type MonitorPublisher,
  type QueryExecutor,
  type MonitorQueueEvent,
  type MonitorQueueEventInput,
  type GetTriggerConfigurations,
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

type Metric = { measure: string; aggregation: string };

type SeedOverrides = Partial<{
  schedulerBatchId: bigint;
  windowMs: bigint;
  status: MonitorStatus;
  view: MonitorView;
  metric: Metric;
  alertThreshold: number;
  warningThreshold: number | null;
  thresholdOperator: ThresholdOperator;
  noData: { mode: "SILENT" } | { mode: "NOTIFY"; intervalMinutes: number };
  renotify: { mode: "OFF" } | { mode: "EVERY"; intervalMinutes: number };
  severity: MonitorSeverity;
  severityChangedAt: Date | null;
  alertedAt: Date | null;
  tags: string[];
  triggerIds: string[];
  lastPublishedAt: Date | null;
  lastClaimedAt: Date | null;
  lastCompletedAt: Date | null;
}>;

type MonitorSeed = { id: string } & SeedOverrides;

type TriggerSeed = {
  filter: { column: string; operator: string; value: unknown; type: string }[];
  eventActions?: string[];
  automations?: { id: string; actionId: string }[];
};

type ExpectedRow = {
  id: string;
  status?: MonitorStatus;
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
  injectError?: {
    stage: InjectErrorStage;
    message: string;
    errorClass?: "invalid-request";
  };
  preempt?: { newClaimedAt: Date };
  preemptPause?: { at: Date };
  rescue?: { newPublishedAt: Date };
  expect: {
    throws?: string;
    publishCallCount: number;
    publishMatch?: Record<string, unknown>;
    publishCallsMatch?: Record<string, unknown>[];
    rows: ExpectedRow[];
  };
};

const oneMinuteMs = 60n * 1000n;
const fiveMinutesMs = 5n * oneMinuteMs;

const runAt = new Date("2026-05-27T12:00:00.000Z");
const justAfterRunAt = new Date("2026-05-27T12:00:01.000Z");
const tenMinutesAgo = new Date("2026-05-27T11:50:00.000Z");
const laterPublish = new Date("2026-05-27T12:01:00.000Z");
const pausedAt = new Date("2026-05-27T12:00:00.500Z");

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
      metric: (seed.metric ?? {
        measure: "count",
        aggregation: "count",
      }) as unknown as Prisma.InputJsonValue,
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
      lastPublishedAt:
        seed.lastPublishedAt === undefined ? runAt : seed.lastPublishedAt,
      lastClaimedAt: seed.lastClaimedAt ?? null,
      lastCompletedAt: seed.lastCompletedAt ?? null,
      severity: seed.severity ?? "UNKNOWN",
      severityChangedAt: seed.severityChangedAt ?? null,
      alertedAt: seed.alertedAt ?? null,
      tags: seed.tags ?? [],
      triggerIds: seed.triggerIds ?? [],
      name: `Test ${seed.id}`,
    },
  });
}

/** makeEvent builds the MonitorQueueEvent for the seeded monitors, deduping each monitor's metric into the batch and keying metricName by `${aggregation}_${measure}`. */
function makeEvent(
  projectId: string,
  monitors: (string | { id: string; metric?: Metric })[],
): MonitorQueueEvent {
  const seeds = monitors.map((m) =>
    typeof m === "string" ? { id: m, metric: undefined } : m,
  );
  const metricOf = (m: (typeof seeds)[number]): Metric =>
    m.metric ?? { measure: "count", aggregation: "count" };
  const seen = new Set<string>();
  const metrics: Metric[] = [];
  for (const s of seeds) {
    const metric = metricOf(s);
    const key = `${metric.aggregation}_${metric.measure}`;
    if (seen.has(key)) continue;
    seen.add(key);
    metrics.push(metric);
  }
  return {
    projectId,
    schedulerBatchId: 0n,
    runAt,
    publishedAt: runAt,
    view: "observations",
    filters: [],
    window: "5m",
    metrics: metrics as MonitorQueueEvent["metrics"],
    monitors: seeds.map((s) => {
      const metric = metricOf(s);
      return {
        monitorId: s.id,
        metricName: `${metric.aggregation}_${metric.measure}`,
      };
    }),
  };
}

/** wrapDbToThrow returns a Proxy over `db` that rejects at the DB seam matching `stage`: claim intercepts `monitor.updateManyAndReturn`, complete intercepts `$executeRaw`. Lets the table inject failures without per-method seams on the processor. */
function wrapDbToThrow(
  db: PrismaClient,
  stage: "claim" | "complete",
  message: string,
): PrismaClient {
  if (stage === "complete") {
    return new Proxy(db, {
      get(target, prop, _receiver) {
        if (prop === "$executeRaw") {
          return () => Promise.reject(new Error(message));
        }
        return Reflect.get(target, prop, target);
      },
    }) as PrismaClient;
  }
  return new Proxy(db, {
    get(target, prop, _receiver) {
      if (prop === "monitor") {
        const delegate = Reflect.get(target, prop, target);
        return new Proxy(delegate, {
          get(dTarget, dProp, _dReceiver) {
            if (dProp === "updateManyAndReturn") {
              return () => Promise.reject(new Error(message));
            }
            return Reflect.get(dTarget, dProp, dTarget);
          },
        });
      }
      return Reflect.get(target, prop, target);
    },
  }) as PrismaClient;
}

/** wrapDbPreemptBeforeComplete simulates another worker re-claiming between this worker's claim and complete: the first `$executeRaw` (the complete) first bumps `lastClaimedAt` on the project's monitors so the complete-side CAS owner key no longer matches and the update no-ops. */
function wrapDbPreemptBeforeComplete(
  db: PrismaClient,
  projectId: string,
  newClaimedAt: Date,
): PrismaClient {
  let preempted = false;
  return new Proxy(db, {
    get(target, prop, _receiver) {
      if (prop === "$executeRaw") {
        return async (...args: unknown[]) => {
          if (!preempted) {
            preempted = true;
            await target.monitor.updateMany({
              where: { projectId },
              data: { lastClaimedAt: newClaimedAt },
            });
          }
          return (target.$executeRaw as (...a: unknown[]) => unknown)(...args);
        };
      }
      return Reflect.get(target, prop, target);
    },
  }) as PrismaClient;
}

/** wrapDbPauseBeforeComplete simulates a user pausing between this worker's claim and complete: the first `$executeRaw` (the complete) first flips the project's monitors to PAUSED without touching `lastClaimedAt`, so the complete-side CAS owner key still matches. */
function wrapDbPauseBeforeComplete(
  db: PrismaClient,
  projectId: string,
  at: Date,
): PrismaClient {
  let paused = false;
  return new Proxy(db, {
    get(target, prop, _receiver) {
      if (prop === "$executeRaw") {
        return async (...args: unknown[]) => {
          if (!paused) {
            paused = true;
            await target.monitor.updateMany({
              where: { projectId },
              data: {
                status: "PAUSED",
                severity: "PAUSED",
                severityChangedAt: at,
              },
            });
          }
          return (target.$executeRaw as (...a: unknown[]) => unknown)(...args);
        };
      }
      return Reflect.get(target, prop, target);
    },
  }) as PrismaClient;
}

/** wrapDbRescueBeforeComplete simulates the scheduler TTL-rescuing this worker's stale run between claim and complete: the first `$executeRaw` (the complete) first advances `lastPublishedAt` on the project's monitors — leaving `lastClaimedAt` and `lastCompletedAt` untouched, exactly as buildScheduleQuery does — so the complete-side CAS owner key still matches on `lastClaimedAt` but the new publish-identity clause no-ops. */
function wrapDbRescueBeforeComplete(
  db: PrismaClient,
  projectId: string,
  newPublishedAt: Date,
): PrismaClient {
  let rescued = false;
  return new Proxy(db, {
    get(target, prop, _receiver) {
      if (prop === "$executeRaw") {
        return async (...args: unknown[]) => {
          if (!rescued) {
            rescued = true;
            await target.monitor.updateMany({
              where: { projectId },
              data: { lastPublishedAt: newPublishedAt },
            });
          }
          return (target.$executeRaw as (...a: unknown[]) => unknown)(...args);
        };
      }
      return Reflect.get(target, prop, target);
    },
  }) as PrismaClient;
}

const cases: ProcessCase[] = [
  {
    name: "no severity change: claim, complete, no sev change, no emit",
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
          lastClaimedAt: justAfterRunAt,
          lastCompletedAt: justAfterRunAt,
        },
      ],
    },
  },
  {
    name: "no triggers match: claim, complete, sev change, no emit",
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
          severityChangedAt: justAfterRunAt,
          alertedAt: justAfterRunAt,
          lastClaimedAt: justAfterRunAt,
          lastCompletedAt: justAfterRunAt,
        },
      ],
    },
  },
  {
    name: "alert: claim, complete, sev change, emit",
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
        projectId: expect.any(String),
        automationId: expect.any(String),
        executionId: expect.any(String),
        payload: {
          type: "monitor-alert",
          apiVersion: "v1",
          payload: {
            monitorId: monitorAId,
            severity: "ALERT",
            message: {
              title: `[ALERT] Test ${monitorAId}`,
              body: "`count(observations.count)` is **above** `100`",
            },
            view: "observations",
            window: "5m",
          },
        },
      },
      rows: [
        {
          id: monitorAId,
          severity: "ALERT",
          severityChangedAt: justAfterRunAt,
          alertedAt: justAfterRunAt,
          lastClaimedAt: justAfterRunAt,
          lastCompletedAt: justAfterRunAt,
        },
      ],
    },
  },
  {
    name: "renotify on: claim, complete, no sev change, emit",
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
          alertedAt: justAfterRunAt,
          lastClaimedAt: justAfterRunAt,
          lastCompletedAt: justAfterRunAt,
        },
      ],
    },
  },
  {
    name: "renotify off: claim, complete, no sev change, no emit",
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
          lastClaimedAt: justAfterRunAt,
          lastCompletedAt: justAfterRunAt,
        },
      ],
    },
  },
  {
    name: "count monitor empty window (count_count 0): NO_DATA, not OK",
    monitors: [
      {
        id: monitorAId,
        severity: "OK",
        severityChangedAt: tenMinutesAgo,
        lastPublishedAt: runAt,
        noData: { mode: "NOTIFY", intervalMinutes: 5 },
      },
    ],
    ch: [{ count_count: 0 }],
    triggers: [matchAnyAlertTrigger],
    expect: {
      publishCallCount: 1,
      rows: [
        {
          id: monitorAId,
          severity: "NO_DATA",
          severityChangedAt: justAfterRunAt,
          alertedAt: justAfterRunAt,
          lastClaimedAt: justAfterRunAt,
          lastCompletedAt: justAfterRunAt,
        },
      ],
    },
  },
  {
    name: "count monitor non-empty window (count_count 5): evaluates normally",
    monitors: [
      {
        id: monitorAId,
        severity: "UNKNOWN",
        lastPublishedAt: runAt,
        alertThreshold: 3,
        thresholdOperator: "GT",
      },
    ],
    ch: [{ count_count: 5 }],
    triggers: [matchAnyAlertTrigger],
    expect: {
      publishCallCount: 1,
      publishMatch: {
        payload: {
          type: "monitor-alert",
          apiVersion: "v1",
          payload: { monitorId: monitorAId, severity: "ALERT" },
        },
      },
      rows: [
        {
          id: monitorAId,
          severity: "ALERT",
          severityChangedAt: justAfterRunAt,
          alertedAt: justAfterRunAt,
          lastClaimedAt: justAfterRunAt,
          lastCompletedAt: justAfterRunAt,
        },
      ],
    },
  },
  {
    name: "nodata on: claim, complete, sev change, emit",
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
          severityChangedAt: justAfterRunAt,
          alertedAt: justAfterRunAt,
          lastClaimedAt: justAfterRunAt,
          lastCompletedAt: justAfterRunAt,
        },
      ],
    },
  },
  {
    name: "nodata off: claim, complete, sev change, no emit",
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
          severityChangedAt: justAfterRunAt,
          alertedAt: null,
          lastClaimedAt: justAfterRunAt,
          lastCompletedAt: justAfterRunAt,
        },
      ],
    },
  },
  {
    name: "error on claim: no claim, no complete, no sev change, no emit",
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
    name: "error on executeQuery: flips ERROR_BAD_QUERY, PAUSED, no throw, no emit",
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
      publishCallCount: 0,
      rows: [
        {
          id: monitorAId,
          status: "ERROR_BAD_QUERY",
          severity: "PAUSED",
          severityChangedAt: justAfterRunAt,
          alertedAt: null,
          lastClaimedAt: justAfterRunAt,
          lastCompletedAt: justAfterRunAt,
        },
      ],
    },
  },
  {
    name: "InvalidRequestError on executeQuery: flips ERROR_BAD_QUERY, PAUSED, no throw, no emit",
    monitors: [
      {
        id: monitorAId,
        severity: "OK",
        severityChangedAt: tenMinutesAgo,
        lastPublishedAt: runAt,
      },
    ],
    injectError: {
      stage: "executeQuery",
      errorClass: "invalid-request",
      message: "Invalid filter column",
    },
    expect: {
      publishCallCount: 0,
      rows: [
        {
          id: monitorAId,
          status: "ERROR_BAD_QUERY",
          severity: "PAUSED",
          severityChangedAt: justAfterRunAt,
          alertedAt: null,
          lastClaimedAt: justAfterRunAt,
          lastCompletedAt: justAfterRunAt,
        },
      ],
    },
  },
  {
    name: "error on getTriggers: claim, no complete, no sev change, no emit",
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
          lastClaimedAt: justAfterRunAt,
          lastCompletedAt: null,
        },
      ],
    },
  },
  {
    name: "InvalidRequestError on getTriggers: rethrows, stays ACTIVE, not ERROR_BAD_QUERY",
    monitors: [
      {
        id: monitorAId,
        severity: "OK",
        severityChangedAt: tenMinutesAgo,
        lastPublishedAt: runAt,
      },
    ],
    injectError: {
      stage: "getTriggers",
      errorClass: "invalid-request",
      message: "bad trigger filter",
    },
    expect: {
      throws: "bad trigger filter",
      publishCallCount: 0,
      rows: [
        {
          id: monitorAId,
          status: "ACTIVE",
          severity: "OK",
          severityChangedAt: tenMinutesAgo,
          alertedAt: null,
          lastClaimedAt: justAfterRunAt,
          lastCompletedAt: null,
        },
      ],
    },
  },
  {
    name: "error on publish: claim, no complete, no sev change, emit (publish fired before throwing)",
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
          lastClaimedAt: justAfterRunAt,
          lastCompletedAt: null,
        },
      ],
    },
  },
  {
    name: "error on complete: claim, no complete, no sev change, emit (publish fired before throwing)",
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
          lastClaimedAt: justAfterRunAt,
          lastCompletedAt: null,
        },
      ],
    },
  },
  {
    name: "partial claim: claim, complete, sev change, emit for claimable; no claim for already-completed",
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
          type: "monitor-alert",
          apiVersion: "v1",
          payload: {
            monitorId: monitorBId,
            severity: "ALERT",
          },
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
          severityChangedAt: justAfterRunAt,
          alertedAt: justAfterRunAt,
          lastClaimedAt: justAfterRunAt,
          lastCompletedAt: justAfterRunAt,
        },
      ],
    },
  },
  {
    name: "fan-out: 2 matching triggers → 2 publish calls, distinct executionIds + automationIds",
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
        ...matchAnyAlertTrigger,
        automations: [{ id: "auto_fan_a", actionId: "act_fan_a" }],
      },
      {
        ...matchAnyAlertTrigger,
        automations: [{ id: "auto_fan_b", actionId: "act_fan_b" }],
      },
    ],
    expect: {
      publishCallCount: 2,
      publishCallsMatch: [
        {
          automationId: "auto_fan_a",
          payload: {
            type: "monitor-alert",
            apiVersion: "v1",
            payload: { monitorId: monitorAId, severity: "ALERT" },
          },
        },
        {
          automationId: "auto_fan_b",
          payload: {
            type: "monitor-alert",
            apiVersion: "v1",
            payload: { monitorId: monitorAId, severity: "ALERT" },
          },
        },
      ],
      rows: [
        {
          id: monitorAId,
          severity: "ALERT",
          severityChangedAt: justAfterRunAt,
          alertedAt: justAfterRunAt,
          lastClaimedAt: justAfterRunAt,
          lastCompletedAt: justAfterRunAt,
        },
      ],
    },
  },
  {
    name: "fan-out: 1 matched + 1 rejected → 1 publish for matched trigger",
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
        ...matchAnyAlertTrigger,
        automations: [{ id: "auto_match", actionId: "act_match" }],
      },
      {
        filter: [
          {
            column: "severity",
            operator: "any of",
            value: ["WARNING"],
            type: "stringOptions",
          },
        ],
        automations: [{ id: "auto_reject", actionId: "act_reject" }],
      },
    ],
    expect: {
      publishCallCount: 1,
      publishMatch: {
        automationId: "auto_match",
        payload: {
          type: "monitor-alert",
          apiVersion: "v1",
          payload: { monitorId: monitorAId, severity: "ALERT" },
        },
      },
      rows: [
        {
          id: monitorAId,
          severity: "ALERT",
          severityChangedAt: justAfterRunAt,
          alertedAt: justAfterRunAt,
          lastClaimedAt: justAfterRunAt,
          lastCompletedAt: justAfterRunAt,
        },
      ],
    },
  },
  {
    name: "scheduler published a newer event: no claim, no complete, no sev change, no emit",
    monitors: [
      {
        id: monitorAId,
        severity: "OK",
        severityChangedAt: tenMinutesAgo,
        lastPublishedAt: laterPublish,
      },
    ],
    ch: [{ count_count: 200 }],
    triggers: [matchAnyAlertTrigger],
    expect: {
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
    name: "scheduler never published this event: no claim, no complete, no sev change, no emit",
    monitors: [
      {
        id: monitorAId,
        severity: "UNKNOWN",
        lastPublishedAt: null,
      },
    ],
    ch: [{ count_count: 200 }],
    triggers: [matchAnyAlertTrigger],
    expect: {
      publishCallCount: 0,
      rows: [
        {
          id: monitorAId,
          severity: "UNKNOWN",
          severityChangedAt: null,
          alertedAt: null,
          lastClaimedAt: null,
          lastCompletedAt: null,
        },
      ],
    },
  },
  {
    name: "processor claimed this event already: no claim, no complete, no sev change, no emit",
    monitors: [
      {
        id: monitorAId,
        severity: "UNKNOWN",
        lastPublishedAt: runAt,
        lastClaimedAt: justAfterRunAt,
        lastCompletedAt: null,
      },
    ],
    ch: [{ count_count: 200 }],
    triggers: [matchAnyAlertTrigger],
    expect: {
      publishCallCount: 0,
      rows: [
        {
          id: monitorAId,
          severity: "UNKNOWN",
          severityChangedAt: null,
          alertedAt: null,
          lastClaimedAt: justAfterRunAt,
          lastCompletedAt: null,
        },
      ],
    },
  },
  {
    name: "processor completed this event already: no claim, no complete, no sev change, no emit",
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
    ch: [{ count_count: 200 }],
    triggers: [matchAnyAlertTrigger],
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
    name: "another worker re-claims before complete: claim, no complete, no sev change, emit",
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
    preempt: { newClaimedAt: laterPublish },
    expect: {
      publishCallCount: 1,
      rows: [
        {
          id: monitorAId,
          severity: "ALERT",
          severityChangedAt: tenMinutesAgo,
          alertedAt: tenMinutesAgo,
          lastClaimedAt: laterPublish,
          lastCompletedAt: null,
        },
      ],
    },
  },
  {
    name: "user pauses after claim before complete: webhook fired (RFC §9), but PAUSED row not overwritten",
    monitors: [
      {
        id: monitorAId,
        severity: "OK",
        severityChangedAt: tenMinutesAgo,
        alertedAt: null,
        lastPublishedAt: runAt,
      },
    ],
    ch: [{ count_count: 200 }],
    triggers: [matchAnyAlertTrigger],
    preemptPause: { at: pausedAt },
    expect: {
      publishCallCount: 1, // webhook fires pre-complete; separable per RFC §9
      rows: [
        {
          id: monitorAId,
          severity: "PAUSED",
          severityChangedAt: pausedAt,
          alertedAt: null,
          lastClaimedAt: justAfterRunAt,
          lastCompletedAt: null, // complete CAS no-ops on the PAUSED row
        },
      ],
    },
  },
  {
    name: "scheduler rescues (advances last_published_at) before a stuck worker completes: webhook fired (RFC §9), but stale writeback blocked",
    monitors: [
      {
        id: monitorAId,
        severity: "OK",
        severityChangedAt: tenMinutesAgo,
        alertedAt: null,
        lastPublishedAt: runAt, // worker claims event with publishedAt=runAt, stamps lastClaimedAt=justAfterRunAt
      },
    ],
    ch: [{ count_count: 200 }], // > alertThreshold 100 → computed ALERT
    triggers: [matchAnyAlertTrigger],
    rescue: { newPublishedAt: laterPublish }, // scheduler TTL rescue moved last_published_at forward
    expect: {
      publishCallCount: 1, // webhook fires pre-complete; separable per RFC §9
      rows: [
        {
          id: monitorAId,
          severity: "OK", // complete CAS no-ops → prior severity preserved
          severityChangedAt: tenMinutesAgo,
          alertedAt: null,
          lastClaimedAt: justAfterRunAt, // worker's claim stamp, untouched by rescue
          lastCompletedAt: null, // CAS no-ops → not advanced → Worker B's claim stays unblocked
        },
      ],
    },
  },
  {
    name: "monitor paused before claim: no claim, no complete, no sev change, no emit",
    monitors: [
      {
        id: monitorAId,
        status: "PAUSED",
        severity: "PAUSED",
        lastPublishedAt: runAt,
        lastClaimedAt: null,
        lastCompletedAt: null,
      },
    ],
    ch: [{ count_count: 200 }],
    triggers: [matchAnyAlertTrigger],
    expect: {
      publishCallCount: 0,
      rows: [
        {
          id: monitorAId,
          severity: "PAUSED",
          severityChangedAt: null,
          alertedAt: null,
          lastClaimedAt: null,
          lastCompletedAt: null,
        },
      ],
    },
  },
  {
    name: "mixed metric batch: valid-metric monitor completes, invalid-metric monitor flips ERROR_BAD_QUERY only for itself",
    monitors: [
      {
        id: monitorAId,
        severity: "UNKNOWN",
        lastPublishedAt: runAt,
      },
      {
        id: monitorBId,
        severity: "OK",
        severityChangedAt: tenMinutesAgo,
        lastPublishedAt: runAt,
        metric: { measure: "bogus_measure", aggregation: "count" },
      },
    ],
    ch: [{ count_count: 200 }],
    triggers: [matchAnyAlertTrigger],
    expect: {
      publishCallCount: 1,
      publishMatch: {
        payload: {
          type: "monitor-alert",
          apiVersion: "v1",
          payload: { monitorId: monitorAId, severity: "ALERT" },
        },
      },
      rows: [
        {
          id: monitorAId,
          status: "ACTIVE",
          severity: "ALERT",
          severityChangedAt: justAfterRunAt,
          alertedAt: justAfterRunAt,
          lastClaimedAt: justAfterRunAt,
          lastCompletedAt: justAfterRunAt,
        },
        {
          id: monitorBId,
          status: "ERROR_BAD_QUERY",
          severity: "PAUSED",
          severityChangedAt: justAfterRunAt,
          alertedAt: null,
          lastClaimedAt: justAfterRunAt,
          lastCompletedAt: justAfterRunAt,
        },
      ],
    },
  },
  {
    name: "rejected metric in a zero-count window: flips ERROR_BAD_QUERY, not NO_DATA",
    monitors: [
      {
        id: monitorAId,
        severity: "OK",
        severityChangedAt: tenMinutesAgo,
        lastPublishedAt: runAt,
        metric: { measure: "bogus_measure", aggregation: "count" },
        noData: { mode: "NOTIFY", intervalMinutes: 5 },
      },
    ],
    ch: [{ count_count: 0 }],
    triggers: [matchAnyAlertTrigger],
    expect: {
      publishCallCount: 0,
      rows: [
        {
          id: monitorAId,
          status: "ERROR_BAD_QUERY",
          severity: "PAUSED",
          severityChangedAt: justAfterRunAt,
          alertedAt: null,
          lastClaimedAt: justAfterRunAt,
          lastCompletedAt: justAfterRunAt,
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
    const triggerIds = (c.triggers ?? []).map((_, i) => `trig_${i}`);
    for (const m of c.monitors) {
      await seedMonitor(projectId, { ...m, triggerIds });
    }

    const publish = vi.fn<MonitorPublisher>(async () => {});
    if (c.injectError?.stage === "publish") {
      publish.mockRejectedValueOnce(new Error(c.injectError.message));
    }

    const executeQuery: QueryExecutor = async () => {
      if (c.injectError?.stage === "executeQuery") {
        if (c.injectError.errorClass === "invalid-request") {
          throw new InvalidRequestError(c.injectError.message);
        }
        throw new Error(c.injectError.message);
      }
      return c.ch ?? [{ count_count: 0 }];
    };

    const getTriggers: GetTriggerConfigurations = async () => {
      if (c.injectError?.stage === "getTriggers") {
        if (c.injectError.errorClass === "invalid-request") {
          throw new InvalidRequestError(c.injectError.message);
        }
        throw new Error(c.injectError.message);
      }
      // Trigger ids line up with the monitor's seeded triggerIds so the
      // triggerIds opt-in passes; the severity filter does the discriminating.
      return (c.triggers ?? []).map((t, i) => ({
        id: `trig_${i}`,
        filter: t.filter,
        eventActions: t.eventActions ?? [],
        automations: t.automations ?? [
          { id: `auto_default_${i}`, actionId: `act_default_${i}` },
        ],
      })) as unknown as Awaited<ReturnType<GetTriggerConfigurations>>;
    };

    let db: PrismaClient = prisma;
    if (c.injectError?.stage === "claim") {
      db = wrapDbToThrow(prisma, "claim", c.injectError.message);
    } else if (c.injectError?.stage === "complete") {
      db = wrapDbToThrow(prisma, "complete", c.injectError.message);
    } else if (c.preempt) {
      db = wrapDbPreemptBeforeComplete(
        prisma,
        projectId,
        c.preempt.newClaimedAt,
      );
    } else if (c.preemptPause) {
      db = wrapDbPauseBeforeComplete(prisma, projectId, c.preemptPause.at);
    } else if (c.rescue) {
      db = wrapDbRescueBeforeComplete(
        prisma,
        projectId,
        c.rescue.newPublishedAt,
      );
    }

    const processor = new MonitorProcessor(
      db,
      publish,
      executeQuery,
      getTriggers,
    );

    const event = makeEvent(
      projectId,
      c.monitors.map((m) => ({ id: m.id, metric: m.metric })),
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
    if (c.expect.publishCallsMatch) {
      // Match each expected entry against any actual publish call using
      // toMatchObject semantics (deep-partial). Order-independent.
      const actual = publish.mock.calls.map((args) => args[0]);
      for (const expected of c.expect.publishCallsMatch) {
        const found = actual.some((call) => {
          try {
            expect(call).toMatchObject(expected);
            return true;
          } catch {
            return false;
          }
        });
        expect(
          found,
          `no publish call matched ${JSON.stringify(expected)}`,
        ).toBe(true);
      }
      // Assert distinct executionIds across calls.
      const executionIds = actual.map(
        (a) => (a as { executionId: string }).executionId,
      );
      expect(new Set(executionIds).size).toBe(executionIds.length);
    }

    for (const exp of c.expect.rows) {
      const row = await prisma.monitor.findUniqueOrThrow({
        where: { id: exp.id },
      });
      if (exp.status) expect(row.status).toBe(exp.status);
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

describe("MonitorProcessor.process evaluation offset", () => {
  let projectId: string;

  beforeAll(async () => {
    const org = await createOrgProjectAndApiKey();
    projectId = org.projectId;
  });

  afterEach(async () => {
    await prisma.monitor.deleteMany({ where: { projectId } });
  });

  it("shifts the CH query window back by 30s and stamps it onto the alert payload", async () => {
    const monitorId = `m_off_${v4()}`;
    await seedMonitor(projectId, {
      id: monitorId,
      severity: "UNKNOWN",
      lastPublishedAt: runAt,
      triggerIds: ["trig_off"],
    });

    let capturedQuery: { fromTimestamp: string; toTimestamp: string } | null =
      null;
    const publish = vi.fn<MonitorPublisher>(async () => {});
    const executeQuery: QueryExecutor = async (_p, query) => {
      capturedQuery = {
        fromTimestamp: query.fromTimestamp,
        toTimestamp: query.toTimestamp,
      };
      return [{ count_count: 200 }];
    };
    const getTriggers: GetTriggerConfigurations = async () =>
      [
        {
          id: "trig_off",
          filter: matchAnyAlertTrigger.filter,
          eventActions: [],
          automations: [{ id: "auto_off", actionId: "act_off" }],
        },
      ] as unknown as Awaited<ReturnType<GetTriggerConfigurations>>;

    const processor = new MonitorProcessor(
      prisma,
      publish,
      executeQuery,
      getTriggers,
    );

    const event = makeEvent(projectId, [monitorId]);
    await processor.process(event, justAfterRunAt);

    const offsetMs = 30_000;
    const windowMs = 5 * 60_000;
    const expectedTo = new Date(runAt.getTime() - offsetMs).toISOString();
    const expectedFrom = new Date(
      runAt.getTime() - offsetMs - windowMs,
    ).toISOString();

    expect(capturedQuery).toEqual({
      fromTimestamp: expectedFrom,
      toTimestamp: expectedTo,
    });

    expect(publish).toHaveBeenCalledTimes(1);
    const sent = publish.mock.calls[0][0].payload;
    if (sent.type !== "monitor-alert") throw new Error("unexpected envelope");
    expect(sent.payload.fromTimestamp.toISOString()).toBe(expectedFrom);
    expect(sent.payload.toTimestamp.toISOString()).toBe(expectedTo);
    // The cadence-boundary stamp stays unshifted — alerts say "fired at runAt".
    expect(sent.payload.timestamp.toISOString()).toBe(runAt.toISOString());
  });
});

describe("MonitorProcessor.process wire deserialization", () => {
  let projectId: string;

  beforeAll(async () => {
    const org = await createOrgProjectAndApiKey();
    projectId = org.projectId;
  });

  afterEach(async () => {
    await prisma.monitor.deleteMany({ where: { projectId } });
  });

  it("coerces a JSON round-tripped event (Redis wire shape) back to typed dates", async () => {
    const monitorId = `m_wire_${v4()}`;
    await seedMonitor(projectId, {
      id: monitorId,
      severity: "UNKNOWN",
      lastPublishedAt: runAt,
      triggerIds: ["trig_wire"],
    });

    let capturedQuery: { fromTimestamp: string; toTimestamp: string } | null =
      null;
    const publish = vi.fn<MonitorPublisher>(async () => {});
    const executeQuery: QueryExecutor = async (_p, query) => {
      capturedQuery = {
        fromTimestamp: query.fromTimestamp,
        toTimestamp: query.toTimestamp,
      };
      return [{ count_count: 200 }];
    };
    const getTriggers: GetTriggerConfigurations = async () =>
      [
        {
          id: "trig_wire",
          filter: matchAnyAlertTrigger.filter,
          eventActions: [],
          automations: [{ id: "auto_wire", actionId: "act_wire" }],
        },
      ] as unknown as Awaited<ReturnType<GetTriggerConfigurations>>;

    const processor = new MonitorProcessor(
      prisma,
      publish,
      executeQuery,
      getTriggers,
    );

    // Mirror BullMQ: the scheduler stringifies the bigint batch id, then Redis
    // round-trips the payload through JSON, turning runAt/publishedAt into ISO strings.
    const event = makeEvent(projectId, [monitorId]);
    const wire: MonitorQueueEventInput = JSON.parse(
      JSON.stringify({
        ...event,
        schedulerBatchId: event.schedulerBatchId.toString(),
      }),
    );

    await processor.process(wire, justAfterRunAt);

    const expectedTo = new Date(runAt.getTime() - 30_000).toISOString();
    const expectedFrom = new Date(
      runAt.getTime() - 30_000 - 5 * 60_000,
    ).toISOString();
    expect(capturedQuery).toEqual({
      fromTimestamp: expectedFrom,
      toTimestamp: expectedTo,
    });
    expect(publish).toHaveBeenCalledTimes(1);
  });
});

describe("MonitorProcessor.process count metric", () => {
  let projectId: string;

  beforeAll(async () => {
    const org = await createOrgProjectAndApiKey();
    projectId = org.projectId;
  });

  afterEach(async () => {
    await prisma.monitor.deleteMany({ where: { projectId } });
  });

  it("appends the count_count metric exactly once for a count monitor", async () => {
    const monitorId = `m_count_${v4()}`;
    await seedMonitor(projectId, {
      id: monitorId,
      severity: "UNKNOWN",
      lastPublishedAt: runAt,
    });

    let capturedMetrics: { measure: string; aggregation: string }[] = [];
    const publish = vi.fn<MonitorPublisher>(async () => {});
    const executeQuery: QueryExecutor = async (_p, query) => {
      capturedMetrics = query.metrics;
      return [{ count_count: 5 }];
    };
    const getTriggers: GetTriggerConfigurations = async () =>
      [] as unknown as Awaited<ReturnType<GetTriggerConfigurations>>;

    const processor = new MonitorProcessor(
      prisma,
      publish,
      executeQuery,
      getTriggers,
    );

    await processor.process(makeEvent(projectId, [monitorId]), justAfterRunAt);

    expect(
      capturedMetrics.filter(
        (m) => m.measure === "count" && m.aggregation === "count",
      ),
    ).toHaveLength(1);
  });
});
