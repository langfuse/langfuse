const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Received data within a day: the project is in use. */
export const LIVE_WITHIN_MS = DAY_MS;
/** Nothing for a few days is worth a glance; beyond a week it is stale. */
export const QUIET_WITHIN_MS = 7 * DAY_MS;

export type IngestionStatus =
  | { kind: "not-set-up" }
  | { kind: "checking" }
  | { kind: "live" | "quiet" | "stale"; lastTraceAt: Date }
  /** Has received data before, but none in the 30-day window the last trace is read from. */
  | { kind: "inactive" };

/**
 * Whether a project is receiving data. `lastTraceAt` is `undefined` while it
 * is still loading and `null` when no trace arrived in the last 30 days.
 * A recent trace wins over a `hasTraces` flag that has not caught up yet.
 */
export function getIngestionStatus({
  hasTraces,
  lastTraceAt,
  now,
}: {
  hasTraces: boolean;
  lastTraceAt: Date | null | undefined;
  now: number;
}): IngestionStatus {
  if (lastTraceAt) {
    const age = now - lastTraceAt.getTime();
    if (age < LIVE_WITHIN_MS) return { kind: "live", lastTraceAt };
    if (age < QUIET_WITHIN_MS) return { kind: "quiet", lastTraceAt };
    return { kind: "stale", lastTraceAt };
  }
  if (!hasTraces) return { kind: "not-set-up" };
  return lastTraceAt === undefined
    ? { kind: "checking" }
    : { kind: "inactive" };
}
