import { useState } from "react";
import {
  type TableDateRange,
  type TimeRange,
  toAbsoluteTimeRange,
} from "@/src/utils/date-range-utils";

/**
 * A relative window ("past 24h") re-resolved on every refresh tick minted a
 * fresh absolute `from`/`to`, i.e. a new tRPC query key per tick — so every
 * refresh was a cold load with no cached rows. This anchors the window instead:
 *
 * - relative ranges stay open-ended at the top (`to: undefined`), so rows that
 *   arrive after the anchor still match without re-resolving the window,
 * - the anchor is only replaced when the user picks another range or when it has
 *   drifted past its budget, which keeps the query key — and therefore the rows
 *   on screen — stable across refreshes.
 */
const DRIFT_BUDGET_FRACTION = 0.1;
const MIN_DRIFT_BUDGET_MS = 60_000;

export type LiveTableDateRange = {
  /** What the table queries: open-ended at the top for a relative range. */
  range: TableDateRange | undefined;
  /**
   * The instant the window was anchored — its closed upper bound. Consumers that
   * need a closed window (charts) pair this with `range.from`; the table's own
   * filter deliberately leaves the top open so late-arriving rows still match.
   */
  anchoredTo: Date | undefined;
};

type Anchor = {
  timeRange: TimeRange;
  anchoredAt: number;
  /** Only relative windows drift with wall-clock time. */
  isRelative: boolean;
  value: LiveTableDateRange;
};

const isSameTimeRange = (a: TimeRange, b: TimeRange): boolean => {
  if ("range" in a || "range" in b) {
    return "range" in a && "range" in b && a.range === b.range;
  }
  return (
    a.from.getTime() === b.from.getTime() && a.to.getTime() === b.to.getTime()
  );
};

const anchorTimeRange = (timeRange: TimeRange, now: number): Anchor => {
  const isRelative = "range" in timeRange;
  const absolute = toAbsoluteTimeRange(timeRange);

  return {
    timeRange,
    anchoredAt: now,
    isRelative,
    value: {
      range: absolute
        ? { from: absolute.from, to: isRelative ? undefined : absolute.to }
        : undefined,
      anchoredTo: absolute
        ? isRelative
          ? new Date(now)
          : absolute.to
        : undefined,
    },
  };
};

/** How far the anchor may fall behind wall-clock time before it is replaced. */
const driftBudgetMs = (anchor: Anchor): number => {
  const windowMs = anchor.value.range
    ? anchor.anchoredAt - anchor.value.range.from.getTime()
    : 0;
  return Math.max(windowMs * DRIFT_BUDGET_FRACTION, MIN_DRIFT_BUDGET_MS);
};

const isAnchorStale = (anchor: Anchor, now: number): boolean =>
  anchor.isRelative &&
  anchor.value.range !== undefined &&
  now - anchor.anchoredAt > driftBudgetMs(anchor);

/**
 * Resolves a table's (possibly relative) time range into an absolute window
 * whose identity is stable across refreshes, so refetching keeps the rows that
 * are already on screen instead of cold-loading a new query key.
 */
export function useLiveTableDateRange(
  timeRange: TimeRange,
): LiveTableDateRange {
  const [anchor, setAnchor] = useState<Anchor>(() =>
    anchorTimeRange(timeRange, Date.now()),
  );

  const now = Date.now();
  if (
    !isSameTimeRange(anchor.timeRange, timeRange) ||
    isAnchorStale(anchor, now)
  ) {
    const next = anchorTimeRange(timeRange, now);
    setAnchor(next);
    return next.value;
  }

  return anchor.value;
}
