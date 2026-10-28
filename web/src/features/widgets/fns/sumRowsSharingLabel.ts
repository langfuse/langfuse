import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";

/**
 * Sums rows that land on the same (bucket, label) once a label map has folded
 * several dimension values into one label. Only valid for additive metrics
 * (sum, count): an average or a unique count cannot be summed. Without a time
 * axis the rows are re-sorted by value, descending, as the merge can change
 * the server's order.
 */
export function sumRowsSharingLabel(
  rows: readonly DataPoint[],
  { isTimeSeries }: { isTimeSeries: boolean },
): DataPoint[] {
  const merged = new Map<string, DataPoint & { metric: number }>();
  const result: DataPoint[] = [];
  for (const row of rows) {
    if (row.dimension === undefined || typeof row.metric !== "number") {
      result.push(row);
      continue;
    }
    const key = JSON.stringify([row.time_dimension ?? null, row.dimension]);
    const existing = merged.get(key);
    if (existing) {
      existing.metric += row.metric;
    } else {
      const copy = { ...row, metric: row.metric };
      merged.set(key, copy);
      result.push(copy);
    }
  }

  if (isTimeSeries) return result;
  return result.toSorted(
    (a, b) =>
      (typeof b.metric === "number" ? b.metric : 0) -
      (typeof a.metric === "number" ? a.metric : 0),
  );
}
