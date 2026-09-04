import { useCallback, useMemo, useState } from "react";
import { type TableDateRange } from "@/src/utils/date-range-utils";

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
 */
export function usePaginationWindowPin(
  range: TableDateRange | undefined,
  pageIndex: number,
) {
  const [pinnedAt, setPinnedAt] = useState<Date | null>(() =>
    pageIndex > 0 ? new Date() : null,
  );

  const pin = pageIndex > 0 ? pinnedAt : null;

  const pinnedRange = useMemo(
    () => (range && !range.to && pin ? { from: range.from, to: pin } : range),
    [range, pin],
  );

  /** Call from the pagination handler, where the leaving page's rows are known. */
  const pinOnLeavingFirstPage = useCallback(
    (nextPageIndex: number, newestVisible: Date | undefined) => {
      if (nextPageIndex > 0) setPinnedAt(newestVisible ?? new Date());
    },
    [],
  );

  return { range: pinnedRange, pinOnLeavingFirstPage };
}
