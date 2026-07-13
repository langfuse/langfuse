/**
 * Calculate the p-th percentile of a numeric array.
 * Returns 0 for empty arrays.
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = values.toSorted((a, b) => a - b);
  const index = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}
