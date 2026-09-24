// The widgets feature's public client surface (RFC rule 8). Named re-exports
// only — the chart library, widget components and import/export helpers other
// features already imported by file path.
//
// filters' multi-select and single-select, events' outlier-strip binning,
// and DashboardGrid stay on deep paths: routing them through this index
// would close runtime cycles between widgets and those features.
export { Chart } from "@/src/features/widgets/chart-library/Chart";
export { ChartLoadingState } from "@/src/features/widgets/chart-library/ChartLoadingState";
export type {
  DataPoint,
  LegendSummaryMode,
  MetricFormatterFunction,
  MissingBucketValue,
} from "@/src/features/widgets/chart-library/chart-props";
export { parseChartTimestamp } from "@/src/features/widgets/chart-library/prepareTimeAxis";
export { formatMetric } from "@/src/features/widgets/chart-library/utils";
export type { DashboardPlacement } from "@/src/features/widgets/components/DashboardGrid";
export { useClipboardWidgetProbe } from "@/src/features/widgets/hooks/useClipboardWidgetProbe";
export { pushDownForInsertion } from "@/src/features/widgets/utils/grid-placement";
export { WidgetContent } from "@/src/features/widgets/components/InlineWidget";
export { WidgetPropertySelectItem } from "@/src/features/widgets/components/WidgetPropertySelectItem";
export type { WidgetDimensionConfig } from "@/src/features/widgets/hooks/useWidgetQuery";
export {
  getWidgetMetricPresentation,
  getWidgetMissingBucketValue,
} from "@/src/features/widgets/utils";
export {
  buildWidgetExport,
  parseImportedWidgetJson,
  parsePastedWidget,
  toWidgetCreateFields,
} from "@/src/features/widgets/utils/import-export-utils";
export type {
  PastedWidgetParseResult,
  WidgetExportSource,
  WidgetImport,
} from "@/src/features/widgets/utils/import-export-utils";
export { DashboardWidget } from "@/src/features/widgets/components/DashboardWidget";
export { WidgetForm } from "@/src/features/widgets/components/WidgetForm";
export { ConnectedDashboardWidgetTable } from "@/src/features/widgets/components/WidgetTable/ConnectedWidgetTable";
