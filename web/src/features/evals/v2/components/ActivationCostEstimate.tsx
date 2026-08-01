import { useMemo, useState } from "react";
import { ActivationCostEstimateView } from "@/src/features/evals/v2/components/production/ActivationCostEstimateView";
import { api } from "@/src/utils/api";
import { type FilterState } from "@langfuse/shared";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function ActivationCostEstimate({
  projectId,
  evaluatorId,
  filter,
  sampling,
  testRunCostUsd,
  isCodeEvaluator,
  enabled,
}: {
  projectId: string;
  evaluatorId: string;
  filter: FilterState;
  sampling: number;
  testRunCostUsd: number | null;
  isCodeEvaluator: boolean;
  enabled: boolean;
}) {
  // Keep the 24-hour comparison stable while the modal is open so changing
  // rules does not also move the time window underneath the estimate.
  const [since] = useState(() => new Date(Date.now() - ONE_DAY_MS));
  const countFilter = useMemo<FilterState>(
    () => [
      ...filter,
      { column: "startTime", type: "datetime", operator: ">=", value: since },
    ],
    [filter, since],
  );

  const matchCount = api.events.countAll.useQuery(
    {
      projectId,
      filter: countFilter,
      searchQuery: null,
      searchType: [],
      orderBy: null,
    },
    { enabled: enabled && !isCodeEvaluator, refetchOnWindowFocus: false },
  );
  const historicalCost = api.evals.avgCostByEvaluatorIds.useQuery(
    { projectId, evaluatorIds: [evaluatorId] },
    {
      enabled: enabled && !isCodeEvaluator && testRunCostUsd === null,
      refetchOnWindowFocus: false,
    },
  );

  if (isCodeEvaluator) return null;

  const matchingObservations = matchCount.data?.totalCount ?? null;
  const historicalCostEntry = historicalCost.data?.[evaluatorId];
  const costPerEvaluation =
    testRunCostUsd ?? historicalCostEntry?.avgCost ?? null;
  const evaluatedObservations =
    matchingObservations === null ? null : matchingObservations * sampling;
  const dailyCostUsd =
    evaluatedObservations !== null && costPerEvaluation !== null
      ? evaluatedObservations * costPerEvaluation
      : null;
  const loading = matchCount.isLoading || historicalCost.isLoading;
  const costSource =
    testRunCostUsd !== null
      ? "the evaluator test run"
      : "average evaluator execution cost over the last 7 days";

  if (
    loading ||
    matchingObservations === null ||
    matchingObservations === 0 ||
    costPerEvaluation === null ||
    dailyCostUsd === null
  ) {
    return null;
  }

  return (
    <ActivationCostEstimateView
      matchingObservations={matchingObservations}
      sampling={sampling}
      costPerEvaluation={costPerEvaluation}
      costSource={costSource}
    />
  );
}
