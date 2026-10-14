// The widgets feature's public client surface (RFC rule 8). Named re-exports
// only — the chart library, widget components and import/export helpers other
// features already imported by file path.
//
// filters' multi-select and single-select, events' outlier-strip binning,
// and DashboardGrid stay on deep paths: routing them through this index
// would close runtime cycles between widgets and those features.
export { Chart } from "@/src/analytics/visualization/chart-library/Chart";
export { ChartLoadingState } from "@/src/analytics/visualization/chart-library/ChartLoadingState";
export { VerticalBarChartTimeSeries } from "@/src/analytics/visualization/chart-library/VerticalBarChartTimeSeries";
export { downloadChartDataCsv } from "@/src/analytics/visualization/chart-library/downloadChartDataCsv";
export type {
  DataPoint,
  LegendSummaryMode,
  MetricFormatterFunction,
  MissingBucketValue,
} from "@/src/analytics/visualization/chart-library/chart-props";
export { parseChartTimestamp } from "@/src/analytics/visualization/chart-library/prepareTimeAxis";
export { formatMetric } from "@/src/analytics/visualization/chart-library/utils";
export type { DashboardPlacement } from "@/src/analytics/visualization/components/DashboardGrid";
export { useClipboardWidgetProbe } from "@/src/analytics/visualization/hooks/useClipboardWidgetProbe";
export { pushDownForInsertion } from "@/src/analytics/visualization/utils/grid-placement";
export { WidgetContent } from "@/src/analytics/visualization/components/InlineWidget";
export { WidgetPropertySelectItem } from "@/src/analytics/visualization/components/WidgetPropertySelectItem";
export type { WidgetDimensionConfig } from "@/src/analytics/visualization/hooks/useWidgetQuery";
export {
  getWidgetMetricPresentation,
  getWidgetMissingBucketValue,
} from "@/src/analytics/visualization/utils";
export {
  buildWidgetExport,
  parseImportedWidgetJson,
  parsePastedWidget,
  toWidgetCreateFields,
} from "@/src/analytics/visualization/utils/import-export-utils";
export type {
  PastedWidgetParseResult,
  WidgetExportSource,
  WidgetImport,
} from "@/src/analytics/visualization/utils/import-export-utils";
export { DashboardWidget } from "@/src/analytics/visualization/components/DashboardWidget";
export { WidgetForm } from "@/src/analytics/visualization/components/WidgetForm";
export { ConnectedDashboardWidgetTable } from "@/src/analytics/visualization/components/WidgetTable/ConnectedWidgetTable";
