import {
  type AgentQualityScore,
  type AgentQualityResult,
} from "@langfuse/shared/agents";
import { agentPeriodChange, type AgentOverviewChart } from "./agentOverview";

export function agentQualityKey(score: AgentQualityScore) {
  return JSON.stringify([
    score.name,
    score.dataType,
    score.source,
    score.configId,
  ]);
}

const formatPercentage = (value: number) =>
  `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;

function formatAgentQuality(
  value: number | null,
  type: AgentQualityScore["dataType"],
) {
  if (value === null) return "Unknown";
  if (type === "BOOLEAN") return formatPercentage(value * 100);
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

export function agentQualityOptions(scores: AgentQualityScore[]) {
  const sources = { API: "API", EVAL: "Evaluation", ANNOTATION: "Annotation" };
  return scores.map((score) => {
    const duplicate = scores.some(
      (other) =>
        other !== score &&
        other.name === score.name &&
        other.source === score.source,
    );
    const qualifier = duplicate
      ? ` · ${score.dataType.toLowerCase()}${score.configId ? ` · ${score.configId.slice(-6)}` : ""}`
      : "";
    return {
      value: agentQualityKey(score),
      label: `${score.name} · ${sources[score.source]}${qualifier}`,
    };
  });
}

export function prepareAgentQuality(result: AgentQualityResult) {
  const isBoolean = result.score.dataType === "BOOLEAN";
  const format = (value: number | null) =>
    formatAgentQuality(value, result.score.dataType);
  const chart: AgentOverviewChart = {
    title: isBoolean ? "True rate over time" : "Average score over time",
    description:
      "Latest known scores attached directly to agent runs, grouped by run start time. Trace and session scores are excluded. Evaluations received after completion are included; unscored runs are excluded from the average.",
    value: format(result.current.average),
    comparison: `${agentPeriodChange(result.current.average, result.previous.average)} · Previous: ${format(result.previous.average)}`,
    series: [
      { id: "score", label: result.score.name, color: "hsl(var(--chart-2))" },
    ],
    data: result.buckets.map((bucket) => ({
      x: bucket.timestamp,
      values: {
        score:
          bucket.average !== null && isBoolean
            ? bucket.average * 100
            : bucket.average,
      },
    })),
    formatValue: isBoolean ? formatPercentage : format,
    yAxis: isBoolean ? { domain: [0, 100] } : undefined,
    emptyMessage: "No scored agent runs match this period and environment.",
  };
  const models = result.models.map((model) => ({
    name: modelGroupName(model),
    average: format(model.current.average),
    previous: format(model.previous.average),
    scoredRuns: model.current.scoredRuns,
    coverage: `${model.current.scoredRuns.toLocaleString()} / ${model.current.totalRuns.toLocaleString()} runs`,
  }));
  return { chart, models };
}

function modelGroupName(model: AgentQualityResult["models"][number]) {
  if (model.kind === "single") return model.name ?? "Unknown model";
  if (model.kind === "multiple") return "Multiple models";
  return "Model not recorded";
}
