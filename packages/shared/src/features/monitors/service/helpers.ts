/** service/helpers.ts contains the mapping + calculate helpers consumed
 * by MonitorService. Exported so that colocated unit tests can exercise them,
 * but intentionally not re-exported from the service barrel — internal
 * implementation detail of the service. */
import { createHash } from "node:crypto";
import {
  type Monitor as PrismaMonitor,
  MonitorView as PrismaMonitorView,
  Prisma,
} from "@prisma/client";
import { type z } from "zod";

import { InvalidRequestError } from "../../../errors";
import { type singleFilter } from "../../../interfaces/filters";

import { DAY, HOUR, MINUTE, WEEK } from "../helpers";
import {
  type Monitor,
  type MonitorFilters,
  type MonitorSeverity,
  MonitorSeveritySchema,
  type MonitorStatus,
  type MonitorView,
  type MonitorWindow,
  MonitorSchema,
} from "../types";

import { MonitorNotFoundError, type MonitorListOrderBy } from "./types";

/** nullableOrderColumns is the list of sortable columns that are nullable. */
export const nullableOrderColumns: ReadonlySet<MonitorListOrderBy> = new Set([
  "severityChangedAt",
  "alertedAt",
]);

/** filterableMonitorColumns enumerates the filter columns the monitors list endpoint honors. */
const filterableMonitorColumns = new Set<string>(["severity", "tags"]);

type SingleFilter = z.infer<typeof singleFilter>;

/** filterStateToMonitorWhere translates the monitors list FilterState into Prisma where clauses. */
export const filterStateToMonitorWhere = (
  filter: SingleFilter[] | undefined,
): Prisma.MonitorWhereInput[] => {
  if (!filter) return [];
  const clauses: Prisma.MonitorWhereInput[] = [];
  for (const f of filter) {
    if (!filterableMonitorColumns.has(f.column)) continue;
    if (f.column === "severity" && f.type === "stringOptions") {
      const values = f.value
        .map((v) => MonitorSeveritySchema.safeParse(v))
        .flatMap((r) => (r.success ? [r.data] : []));
      // UI presents UNKNOWN and NO_DATA as one "NO DATA" filter; expand here
      // so `any of` includes both and `none of` excludes both.
      if (values.includes("NO_DATA") && !values.includes("UNKNOWN")) {
        values.push("UNKNOWN");
      }
      if (values.length === 0) continue;
      clauses.push(
        f.operator === "any of"
          ? { severity: { in: values } }
          : { NOT: { severity: { in: values } } },
      );
      continue;
    }
    if (f.column === "tags" && f.type === "arrayOptions") {
      if (f.operator === "any of") {
        if (f.value.length === 0) continue;
        clauses.push({ tags: { hasSome: f.value } });
      } else if (f.operator === "all of") {
        if (f.value.length === 0) continue;
        clauses.push({ tags: { hasEvery: f.value } });
      } else if (f.operator === "none of") {
        if (f.value.length === 0) continue;
        clauses.push({ NOT: { tags: { hasSome: f.value } } });
      }
    }
  }
  return clauses;
};

/**
 * canonicalizeFilter normalizes a single filter for canonical comparison.
 * For the set-semantics filter variants (`stringOptions` / `categoryOptions` /
 * `arrayOptions`, all of which use `any of` / `none of` / `all of` over a
 * `string[]` value) element order is semantically irrelevant, so the value
 * array is sorted. Otherwise the filter is returned unchanged.
 *
 * Without this, `["prod","staging"]` and `["staging","prod"]` would produce
 * different `schedulerBatchId` values for logically-identical filters,
 * fragmenting the worker batching optimization the helper exists to enable.
 */
const canonicalizeFilter = (
  f: MonitorFilters[number],
): MonitorFilters[number] => {
  if (
    f.type === "stringOptions" ||
    f.type === "categoryOptions" ||
    f.type === "arrayOptions"
  ) {
    return { ...f, value: [...f.value].sort() };
  }
  return f;
};

/**
 * sortFiltersCanonically returns a new array of filters in canonical order:
 * each filter's value is normalized first (set-semantics value arrays are
 * sorted), then filters are sorted by `column` → `operator` → `key` (when
 * present on `stringObject`/`numberObject`/`categoryOptions`/`positionInTrace`
 * variants) → `JSON.stringify(value)`. Same logical filter set → same
 * canonical sequence, regardless of input order.
 */
export const sortFiltersCanonically = (
  filters: MonitorFilters,
): MonitorFilters =>
  filters.map(canonicalizeFilter).sort((a, b) => {
    if (a.column !== b.column) return a.column < b.column ? -1 : 1;
    if (a.operator !== b.operator) return a.operator < b.operator ? -1 : 1;
    const aKey = "key" in a ? String(a.key) : "";
    const bKey = "key" in b ? String(b.key) : "";
    if (aKey !== bKey) return aKey < bKey ? -1 : 1;
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
    window: windowFromMs(monitor.windowMs),
    alertThreshold: monitor.alertThreshold.toNumber(),
    warningThreshold: monitor.warningThreshold?.toNumber() ?? null,
  });

/** decimalToPrisma converts a nullable JS number to a Prisma.Decimal, preserving null. */
export const decimalToPrisma = (n: number | null): Prisma.Decimal | null =>
  n == null ? null : new Prisma.Decimal(n);

/** updateSeverityForStatus returns the severity transition payload when status flips between ACTIVE and non-ACTIVE; otherwise an empty object. */
export const updateSeverityForStatus = (
  current: MonitorStatus,
  next: MonitorStatus,
): { severity?: MonitorSeverity; severityChangedAt?: Date } => {
  const goingPaused = current === "ACTIVE" && next !== "ACTIVE";
  const goingActive = current !== "ACTIVE" && next === "ACTIVE";
  if (goingPaused) return { severity: "PAUSED", severityChangedAt: new Date() };
  if (goingActive)
    return { severity: "UNKNOWN", severityChangedAt: new Date() };
  return {};
};

/** errorFromPrisma converts a Prisma row-not-found error to MonitorNotFoundError. */
export const errorFromPrisma = (
  id: string,
  projectId: string,
  e: unknown,
): Error => {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
    return new MonitorNotFoundError(id, projectId);
  }
  return e as Error;
};
