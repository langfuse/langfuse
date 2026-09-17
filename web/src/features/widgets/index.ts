// The widgets feature's public client surface (RFC rule 8). Named re-exports
// only — the chart library, widget components and import/export helpers other
// features already imported by file path.
//
// filters' multi-select and single-select and events' outlier-strip binning
// stay on deep paths: routing them through this index would close runtime
// cycles between widgets and those features.
export { Chart } from "./chart-library/Chart";
export { ChartLoadingState } from "./chart-library/ChartLoadingState";
export type {
  DataPoint,
  LegendSummaryMode,
  MetricFormatterFunction,
  MissingBucketValue,
} from "./chart-library/chart-props";
export { parseChartTimestamp } from "./chart-library/prepareTimeAxis";
export { formatMetric } from "./chart-library/utils";
export type { DashboardPlacement } from "./components/DashboardGrid";
export { WidgetContent } from "./components/InlineWidget";
export { WidgetPropertySelectItem } from "./components/WidgetPropertySelectItem";
export type { WidgetDimensionConfig } from "./hooks/useWidgetQuery";
export {
  getWidgetMetricPresentation,
  getWidgetMissingBucketValue,
} from "./utils";
export {
  buildWidgetExport,
  parseImportedWidgetJson,
  parsePastedWidget,
} from "./utils/import-export-utils";
export type {
  WidgetExportSource,
  WidgetImport,
} from "./utils/import-export-utils";
export { DashboardWidget } from "./components/DashboardWidget";
export { WidgetForm } from "./components/WidgetForm";
export { DashboardWidgetTable } from "./components/WidgetTable";
