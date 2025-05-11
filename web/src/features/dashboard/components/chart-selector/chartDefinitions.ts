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
  { key: "scores", label: "Scores (total)" },
  { key: "traces-by-time", label: "Traces by time" },
  { key: "model-usage", label: "Model Usage" },
  { key: "user-consumption", label: "User Consumption" },
  { key: "chart-scores", label: "Scores (avg)" },
  { key: "latency-tables", label: "Latency Percentiles" },
  { key: "model-latencies", label: "Model Latencies" },
  { key: "scores-analytics", label: "Scores Analytics" },
];

// Full existing list for testing:

// Chart labels & Component names

// Traces - TracesBarListChart
// Model costs - ModelCostTable
// Scores - ScoresTable
// Traces by time - TracesAndObservationsTimeSeriesChart
// Model Usage - ModelUsageChart
// User consumption - UserChart
// Scores - ChartScores
// Trace latency percentiles - LatencyTables
// Generation latency percentiles - LatencyTables
// Span latency percentiles - LatencyTables
// Model latencies - GenerationalLatencyChart
// Scores Analytics - ScoreAnalytics

// Default layout:

// Line 1:
// Traces - TracesBarListChart
// Model costs - ModelCostTable
// Scores - ScoresTable

// Line 2:
// Traces by time - TracesAndObservationsTimeSeriesChart
// Model Usage - ModelUsageChart

// Line 4:
// User consumption - UserChart
// Scores - ChartScores

// Line 5:
// Trace latency percentiles - LatencyTables
// Generation latency percentiles - LatencyTables
// Span latency percentiles - LatencyTables

// Line 6:
// Model latencies - GenerationalLatencyChart

// Line 7:
// Scores Analytics - ScoreAnalytics
