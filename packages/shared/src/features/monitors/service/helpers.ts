/** service/helpers.ts contains the mapping + calculate helpers consumed
 * by MonitorService. Exported so that colocated unit tests can exercise them,
 * but intentionally not re-exported from the service barrel — internal
 * implementation detail of the service. */
import { createHash } from "node:crypto";
import {
  type Monitor as PrismaMonitor,
  MonitorSeverity as PrismaMonitorSeverity,
  MonitorStatus as PrismaMonitorStatus,
  MonitorThresholdOperator as PrismaMonitorThresholdOperator,
  MonitorView as PrismaMonitorView,
  Prisma,
} from "@prisma/client";

import { InvalidRequestError } from "../../../errors";

import { DAY, HOUR, MINUTE, WEEK } from "../helpers";
import {
  type Monitor,
  type MonitorFilters,
  type MonitorSeverity,
  type MonitorStatus,
  type MonitorThresholdOperator,
  type MonitorView,
  type MonitorWindow,
  MonitorSchema,
} from "../types";

/**
 * sortFiltersCanonically returns a new array sorted by `column`, then
 * `operator`, then `JSON.stringify(value)`. Same logical filter set → same
 * canonical sequence, regardless of input order.
 */
export const sortFiltersCanonically = (
  filters: MonitorFilters,
): MonitorFilters =>
  [...filters].sort((a, b) => {
    if (a.column !== b.column) return a.column < b.column ? -1 : 1;
    if (a.operator !== b.operator) return a.operator < b.operator ? -1 : 1;
    const av = JSON.stringify(a.value);
    const bv = JSON.stringify(b.value);
    if (av !== bv) return av < bv ? -1 : 1;
    return 0;
  });

/**
 * calculateCadence derives a Monitor's scheduler cadence from its evaluation
 * window.
 */
export const calculateCadence = (windowMillis: bigint): bigint => {
  if (windowMillis >= WEEK) return 48n * HOUR;
  if (windowMillis >= DAY) return 30n * MINUTE;
  return MINUTE; // default cadence
};

/**
 * calculateSchedulerBatchId fingerprints the query shape that the scheduler
 * groups by: (projectId, view, canonicalized filters, windowMs). Output fits
 * Postgres BIGINT (nonneg i63).
 */
export const calculateSchedulerBatchId = (params: {
  projectId: string;
  view: MonitorView;
  filters: MonitorFilters;
  windowMs: bigint;
}): bigint => {
  const canonical = sortFiltersCanonically(params.filters);
  const input = [
    params.projectId,
    params.view,
    JSON.stringify(canonical),
    params.windowMs.toString(),
  ].join("\x1f");
  const digest = createHash("sha256").update(input).digest();
  return digest.readBigUInt64BE(0) & ((1n << 63n) - 1n);
};

/**
 * calculateLastRunAt picks the most recent cadence boundary at or before
 * `now`, offset by `(schedulerBatchId % 60) * 1000` ms. Persisted as
 * `monitor.nextRunAt` on create/update so the scheduler picks the monitor up
 * on its very next tick and advances it onto the deterministic slot.
 */
export const calculateLastRunAt = (
  now: Date,
  cadenceMs: bigint,
  schedulerBatchId: bigint,
): Date => {
  const cadence = Number(cadenceMs);
  const offset = Number(schedulerBatchId % 60n) * 1000;
  const aligned =
    Math.floor((now.getTime() - offset) / cadence) * cadence + offset;
  return new Date(aligned);
};

/** viewToPrisma converts the MonitorView api enum to the Prisma MonitorView enum. */
export const viewToPrisma = (view: MonitorView): PrismaMonitorView => {
  switch (view) {
    case "observations":
      return PrismaMonitorView.OBSERVATIONS;
    case "scores-numeric":
      return PrismaMonitorView.SCORES_NUMERIC;
    case "scores-categorical":
      return PrismaMonitorView.SCORES_CATEGORICAL;
  }
};

/** viewFromPrisma converts the Prisma MonitorView enum to the MonitorView api enum. */
export const viewFromPrisma = (view: PrismaMonitorView): MonitorView => {
  switch (view) {
    case PrismaMonitorView.OBSERVATIONS:
      return "observations";
    case PrismaMonitorView.SCORES_NUMERIC:
      return "scores-numeric";
    case PrismaMonitorView.SCORES_CATEGORICAL:
      return "scores-categorical";
  }
};

/** severityFromPrisma converts the Prisma MonitorSeverity enum to the MonitorSeverity api enum. */
export const severityFromPrisma = (
  s: PrismaMonitorSeverity,
): MonitorSeverity => {
  switch (s) {
    case PrismaMonitorSeverity.UNKNOWN:
      return "unknown";
    case PrismaMonitorSeverity.OK:
      return "ok";
    case PrismaMonitorSeverity.WARNING:
      return "warning";
    case PrismaMonitorSeverity.ALERT:
      return "alert";
    case PrismaMonitorSeverity.NO_DATA:
      return "no-data";
  }
};

