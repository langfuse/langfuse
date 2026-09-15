import { useCallback, useMemo, useState } from "react";
import { type TableDateRange } from "@/src/utils/date-range-utils";

type TimeOrderBy = { column: string; order: "ASC" | "DESC" } | null | undefined;

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
 * Holds the paged result set still while the reader is past the first page.
 *
 * Rows are paged by offset over a timestamp-DESC set, so a window left open at
 * the top grows underneath someone on page 2: every row ingested since page 1
 * was fetched shifts the offsets, repeating rows the reader already saw and
 * pushing others past the last page, while the count query drifts with it.
 *
 * Page 1 is the live tail and stays open-ended. Leaving it pins the upper bound
 * to the newest row that was on screen — the top of exactly the set page 1 was
 * computed over, so page 2 continues where page 1 ended. Pinning to "now"
 * instead would re-include everything ingested while the reader sat on page 1,
 * which is the same off-by-N it is meant to prevent.
 *
 * The pin is only *applied* past page 1, so the page state (which lives in the
 * URL and lands a render later than the handler) can never strand it, and
 * returning to page 1 goes live again. Opening a later page directly has no page
 * 1 to align with, so it pins to that first render instead. An already-closed
 * window (an absolute range) is left alone.
 *
 * Pass `enabled: false` for sorts that do not have a live tail (time ASC, or
 * a non-time column). Pinning those to `rows[0]`'s timestamp collapses the
 * window to the first page and the pagination clamp snaps the reader back.
 */
export function usePaginationWindowPin(
  range: TableDateRange | undefined,
  pageIndex: number,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled ?? true;
  const [pinnedAt, setPinnedAt] = useState<Date | null>(() =>
    enabled && pageIndex > 0 ? new Date() : null,
  );
  const [wasEnabled, setWasEnabled] = useState(enabled);

  // Switching onto a live-tail sort while already past page 1 is the same as
  // opening that page directly: there is no page-1 newest row to align with.
  // Pin to now so the window is not left open (or pinned to a stale ASC visit).
  if (enabled !== wasEnabled) {
    setWasEnabled(enabled);
    if (enabled && pageIndex > 0) {
      setPinnedAt(new Date());
    }
  }

  const pin = enabled && pageIndex > 0 ? pinnedAt : null;

  const pinnedRange = useMemo(
    () => (range && !range.to && pin ? { from: range.from, to: pin } : range),
    [range, pin],
  );

  /** Call from the pagination handler, where the leaving page's rows are known. */
  const pinOnLeavingFirstPage = useCallback(
    (nextPageIndex: number, newestVisible: Date | undefined) => {
      if (!enabled) return;
      if (nextPageIndex > 0) setPinnedAt(newestVisible ?? new Date());
    },
    [enabled],
  );

  return { range: pinnedRange, pinOnLeavingFirstPage };
}
