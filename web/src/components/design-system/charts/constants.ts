export const chartColors = [
  "#6066d7",
  "#cf6100",
  "#00937d",
  "#8e55c4",
  "#b97500",
  "#3084e8",
  "#298d20",
  "#b7438c",
] as const;

/** Bars, areas and pies read heavier than lines, so they use the calmer fill set. */
export const chartFillColors = Array.from(
  { length: 8 },
  (_, index) => `hsl(var(--chart-fill-${index + 1}))`,
);

export function toChartFill(color: string): string {
  const token = color.match(/^hsl\(var\(--chart-(\d)\)\)$/);
  if (token) return `hsl(var(--chart-fill-${token[1]}))`;
  const index = (chartColors as readonly string[]).indexOf(color);
  return index >= 0 ? (chartFillColors[index] ?? color) : color;
}

export const INACTIVE_CHART_COLOR_STRENGTH = 20;
export const CHART_TRANSITION_DURATION = "150ms";
