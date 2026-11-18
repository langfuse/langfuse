import { useCallback, useMemo, useState } from "react";
import {
  type TableDateRange,
  type TimeRange,
} from "@/src/utils/date-range-utils";

type TimeOrderBy = { column: string; order: "ASC" | "DESC" } | null | undefined;

type PinnedWindow = { from: Date; to: Date };

/**
 * Offset paging is only unstable on a live, open-ended timestamp-DESC set:
 * new rows arrive at the top and shift every later page. Timestamp-ASC (and
 * any non-time sort) appends or interleaves without moving page 1's offsets,
 * so a pin would only shrink the window.
 *
 * Null orderBy follows the tables' default (time DESC).
 */
export function isLiveTailTimeSort(
  orderBy: TimeOrderBy,
  timeColumn: string,
): boolean {
  if (!orderBy) return true;
  return orderBy.column === timeColumn && orderBy.order === "DESC";
}

/**
 * Identity of the query context that should drop a pagination snapshot.
 * Relative presets are keyed by name, so a drifting `from` (the live anchor
 * sliding forward) does not reset the pin. An absolute selection, a different
 * preset, sort, or page size does.
 */
export function paginationWindowResetKey(input: {
  orderBy: TimeOrderBy;
  pageSize: number;
  timeRange: TimeRange;
  externalRange?: TableDateRange;
}): string {
  const order = input.orderBy
    ? `${input.orderBy.column}:${input.orderBy.order}`
    : "";
  return `${order}|${input.pageSize}|${selectedRangeKey(input.timeRange, input.externalRange)}`;
}

function selectedRangeKey(
  timeRange: TimeRange,
  externalRange: TableDateRange | undefined,
): string {
  if (externalRange) {
    return `ext:${externalRange.from.getTime()}:${externalRange.to?.getTime() ?? ""}`;
  }
  if ("range" in timeRange) return `rel:${timeRange.range}`;
  return `abs:${timeRange.from.getTime()}:${timeRange.to.getTime()}`;
}

function snapshotOpenWindow(
  range: TableDateRange | undefined,
  to: Date,
): PinnedWindow | null {
  if (!range || range.to) return null;
  return { from: range.from, to };
}

/** A fresh snapshot when still past page 1; page 1 and closed ranges stay open. */
function pinCurrentPage(
  enabled: boolean,
  pageIndex: number,
  range: TableDateRange | undefined,
): PinnedWindow | null {
  if (!enabled || pageIndex <= 0) return null;
  return snapshotOpenWindow(range, new Date());
}

/**
 * Holds the paged result set still while the reader is past the first page.
 *
 * Rows are paged by offset over a timestamp-DESC set, so a window left open at
 * the top grows underneath someone on page 2: every row ingested since page 1
 * was fetched shifts the offsets, repeating rows the reader already saw and
 * pushing others past the last page, while the count query drifts with it.
 *
 * Page 1 is the live tail and stays open-ended. The transition off page 1
 * freezes both bounds: `from` is the window's lower bound at that moment, and
 * `to` is the newest row that was on screen — the top of exactly the set page
 * 1 was computed over, so page 2 continues where page 1 ended. Later page
 * changes keep that snapshot. Taking `to` from the page being left would
 * retreat it on a DESC sort and shrink the counted total. Pinning `to` to
 * "now" instead would re-include everything ingested while the reader sat on
 * page 1.
 *
 * The pin is only *applied* past page 1, so the page state (which lives in the
 * URL and lands a render later than the handler) can never strand it, and
 * returning to page 1 goes live again. Opening a later page directly has no
 * page 1 to align with, so it pins both bounds to that first render (`to` =
 * now). An already-closed window (an absolute range) is left alone.
 *
 * `resetKey` (sort, page size, selected time range) and `resetPin` (column
 * filters, which the key does not see) drop the previous snapshot. When the
 * reader is still past page 1, that drop is a new snapshot (`to` = now, `from`
 * = the current lower bound) so later clicks do not follow the live tail.
 * Page 1 stays open, and the next departure pins to that page's newest row.
 *
 * Pass `enabled: false` for sorts that do not have a live tail (time ASC, or
 * a non-time column). Pinning those to `rows[0]`'s timestamp collapses the
 * window to the first page and the pagination clamp snaps the reader back.
 */
export function usePaginationWindowPin(
  range: TableDateRange | undefined,
  pageIndex: number,
  options?: { enabled?: boolean; resetKey?: string },
) {
  const enabled = options?.enabled ?? true;
  const resetKey = options?.resetKey ?? "";
  const [pinned, setPinned] = useState<PinnedWindow | null>(() =>
    enabled && pageIndex > 0 ? snapshotOpenWindow(range, new Date()) : null,
  );
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  const [wasEnabled, setWasEnabled] = useState(enabled);

  // Sort, page size, and the selected time range share one snapshot. Replace
  // it in the same render the context changes so a URL page update cannot keep
  // querying the previous window. Still being past page 1 takes a fresh
  // snapshot instead of reopening the live tail. Turning the live tail on
  // while already past page 1 pins to now, same as opening that page directly.
  let nextPinned: PinnedWindow | null | undefined;
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey);
    nextPinned = pinCurrentPage(enabled, pageIndex, range);
  }
  if (enabled !== wasEnabled) {
    setWasEnabled(enabled);
    if (enabled && pageIndex > 0) {
      nextPinned = snapshotOpenWindow(range, new Date());
    }
  }
  if (nextPinned !== undefined) {
    setPinned(nextPinned);
  }

  const activePin = enabled && pageIndex > 0 ? pinned : null;

  const pinnedRange = useMemo(
    () =>
      range && !range.to && activePin
        ? { from: activePin.from, to: activePin.to }
        : range,
    [range, activePin],
  );

  /** Call from the pagination handler, where the leaving page's rows are known. */
  const pinOnLeavingFirstPage = useCallback(
    (nextPageIndex: number, newestVisible: Date | undefined) => {
      // Only the transition off page 1 establishes the snapshot. Later pages
      // pass their own newest row; applying that would retreat a DESC window.
      if (!enabled || pageIndex !== 0 || nextPageIndex <= 0) return;
      const next = snapshotOpenWindow(range, newestVisible ?? new Date());
      if (next) setPinned(next);
    },
    [enabled, pageIndex, range],
  );

  const resetPin = useCallback(
    () => setPinned(pinCurrentPage(enabled, pageIndex, range)),
    [enabled, pageIndex, range],
  );

  return {
    range: pinnedRange,
    pinOnLeavingFirstPage,
    resetPin,
  };
}
