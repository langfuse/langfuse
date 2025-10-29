/**
 * Heatmap visualization components for score analytics
 *
 * @example Basic usage with numeric data
 * ```tsx
 * import { Heatmap, HeatmapLegend } from '@/src/features/scores/components/analytics';
 * import { generateNumericHeatmapData } from '@/src/features/scores/lib/heatmap-utils';
 *
 * const { cells, rowLabels, colLabels } = generateNumericHeatmapData({
 *   data: clickhouseResults,
 *   nBins: 10,
 *   colorVariant: 'chart1',
 * });
 *
 * <Heatmap
 *   data={cells}
 *   rows={10}
 *   cols={10}
 *   rowLabels={rowLabels}
 *   colLabels={colLabels}
 *   xAxisLabel="Score 2"
 *   yAxisLabel="Score 1"
 *   renderTooltip={(cell) => <div>Count: {cell.value}</div>}
 * />
 * <HeatmapLegend min={0} max={100} variant="chart1" />
 * ```
 */

export { Heatmap, type HeatmapProps } from "./Heatmap";
export { HeatmapCellComponent } from "./HeatmapCell";
export { HeatmapLegend, type HeatmapLegendProps } from "./HeatmapLegend";
