type TimeAxisTickViewProps = {
  x?: number;
  y?: number;
  payload?: { value?: unknown };
  index?: number;
  visibleTicksCount?: number;
};

/**
 * Temporal x-axis tick. The last shown tick sits on the last bucket, flush
 * with the plot's right edge — a centered "Aug 11" clips to "Aug 1". End-anchor
 * that last label so it stays on-canvas; every other tick stays centered.
 */
function TimeAxisTick({
  x,
  y,
  payload,
  index,
  visibleTicksCount,
  formatter,
}: TimeAxisTickViewProps & { formatter: (raw: unknown) => string }) {
  if (x == null || y == null) return null;
  const isLast = visibleTicksCount != null && index === visibleTicksCount - 1;
  return (
    <text
      x={x}
      y={y}
      dy={8}
      textAnchor={isLast ? "end" : "middle"}
      className="fill-muted-foreground/90"
      fontSize={12}
    >
      {formatter(payload?.value)}
    </text>
  );
}

export function timeAxisTick(formatter: (raw: unknown) => string) {
  return function TimeAxisTickRenderer(props: TimeAxisTickViewProps) {
    return <TimeAxisTick {...props} formatter={formatter} />;
  };
}
