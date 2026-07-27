import { useEffect, useRef, useState } from "react";

// Approximate horizontal room one x-axis label needs (incl. a gap). Labels are
// now single-unit ("2 PM" / "Jun 28" / "Jun 2026"), so ~64px is comfortable.
const APPROX_LABEL_PX = 64;
const AXIS_GUTTER_PX = 56;

/**
 * Measures the chart's width and returns how many x-axis ticks comfortably fit
 * (`maxTicks`). The preparer (`prepareTimeAxis`) turns that budget into the
 * actual tick interval + labels — this hook only measures. (LFE-10549)
 */
export function useChartTickBudget() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const maxTicks =
    width > 0
      ? Math.max(2, Math.floor((width - AXIS_GUTTER_PX) / APPROX_LABEL_PX))
      : 6;

  return { ref, maxTicks };
}
