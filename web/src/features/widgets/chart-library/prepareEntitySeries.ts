import { type DataPoint } from "./chart-props";

/** Preserve entity identity and reserve a gap for entities without measurements. */
export function prepareEntitySeries(
  data: DataPoint[],
  labels: Record<string, string>,
): DataPoint[] {
  const byId = new Map<string, DataPoint[]>();
  for (const point of data) {
    const id = point.time_dimension;
    if (id === undefined) continue;
    const points = byId.get(id) ?? [];
    points.push(point);
    byId.set(id, points);
  }
  return Object.keys(labels).flatMap(
    (id) =>
      byId.get(id) ?? [
        { time_dimension: id, dimension: undefined, metric: null },
      ],
  );
}
