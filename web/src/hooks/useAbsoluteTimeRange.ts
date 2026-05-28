import { useEffect, useMemo, useState } from "react";
import {
  type AbsoluteTimeRange,
  type TimeRange,
  toAbsoluteTimeRange,
} from "@/src/utils/date-range-utils";

/**
 * Resolves a `TimeRange` (relative preset or absolute range) into concrete
 * `from`/`to` timestamps, re-evaluating "now" for relative presets so the
 * window rolls forward instead of freezing at the moment of selection.
 *
 * Absolute ranges (calendar selection) return a stable value.
 * Relative presets re-evaluate when the tab regains focus or becomes visible
 * again, i.e. when the user returns to the view. This intentionally does NOT
 * poll on a timer: it leaves the per-table auto-refresh dropdown as the only
 * mechanism that refetches data while the user stays on the page, so the
 * "auto-refresh off" contract is preserved. Reopening the view, however,
 * yields a fresh "Past N hours" window that matches the displayed label.
 *
 * `refreshSignal` lets callers that drive their own auto-refresh cadence
 * (e.g. tables whose refresh interval increments a counter) force the window
 * to roll forward in lockstep with their data refetches.
 */
export function useAbsoluteTimeRange(
  timeRange: TimeRange,
  refreshSignal?: number,
): AbsoluteTimeRange | undefined {
  const isRelative = !("from" in timeRange);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!isRelative || typeof window === "undefined") return;

    const bump = () => setTick((t) => t + 1);
    const onVisibility = () => {
      if (document.visibilityState === "visible") bump();
    };

    window.addEventListener("focus", bump);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", bump);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isRelative]);

  return useMemo(
    () => toAbsoluteTimeRange(timeRange) ?? undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timeRange, tick, refreshSignal],
  );
}
