// The score-analytics feature's public client surface (RFC rule 8). Named
// re-exports only — exactly what other features already imported.
export type { ScoreOption } from "@/src/features/score-analytics/components/charts/ScoreCombobox";
export { ScoreAnalyticsDashboard } from "@/src/features/score-analytics/components/ScoreAnalyticsDashboard";
export { ScoreAnalyticsHeader } from "@/src/features/score-analytics/components/ScoreAnalyticsHeader";
export {
  ScoreAnalyticsProvider,
  type DataType,
} from "@/src/features/score-analytics/components/ScoreAnalyticsProvider";
export { useAnalyticsUrlState } from "@/src/features/score-analytics/lib/analytics-url-state";