/** statusToPrisma converts the MonitorStatus api enum to the Prisma MonitorStatus enum. */
export const statusToPrisma = (s: MonitorStatus): PrismaMonitorStatus => {
  switch (s) {
    case "active":
      return PrismaMonitorStatus.ACTIVE;
    case "paused":
      return PrismaMonitorStatus.PAUSED;
    case "error-bad-query":
      return PrismaMonitorStatus.ERROR_BAD_QUERY;
  }
};

/** statusFromPrisma converts the Prisma MonitorStatus enum to the MonitorStatus api enum. */
export const statusFromPrisma = (s: PrismaMonitorStatus): MonitorStatus => {
  switch (s) {
    case PrismaMonitorStatus.ACTIVE:
      return "active";
    case PrismaMonitorStatus.PAUSED:
      return "paused";
    case PrismaMonitorStatus.ERROR_BAD_QUERY:
      return "error-bad-query";
  }
};

/** thresholdOperatorToPrisma converts the MonitorThresholdOperator api enum to the Prisma MonitorThresholdOperator enum. */
export const thresholdOperatorToPrisma = (
  o: MonitorThresholdOperator,
): PrismaMonitorThresholdOperator => {
  switch (o) {
    case "gt":
      return PrismaMonitorThresholdOperator.GT;
    case "gte":
      return PrismaMonitorThresholdOperator.GTE;
    case "lt":
      return PrismaMonitorThresholdOperator.LT;
    case "lte":
      return PrismaMonitorThresholdOperator.LTE;
    case "eq":
      return PrismaMonitorThresholdOperator.EQ;
    case "neq":
      return PrismaMonitorThresholdOperator.NEQ;
  }
};

/** thresholdOperatorFromPrisma converts the Prisma MonitorThresholdOperator enum to the MonitorThresholdOperator api enum. */
export const thresholdOperatorFromPrisma = (
  o: PrismaMonitorThresholdOperator,
): MonitorThresholdOperator => {
  switch (o) {
    case PrismaMonitorThresholdOperator.GT:
      return "gt";
    case PrismaMonitorThresholdOperator.GTE:
      return "gte";
    case PrismaMonitorThresholdOperator.LT:
      return "lt";
    case PrismaMonitorThresholdOperator.LTE:
      return "lte";
    case PrismaMonitorThresholdOperator.EQ:
      return "eq";
    case PrismaMonitorThresholdOperator.NEQ:
      return "neq";
  }
};

/** windowToMs converts the MonitorWindow api enum to a bigint of milliseconds. */
export const windowToMs = (w: MonitorWindow): bigint => {
  switch (w) {
    case "5m":
      return 5n * 60_000n;
    case "10m":
      return 10n * 60_000n;
    case "15m":
      return 15n * 60_000n;
    case "30m":
      return 30n * 60_000n;
    case "1h":
      return 60n * 60_000n;
    case "2h":
      return 2n * 60n * 60_000n;
    case "4h":
      return 4n * 60n * 60_000n;
    case "1d":
      return 24n * 60n * 60_000n;
    case "2d":
      return 2n * 24n * 60n * 60_000n;
    case "1w":
      return 7n * 24n * 60n * 60_000n;
  }
};

/** windowFromMs converts a bigint of milliseconds to the MonitorWindow api enum. */
export const windowFromMs = (ms: bigint): MonitorWindow => {
  switch (ms) {
    case 5n * 60_000n:
      return "5m";
    case 10n * 60_000n:
      return "10m";
    case 15n * 60_000n:
      return "15m";
    case 30n * 60_000n:
      return "30m";
    case 60n * 60_000n:
      return "1h";
    case 2n * 60n * 60_000n:
      return "2h";
    case 4n * 60n * 60_000n:
      return "4h";
    case 24n * 60n * 60_000n:
      return "1d";
    case 2n * 24n * 60n * 60_000n:
      return "2d";
    case 7n * 24n * 60n * 60_000n:
      return "1w";
    default:
      throw new InvalidRequestError(
        `windowMs ${ms.toString()} does not correspond to a known MonitorWindow tier`,
      );
  }
};

/** monitorFromPrisma converts a Prisma monitor row to the domain Monitor. */
export const monitorFromPrisma = (monitor: PrismaMonitor): Monitor =>
  MonitorSchema.parse({
    ...monitor,
    view: viewFromPrisma(monitor.view),
    severity: severityFromPrisma(monitor.severity),
    status: statusFromPrisma(monitor.status),
    thresholdOperator: thresholdOperatorFromPrisma(monitor.thresholdOperator),
    window: windowFromMs(monitor.windowMs),
    alertThreshold: monitor.alertThreshold.toNumber(),
    warningThreshold: monitor.warningThreshold?.toNumber() ?? null,
  });

/** decimalToPrisma converts a nullable JS number to a Prisma.Decimal, preserving null. */
export const decimalToPrisma = (n: number | null): Prisma.Decimal | null =>
  n == null ? null : new Prisma.Decimal(n);

/** errorFromPrisma maps a Prisma client error to a caller-facing Error:
 * P2025 (row not found) becomes `InvalidRequestError`; anything else passes
 * through unchanged. */
export const errorFromPrisma = (
  id: string,
  projectId: string,
  e: unknown,
): Error => {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
    return new InvalidRequestError(
      `Monitor ${id} not found in project ${projectId}`,
    );
  }
  return e as Error;
};
