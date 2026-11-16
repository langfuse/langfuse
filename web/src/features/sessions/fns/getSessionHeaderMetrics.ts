import { groupScoresByName } from "@/src/components/GroupedScoreBadges";
import { type HeaderMetric } from "@/src/components/ObservabilityEntityDetailHeader/ObservabilityEntityDetailHeader";
import {
  formatMetricCost,
  formatMetricTokens,
} from "@/src/features/traces/components/ObservationMetadataBadgesTooltip";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { numberFormatter, usdFormatter } from "@/src/utils/numbers";

export function getSessionHeaderMetrics({
  projectId,
  countTraces,
  totalCost,
  users,
  scores,
  durationSeconds,
  usage,
}: {
  projectId: string;
  countTraces: number;
  totalCost: number;
  users: readonly string[];
  scores: Parameters<typeof groupScoresByName>[0];
  durationSeconds?: number;
  usage?: { input: number; output: number; total: number };
}) {
  const metrics: HeaderMetric[] = [
    {
      id: "traces",
      type: "value",
      text: `${numberFormatter(countTraces, 0)} ${countTraces === 1 ? "trace" : "traces"}`,
      searchText: `traces ${countTraces}`,
    },
  ];
  if (durationSeconds !== undefined)
    metrics.push({
      id: "duration",
      type: "value",
      text: formatIntervalSeconds(durationSeconds),
      title: "session duration",
      searchText: `duration ${durationSeconds}`,
    });
  if (totalCost > 0 || durationSeconds === undefined)
    metrics.push({
      id: "cost",
      type: "value",
      text:
        durationSeconds === undefined
          ? usdFormatter(totalCost, 2)
          : formatMetricCost(totalCost),
      title: `exact $${totalCost.toFixed(6)}`,
      searchText: `cost ${totalCost}`,
    });
  if (usage && usage.total > 0)
    metrics.push({
      id: "tokens",
      type: "tokens",
      text: formatMetricTokens(usage.total),
      details: usage,
      searchText: `tokens ${usage.input} ${usage.output} ${usage.total}`,
    });
  users.forEach((user, index) =>
    metrics.push({
      id: `user-${user}`,
      type: "link",
      href: `/project/${projectId}/users/${encodeURIComponent(user)}`,
      text: user,
      label: "user",
      searchText: `user ${user}`,
      overflowOnly: index >= 3,
    }),
  );
  for (const [name, group] of Object.entries(groupScoresByName(scores)))
    metrics.push({
      id: `score-${name}`,
      type: "score",
      name,
      scores: group,
      searchText: group
        .map(
          (score) =>
            `score ${score.name} ${score.stringValue ?? score.value ?? "—"}`,
        )
        .join(" "),
    });
  return metrics;
}
