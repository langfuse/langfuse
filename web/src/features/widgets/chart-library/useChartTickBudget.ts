import { useEffect, useRef, useState } from "react";

// Approximate horizontal room one x-axis label needs (incl. a gap). Labels are
// now single-unit ("2 PM" / "Jun 28" / "Jun 2026"), so ~64px is comfortable.
const APPROX_LABEL_PX = 64;
const AXIS_GUTTER_PX = 56;

// Vertical room one y-axis label needs. Below it recharts silently drops
// colliding labels and which ones survive is arbitrary — a 63px band came out
// labelled "1" and "0.25", with no zero.
const APPROX_Y_LABEL_PX = 28;

/** Recharts' own YAxis default; the budget only ever thins below it. */
const DEFAULT_Y_TICK_COUNT = 5;

/**
 * Measures the chart's box and returns how many ticks comfortably fit on each
 * axis (`maxTicks` across, `maxYTicks` down). The preparer (`prepareTimeAxis`)
 * turns the x budget into the actual tick interval + labels — this hook only
 * measures.
 */
export function useChartTickBudget() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      setSize({ width: box?.width ?? 0, height: box?.height ?? 0 });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const maxTicks =
    size.width > 0
      ? Math.max(2, Math.floor((size.width - AXIS_GUTTER_PX) / APPROX_LABEL_PX))
      : 6;

  const maxYTicks =
    size.height > 0
      ? Math.min(
          DEFAULT_Y_TICK_COUNT,
          Math.max(2, Math.floor(size.height / APPROX_Y_LABEL_PX)),
        )
      : DEFAULT_Y_TICK_COUNT;

  return { ref, maxTicks, maxYTicks };
}
