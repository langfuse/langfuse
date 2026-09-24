// The chart-view feature's public client surface (RFC rule 8). Named
// re-exports only — exactly what other features already imported.
//
// EventsChartView stays a page-level deep import. types, vocab, and
// chartFilterCompatibility stay off this door: the last pulls search-bar,
// and putting it (or the page) on a barrel that scores-chart-view types
// would share would load that graph into type-only consumers.
export { AddToDashboardButton } from "@/src/features/chart-view/components/AddToDashboardButton";
export { ChartCanvas } from "@/src/features/chart-view/components/ChartCanvas";
export { ChartViewPanel } from "@/src/features/chart-view/components/ChartViewPanel";
export {
  AggregationSelect,
  BreakdownSelect,
  ChartTypePicker,
  GranularitySelect,
  MetricSelect,
} from "@/src/features/chart-view/components/ConfigControls";
export { ViewModeToggle } from "@/src/features/chart-view/components/ViewModeToggle";
export type { ChartWidgetInput } from "@/src/features/chart-view/lib/chartConfigToWidget";
export { useChartViewState } from "@/src/features/chart-view/lib/useChartViewState";
