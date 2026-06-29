import { useEffect, useRef, useState } from "react";
import { getEvenTickInterval } from "@/src/features/widgets/chart-library/utils";

// Roughly the horizontal room one x-axis label needs, incl. a gap. The widest
// common label is a date+time like "6/28, 11 PM" (~78px at 12px) — pad to ~92
// so neighbours never touch.
const APPROX_LABEL_PX = 92;
// Approximate non-plot horizontal chrome (the y-axis + its ticks) to subtract
// from the measured container width.
const AXIS_GUTTER_PX = 56;

/**
 * Width-aware x-axis tick interval: returns a container ref to attach to the
 * chart wrapper plus a recharts numeric `interval` that shows evenly-spaced
 * ticks — as many as fit the measured width without labels colliding. Keeps the
 * spacing uniform (unlike `minTickGap`, which drops ticks unevenly) while
 * avoiding the overlap a fixed tick count causes on narrow charts. (LFE-10549)
 */
export function useResponsiveTickInterval(pointCount: number) {
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

  return { ref, interval: getEvenTickInterval(pointCount, maxTicks) };
}
