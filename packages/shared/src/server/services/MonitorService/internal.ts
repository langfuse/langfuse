/** internal.ts contains private constants and pure scheduler primitives used
 * by MonitorService and (in the future) the scheduler/worker. Do NOT export
 * from the package barrel. */
import { createHash } from "node:crypto";
import { type z } from "zod";

import { type singleFilter } from "../../../interfaces/filters";
import { type viewsV2 } from "../../../features/query/types";

/**
 * SECOND is one second in milliseconds.
 */
export const SECOND = 1000n;

/**
 * MINUTE one minute in milliseconds.
 */
export const MINUTE = 60n * SECOND;

/**
 * HOUR is one hour in milliseconds.
 */
export const HOUR = 60n * MINUTE;

/**
 * DAY is one day in milliseconds.
 */
export const DAY = 24n * HOUR;

/**
 * WEEK is one week in milliseconds.
 */
export const WEEK = 7n * DAY;

type Filter = z.infer<typeof singleFilter>;

/**
 * sortFiltersCanonically returns a new array sorted by `column`, then `operator`,
 * then `JSON.stringify(value)`. Same logical filter set → same canonical sequence,
 * regardless of input order.
 */
export const sortFiltersCanonically = (filters: Filter[]): Filter[] =>
  [...filters].sort((a, b) => {
    if (a.column !== b.column) return a.column < b.column ? -1 : 1;
    if (a.operator !== b.operator) return a.operator < b.operator ? -1 : 1;
    const av = JSON.stringify(a.value);
    const bv = JSON.stringify(b.value);
    if (av !== bv) return av < bv ? -1 : 1;
    return 0;
  });

/**
 * calculateSchedulerBatchId fingerprints the query shape that the scheduler groups by:
 * (projectId, view, canonicalized filters, windowMs). Output fits Postgres BIGINT
 * (nonneg i63).
 */
export const calculateSchedulerBatchId = (params: {
  projectId: string;
  view: z.infer<typeof viewsV2>;
  filters: Filter[];
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
 * calculateLastRunAt picks the most recent cadence boundary at or before `now`,
 * offset by `(schedulerBatchId % 60) * 1000` ms. Persisted as `monitor.nextRunAt`
 * on create/update so the scheduler picks the monitor up on its very next tick and
 * advances it onto the deterministic slot.
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
