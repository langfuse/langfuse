/** The 8-slot chart line palette, cycled by series index. */
export const seriesColor = (index: number): string =>
  `hsl(var(--chart-${(index % 8) + 1}))`;

/** The matching fill slot, for bars and areas. */
export const seriesFillColor = (index: number): string =>
  `hsl(var(--chart-fill-${(index % 8) + 1}))`;
