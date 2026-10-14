// The score-analytics feature's public client surface (RFC rule 8). Named
// re-exports only — exactly what other features already imported.
export type { ScoreOption } from "@/src/analytics/score-reporting/components/charts/ScoreCombobox";
export { ScoreAnalyticsDashboard } from "@/src/analytics/score-reporting/components/ScoreAnalyticsDashboard";
export { ScoreAnalyticsHeader } from "@/src/analytics/score-reporting/components/ScoreAnalyticsHeader";
export {
  ScoreAnalyticsProvider,
  type DataType,
} from "@/src/analytics/score-reporting/components/ScoreAnalyticsProvider";
export { useAnalyticsUrlState } from "@/src/analytics/score-reporting/lib/analytics-url-state";
