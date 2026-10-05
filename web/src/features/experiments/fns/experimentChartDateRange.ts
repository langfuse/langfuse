export function experimentChartDateRange<T>(
  selected: T,
  fallback: T | undefined,
): T {
  return fallback ?? selected;
}
