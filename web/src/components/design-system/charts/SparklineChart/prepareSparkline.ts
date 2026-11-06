type SparklinePoint = { x: number; y: number };

export type SparklinePlot = {
  width: number;
  height: number;
  lines: { path: string; area: string }[];
  points: SparklinePoint[];
};

/** Uniformly spaced samples. Missing samples break the line; zero stays zero. */
export function prepareSparkline(
  values: readonly (number | null)[],
): SparklinePlot {
  const width = 160;
  const height = 36;
  const inset = 2;
  const finiteValues = values.filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  const minimum = Math.min(0, ...finiteValues);
  const maximum = Math.max(0, ...finiteValues);
  const extent = maximum - minimum || 1;
  const y = (value: number) =>
    height - inset - ((value - minimum) / extent) * (height - 2 * inset);
  const baseline = y(0);
  const segments: SparklinePoint[][] = [];
  let segment: SparklinePoint[] = [];
  for (const [index, value] of values.entries()) {
    if (value === null || !Number.isFinite(value)) {
      if (segment.length) segments.push(segment);
      segment = [];
      continue;
    }
    segment.push({
      x:
        values.length === 1
          ? width / 2
          : inset + (index / (values.length - 1)) * (width - 2 * inset),
      y: y(value),
    });
  }
  if (segment.length) segments.push(segment);

  const lines = segments
    .filter((points) => points.length > 1)
    .map((points) => {
      const path = points
        .map(
          (point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`,
        )
        .join(" ");
      return {
        path,
        area: `${path} L${points[points.length - 1].x},${baseline} L${points[0].x},${baseline} Z`,
      };
    });
  return {
    width,
    height,
    lines,
    points: segments.filter((points) => points.length === 1).flat(),
  };
}
