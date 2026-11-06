import {
  type AgentOverviewBucket,
  type AgentOverviewResult,
  type AgentOverviewStats,
} from "@langfuse/shared/agents";
import { type ComponentProps } from "react";
import {
  type LineChart,
  type LineChartSeries,
} from "@/src/components/design-system/charts/LineChart/LineChart";
import { agentCost, agentDuration, agentNumber } from "../hooks/agentsQuery";
import { prepareAgentActivity } from "./agentActivity";

export type AgentOverviewSync = NonNullable<
  ComponentProps<typeof LineChart>["sync"]
>;

export type AgentOverviewChart = {
  title: string;
  description: string;
  value: string;
  comparison: string;
  series: LineChartSeries[];
  data: { x: Date; values: Record<string, number | null> }[];
  yAxis?: ComponentProps<typeof LineChart>["yAxis"];
  formatValue: (value: number) => string;
  emptyMessage: string;
};

type OverviewMetric = {
  title: string;
  description: string;
  value: (row: AgentOverviewBucket | AgentOverviewStats) => number | null;
  format: (value: number | null) => string;
  emptyMessage: string;
  yAxis?: ComponentProps<typeof LineChart>["yAxis"];
  coverage?: (
    current: AgentOverviewStats,
    previous: AgentOverviewStats,
  ) => string;
};

const percent = (value: number | null) =>
  value === null
    ? "Unknown"
    : `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;

const METRICS: OverviewMetric[] = [
  {
    title: "Agent runs",
    description:
      "Individual agent executions started in each time bucket. Sessions can contain several runs across traces.",
    value: (row) => row.runs,
    format: agentNumber,
    emptyMessage: "No agent runs were recorded in either period.",
  },
  {
    title: "Average cost per agent run",
    description:
      "Completed runs with owned model calls and known prices for every observed model call. Sub-agent costs are excluded.",
    value: (row) => row.averageRunCost,
    format: agentCost,
    emptyMessage:
      "No completed runs with fully priced model calls in this period.",
  },
  {
    title: "Cache hit rate",
    description:
      "Cached input tokens divided by total input tokens among model calls with usable cache reporting. Unknown means cache reporting or a positive input-token total is missing; a reported zero remains 0%.",
    coverage: (current, previous) =>
      `Reporting coverage: ${agentNumber(current.knownCacheModelCalls)} of ${agentNumber(current.modelCalls)} selected-period model calls; ${agentNumber(previous.knownCacheModelCalls)} of ${agentNumber(previous.modelCalls)} previous-period calls.`,
    value: (row) =>
      typeof row.cacheHitRate === "number" ? row.cacheHitRate * 100 : null,
    format: percent,
    yAxis: { domain: [0, 100] },
    emptyMessage: "No model calls with usable cache reporting in this period.",
  },
  {
    title: "Average agent run duration",
    description:
      "Recorded duration of runs that started and completed within the period. Open runs are excluded.",
    value: (row) => row.averageRunDurationMs,
    format: agentDuration,
    emptyMessage:
      "No completed agent runs with a recorded duration in this period.",
  },
  {
    title: "Error-level agent runs",
    description:
      "The share of recorded agent runs with an error level. This reflects telemetry, not a quality evaluation.",
    value: (row) => (row.runs > 0 ? (row.errorRuns / row.runs) * 100 : null),
    format: percent,
    yAxis: { domain: [0, 100] },
    emptyMessage: "No agent runs were recorded in this period.",
  },
];

const PERIOD_SERIES: LineChartSeries[] = [
  { id: "current", label: "Selected period", color: "hsl(var(--chart-1))" },
  {
    id: "previous",
    label: "Previous period",
    color: "hsl(var(--muted-foreground) / 0.5)",
    lineStyle: "dotted",
  },
];

export function agentPeriodChange(
  current: number | null,
  previous: number | null,
) {
  if (current === null || previous === null) return "No comparable value";
  if (previous === 0) return current === 0 ? "No change" : "No previous value";
  const change = ((current - previous) / Math.abs(previous)) * 100;
  return `${change > 0 ? "+" : ""}${change.toLocaleString(undefined, { maximumFractionDigits: 1 })}% vs previous period`;
}

export function prepareAgentOverview(result: AgentOverviewResult) {
  const offset = result.current.from.getTime() - result.previous.from.getTime();
  const priorByTime = new Map(
    result.previous.buckets.map((bucket) => [
      bucket.timestamp.getTime() + offset,
      bucket,
    ]),
  );
  const charts: AgentOverviewChart[] = METRICS.map((metric) => ({
    title: metric.title,
    description: [
      metric.description,
      metric.coverage?.(result.current.stats, result.previous.stats),
    ]
      .filter(Boolean)
      .join(" "),
    value: metric.format(metric.value(result.current.stats)),
    comparison: agentPeriodChange(
      metric.value(result.current.stats),
      metric.value(result.previous.stats),
    ),
    series: PERIOD_SERIES,
    data: result.current.buckets.map((bucket) => {
      const previous = priorByTime.get(bucket.timestamp.getTime());
      return {
        x: bucket.timestamp,
        values: {
          current: metric.value(bucket),
          previous: previous ? metric.value(previous) : null,
        },
      };
    }),
    formatValue: (value) => metric.format(value),
    yAxis: metric.yAxis ?? { domain: [0, "auto"] },
    emptyMessage: metric.emptyMessage,
  }));
  const resources: AgentOverviewChart = {
    title: "Tool and skill activity",
    description:
      "Recorded tool calls and skill resource loads in the selected period. A load shows usage, not effectiveness.",
    value: `${agentNumber(result.current.stats.toolCalls)} tool calls · ${agentNumber(result.current.stats.skillLoads)} skill loads`,
    comparison: "Selected period",
    series: [
      { id: "tools", label: "Tool calls", color: "hsl(var(--chart-3))" },
      { id: "skills", label: "Skill loads", color: "hsl(var(--chart-5))" },
    ],
    data: result.current.buckets.map((bucket) => ({
      x: bucket.timestamp,
      values: { tools: bucket.toolCalls, skills: bucket.skillLoads },
    })),
    formatValue: agentNumber,
    yAxis: { domain: [0, "auto"] },
    emptyMessage: "No tool calls or skill loads were recorded in this period.",
  };
  return { charts, resources };
}

export function prepareAgentResourceTrends(result: AgentOverviewResult) {
  const prepare = (
    row: AgentOverviewResult["tools"][number],
    name: string,
  ) => ({
    ...row,
    name,
    plot: row.buckets
      ? prepareAgentActivity({
          from: result.current.from,
          to: result.current.to,
          bucketMs: result.current.bucketMs,
          buckets: row.buckets,
        }).plot
      : null,
  });
  return {
    tools: result.tools.map((row) => prepare(row, row.name || "Unnamed tool")),
    skills: result.skills.map((row) =>
      prepare(
        row,
        [
          row.name || "Unnamed skill",
          row.skillVersion === null ? null : `v${row.skillVersion}`,
          row.filePath,
        ]
          .filter(Boolean)
          .join(" · "),
      ),
    ),
  };
}
