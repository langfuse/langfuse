/**
 * Defines the list of charts available for filter selection on the dashboard.
 * IMPORTANT: This list must be kept in sync with the charts implemented
 * in `pages/project/[projectId]/index.tsx` to work properly.
 * - `key`: A unique string identifier for the chart. Used for session storage
 *          and conditional rendering (e.g., `selectedChartKeys.includes(key)`).
 * - `label`: The display name for the chart in the MultiSelect component.
 */

export interface DashboardChartDefinition {
  key: string;
  label: string;
}

export const dashboardChartDefinitions: DashboardChartDefinition[] = [
  { key: "traces", label: "Traces" },
  { key: "model-costs", label: "Model Costs" },
  { key: "scores", label: "Scores (total)" }, // All scores tracked
  { key: "traces-by-time", label: "Traces by time" },
  { key: "model-usage", label: "Model Usage" },
  { key: "user-consumption", label: "User Consumption" },
  { key: "chart-scores", label: "Scores (avg)" }, // Moving average per score chart
  { key: "latency-tables", label: "Latency Percentiles" }, // Trace, Generation & Span latency percentile charts
  { key: "model-latencies", label: "Model Latencies" },
  { key: "scores-analytics", label: "Scores Analytics" },
];
