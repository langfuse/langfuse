// The chart-view feature's public client surface (RFC rule 8). Named
// re-exports only — exactly what other features already imported.
//
// EventsChartView stays a page-level deep import. types, vocab, and
// chartFilterCompatibility stay off this door: the last pulls search-bar,
// and putting it (or the page) on a barrel that scores-chart-view types
// would share would load that graph into type-only consumers.
export { AddToDashboardButton } from "@/src/analytics/exploration/components/AddToDashboardButton";
export { ChartCanvas } from "@/src/analytics/exploration/components/ChartCanvas";
export { ChartViewPanel } from "@/src/analytics/exploration/components/ChartViewPanel";
export {
  AggregationSelect,
  BreakdownSelect,
  ChartTypePicker,
  GranularitySelect,
  MetricSelect,
} from "@/src/analytics/exploration/components/ConfigControls";
export { ViewModeToggle } from "@/src/analytics/exploration/components/ViewModeToggle";
export type { ChartWidgetInput } from "@/src/analytics/exploration/lib/chartConfigToWidget";
export { useChartViewState } from "@/src/analytics/exploration/lib/useChartViewState";
