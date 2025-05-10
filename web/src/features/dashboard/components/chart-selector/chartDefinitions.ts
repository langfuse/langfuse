
export const chartDefinitions = [
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