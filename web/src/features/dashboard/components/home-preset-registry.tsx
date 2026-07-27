import { type ReactNode } from "react";
import { type FilterState, type HomeDashboardPresetId } from "@langfuse/shared";
import { type ViewVersion } from "@langfuse/shared/query";
import { type DashboardDateRangeAggregationOption } from "@/src/utils/date-range-utils";
import { TracesBarListChart } from "@/src/features/dashboard/components/TracesBarListChart";
import { ModelCostTable } from "@/src/features/dashboard/components/ModelCostTable";
import { ScoresTable } from "@/src/features/dashboard/components/ScoresTable";
import { TracesAndObservationsTimeSeriesChart } from "@/src/features/dashboard/components/TracesTimeSeriesChart";
import { ModelUsageChart } from "@/src/features/dashboard/components/ModelUsageChart";
import { UserChart } from "@/src/features/dashboard/components/UserChart";
import { ChartScores } from "@/src/features/dashboard/components/ChartScores";
import { LatencyTable } from "@/src/features/dashboard/components/LatencyTables";
import { GenerationLatencyChart } from "@/src/features/dashboard/components/LatencyChart";
import { ScoreAnalytics } from "@/src/features/dashboard/components/score-analytics/ScoreAnalytics";

/**
 * Props bag a "preset" dashboard placement is rendered with. Derived by
 * PresetDashboardWidget from the surrounding dashboard's state (time range,
 * filters, scheduler) so the registered Home cards receive the same props the
 * bespoke Home page used to pass them.
 */
export interface PresetWidgetContext {
  projectId: string;
  /** Page-level filters WITHOUT the time window (time arrives as timestamps). */
  globalFilterState: FilterState;
  /** globalFilterState plus the time window as datetime filters — for legacy cards that expect it inline. */
  mergedFilterState: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
  agg: DashboardDateRangeAggregationOption;
  isLoading: boolean;
  metricsVersion: ViewVersion;
  schedulerId?: string;
  /** Shared recharts syncId so time-series tiles move their crosshairs together. */
  syncId: string;
  className: string;
}

/**
 * presetId → existing Home card component, rendered verbatim with its
 * existing data fetches (LFE-10693 phase 1: presets reuse today's queries
 * untouched). Keyed by the shared HomeDashboardPresetId union so this registry
 * and the curated Home dashboard definition cannot drift apart silently.
 */
const HOME_PRESETS: Record<
  HomeDashboardPresetId,
  (ctx: PresetWidgetContext) => ReactNode
> = {
  "home-traces": (ctx) => (
    <TracesBarListChart
      className={ctx.className}
      projectId={ctx.projectId}
      globalFilterState={ctx.globalFilterState}
      fromTimestamp={ctx.fromTimestamp}
      toTimestamp={ctx.toTimestamp}
      isLoading={ctx.isLoading}
      metricsVersion={ctx.metricsVersion}
      schedulerId={ctx.schedulerId}
    />
  ),
  "home-model-costs": (ctx) => (
    <ModelCostTable
      className={ctx.className}
      projectId={ctx.projectId}
      globalFilterState={ctx.globalFilterState}
      fromTimestamp={ctx.fromTimestamp}
      toTimestamp={ctx.toTimestamp}
      isLoading={ctx.isLoading}
      metricsVersion={ctx.metricsVersion}
      schedulerId={ctx.schedulerId}
    />
  ),
  "home-scores-table": (ctx) => (
    <ScoresTable
      className={ctx.className}
      projectId={ctx.projectId}
      globalFilterState={ctx.mergedFilterState}
      isLoading={ctx.isLoading}
      metricsVersion={ctx.metricsVersion}
    />
  ),
  "home-traces-obs-time-series": (ctx) => (
    <TracesAndObservationsTimeSeriesChart
      className={ctx.className}
      projectId={ctx.projectId}
      globalFilterState={ctx.globalFilterState}
      fromTimestamp={ctx.fromTimestamp}
      toTimestamp={ctx.toTimestamp}
      agg={ctx.agg}
      isLoading={ctx.isLoading}
      metricsVersion={ctx.metricsVersion}
      schedulerId={ctx.schedulerId}
      syncId={ctx.syncId}
    />
  ),
  "home-model-usage": (ctx) => (
    <ModelUsageChart
      className={ctx.className}
      projectId={ctx.projectId}
      globalFilterState={ctx.mergedFilterState}
      fromTimestamp={ctx.fromTimestamp}
      toTimestamp={ctx.toTimestamp}
      userAndEnvFilterState={ctx.globalFilterState}
      agg={ctx.agg}
      isLoading={ctx.isLoading}
      metricsVersion={ctx.metricsVersion}
      schedulerId={ctx.schedulerId}
      syncId={ctx.syncId}
    />
  ),
  "home-users": (ctx) => (
    <UserChart
      className={ctx.className}
      projectId={ctx.projectId}
      globalFilterState={ctx.globalFilterState}
      fromTimestamp={ctx.fromTimestamp}
      toTimestamp={ctx.toTimestamp}
      isLoading={ctx.isLoading}
      metricsVersion={ctx.metricsVersion}
      schedulerId={ctx.schedulerId}
    />
  ),
  "home-chart-scores": (ctx) => (
    <ChartScores
      className={ctx.className}
      agg={ctx.agg}
      projectId={ctx.projectId}
      globalFilterState={ctx.globalFilterState}
      fromTimestamp={ctx.fromTimestamp}
      toTimestamp={ctx.toTimestamp}
      isLoading={ctx.isLoading}
      metricsVersion={ctx.metricsVersion}
      schedulerId={ctx.schedulerId}
      syncId={ctx.syncId}
    />
  ),
  "home-latency-table-traces": (ctx) => (
    <LatencyTable
      kind="traces"
      className={ctx.className}
      projectId={ctx.projectId}
      globalFilterState={ctx.globalFilterState}
      fromTimestamp={ctx.fromTimestamp}
      toTimestamp={ctx.toTimestamp}
      isLoading={ctx.isLoading}
      metricsVersion={ctx.metricsVersion}
      schedulerId={ctx.schedulerId}
    />
  ),
  "home-latency-table-generations": (ctx) => (
    <LatencyTable
      kind="generations"
      className={ctx.className}
      projectId={ctx.projectId}
      globalFilterState={ctx.globalFilterState}
      fromTimestamp={ctx.fromTimestamp}
      toTimestamp={ctx.toTimestamp}
      isLoading={ctx.isLoading}
      metricsVersion={ctx.metricsVersion}
      schedulerId={ctx.schedulerId}
    />
  ),
  "home-latency-table-observations": (ctx) => (
    <LatencyTable
      kind="observations"
      className={ctx.className}
      projectId={ctx.projectId}
      globalFilterState={ctx.globalFilterState}
      fromTimestamp={ctx.fromTimestamp}
      toTimestamp={ctx.toTimestamp}
      isLoading={ctx.isLoading}
      metricsVersion={ctx.metricsVersion}
      schedulerId={ctx.schedulerId}
    />
  ),
  "home-generation-latency": (ctx) => (
    <GenerationLatencyChart
      className={ctx.className}
      projectId={ctx.projectId}
      agg={ctx.agg}
      globalFilterState={ctx.globalFilterState}
      fromTimestamp={ctx.fromTimestamp}
      toTimestamp={ctx.toTimestamp}
      isLoading={ctx.isLoading}
      metricsVersion={ctx.metricsVersion}
      schedulerId={ctx.schedulerId}
      syncId={ctx.syncId}
    />
  ),
  "home-score-analytics": (ctx) => (
    <ScoreAnalytics
      className={ctx.className}
      agg={ctx.agg}
      projectId={ctx.projectId}
      globalFilterState={ctx.globalFilterState}
      fromTimestamp={ctx.fromTimestamp}
      toTimestamp={ctx.toTimestamp}
      isLoading={ctx.isLoading}
      metricsVersion={ctx.metricsVersion}
      schedulerId={ctx.schedulerId}
      syncId={ctx.syncId}
    />
  ),
};

