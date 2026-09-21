// The dashboard feature's public client surface (RFC rule 8). Named
// re-exports only — exactly what other features already imported from this
// feature's client modules.
//
// SelectDashboardDialog, home-preset-registry, and
// useDashboardQueryScheduler stay off this door: mapping helpers are
// imported by widgets/utils and scores adapters, and putting the dialog or
// home-chart registry here would load that UI into every mapping consumer.
// dashboardUiTableToViewMapping stays a deep import for server callers
// (rule 10). Pages and dashboardRouter stay off this door.
export {
  buildTableFilterHref,
  buildViewAsTableHint,
} from "@/src/features/dashboard/lib/buildTableFilterHref";
export {
  compareViewChartDataToDataPoints,
  getCompareViewChartUnit,
} from "@/src/features/dashboard/lib/chart-data-adapters";
export {
  displayNameForFilterColumn,
  getWidgetImportFilterConfig,
  mapLegacyUiTableFilterToView,
  mapViewFilterToUiTableFilter,
  mapWidgetUiTableFilterToView,
  normalizeStoredWidgetFiltersForEditor,
  partitionStoredUiTableFiltersToView,
  partitionWidgetUiTableFiltersToView,
} from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
export {
  isEmptyChart,
  RESOURCE_METRICS,
  transformAggregatedRunMetricsToChartData,
  transformCategoricalScoresToChartData,
  uniqueAndSort,
} from "@/src/features/dashboard/lib/score-analytics-utils";
export { buildPresetExport } from "@/src/features/dashboard/utils/dashboard-import-export";
