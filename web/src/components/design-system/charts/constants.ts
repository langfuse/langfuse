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
export const chartFillColors = [
  "hsl(var(--chart-fill-1))",
  "hsl(var(--chart-fill-2))",
  "hsl(var(--chart-fill-3))",
  "hsl(var(--chart-fill-4))",
  "hsl(var(--chart-fill-5))",
  "hsl(var(--chart-fill-6))",
  "hsl(var(--chart-fill-7))",
  "hsl(var(--chart-fill-8))",
] as const;

export const INACTIVE_CHART_COLOR_STRENGTH = 20;
export const CHART_TRANSITION_DURATION = "150ms";
