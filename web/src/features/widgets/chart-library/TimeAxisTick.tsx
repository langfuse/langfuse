/* eslint-disable @repo/no-null-render */
import type { ReactNode } from "react";
import type { XAxisTickContentProps } from "recharts";

type TimeAxisTickViewProps = {
  x?: number | string;
  y?: number | string;
  payload?: { value?: unknown };
};

function tickCoord(value: number | string | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Temporal x-axis tick. A centered label on the last *bucket* clips at the
 * plot edge ("Aug 11" → "Aug 1"). End-anchor only that last-bucket tick;
 * thinned ticks that are not the last bucket stay centered on their gridline.
 */
function TimeAxisTick({
  x,
  y,
  payload,
  formatter,
  lastValue,
}: TimeAxisTickViewProps & {
  formatter: (raw: unknown) => string;
  lastValue: unknown;
}) {
  const tickX = tickCoord(x);
  const tickY = tickCoord(y);
  if (tickX == null || tickY == null) return null;
  const isLastBucket =
    lastValue != null && String(payload?.value) === String(lastValue);
  return (
    <text
      x={tickX}
      y={tickY}
      dy={8}
      textAnchor={isLastBucket ? "end" : "middle"}
      className="fill-muted-foreground/90"
      fontSize={12}
    >
      {formatter(payload?.value)}
    </text>
  );
}

export function timeAxisTick(
  formatter: (raw: unknown) => string,
  lastValue: unknown,
): (props: XAxisTickContentProps) => ReactNode {
  return function TimeAxisTickRenderer(props: XAxisTickContentProps) {
    return (
      <TimeAxisTick {...props} formatter={formatter} lastValue={lastValue} />
    );
  };
}

/** Visualiser helper: custom tick only on temporal axes (preparer stays React-free). */
export function temporalAxisTickProp(
  timeAxis: { mode: string; formatTick: (raw: unknown) => string },
  lastValue: unknown,
):
  | { tick: (props: XAxisTickContentProps) => ReactNode }
  | Record<string, never> {
  if (timeAxis.mode === "category") return {};
  return { tick: timeAxisTick(timeAxis.formatTick, lastValue) };
}