/**
 * Display metadata for the preset picker (Add Widget dialog). `illustration`
 * keys into ChartTypeIllustration.
 */
export const HOME_PRESET_METADATA: Record<
  HomeDashboardPresetId,
  { name: string; description: string; illustration: string }
> = {
  "home-traces": {
    name: "Traces",
    description: "Total traces with the top trace names",
    illustration: "HORIZONTAL_BAR",
  },
  "home-model-costs": {
    name: "Model Costs",
    description: "Cost and token usage per model",
    illustration: "PIVOT_TABLE",
  },
  "home-scores-table": {
    name: "Scores",
    description: "Score counts and averages by name",
    illustration: "PIVOT_TABLE",
  },
  "home-traces-obs-time-series": {
    name: "Traces & Observations over time",
    description: "Traffic volume with tabbed trace/observation views",
    illustration: "BAR_TIME_SERIES",
  },
  "home-model-usage": {
    name: "Model Usage",
    description: "Cost and usage over time, by model or by type",
    illustration: "AREA_TIME_SERIES",
  },
  "home-users": {
    name: "User Consumption",
    description: "Token cost and trace counts per user",
    illustration: "HORIZONTAL_BAR",
  },
  "home-chart-scores": {
    name: "Scores over time",
    description: "Moving average per score",
    illustration: "LINE_TIME_SERIES",
  },
  "home-latency-table-traces": {
    name: "Trace Latency Percentiles",
    description: "p50–p99 latencies per trace name",
    illustration: "PIVOT_TABLE",
  },
  "home-latency-table-generations": {
    name: "Generation Latency Percentiles",
    description: "p50–p99 latencies per generation name",
    illustration: "PIVOT_TABLE",
  },
  "home-latency-table-observations": {
    name: "Observation Latency Percentiles",
    description: "p50–p99 latencies per observation type and name",
    illustration: "PIVOT_TABLE",
  },
  "home-generation-latency": {
    name: "Model Latencies",
    description: "Latency percentiles per LLM, tabbed by percentile",
    illustration: "LINE_TIME_SERIES",
  },
  "home-score-analytics": {
    name: "Score Analytics",
    description: "Per-score charts and distributions for selected scores",
    illustration: "HISTOGRAM",
  },
};

export function getHomePreset(
  presetId: string,
): ((ctx: PresetWidgetContext) => ReactNode) | undefined {
  return (
    HOME_PRESETS as Record<
      string,
      ((ctx: PresetWidgetContext) => ReactNode) | undefined
    >
  )[presetId];
}
