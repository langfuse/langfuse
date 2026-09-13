// Client-safe surface for this feature. Named re-exports only — see the
// project's code-structure RFC. Everything else in this feature is internal;
// import it through here.
export { ScoresChartView } from "@/src/features/scores-chart-view/components/ScoresChartView";
export { ScoresOutlierStrip } from "@/src/features/scores-chart-view/components/ScoresOutlierStrip";
export { useScoresChartViewState } from "@/src/features/scores-chart-view/hooks/useScoresChartViewState";
