import type { ActivationConfirmationRequest } from "@/src/features/evals/v2/types/rules";

export type ActivationEstimate = {
  evaluatorId: string;
  evaluatorName: string;
  matchingObservations: number;
  sampling: number;
  testRunCostUsd: number;
  estimatedCostUsd: number;
};

function groupBy<TItem>(
  items: readonly TItem[],
  toKey: (item: TItem) => string,
) {
  const groups = new Map<string, TItem[]>();
  for (const item of items) {
    const key = toKey(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

export async function requestRuleActivation({
  request,
  estimate,
}: {
  request: ActivationConfirmationRequest;
  estimate: (targets: ActivationConfirmationRequest["targets"]) => Promise<
    Array<{
      evaluatorId: string;
      matchingObservations: number;
      sampling: number;
      testRunCostUsd: number | null;
      estimatedCostUsd: number | null;
    }>
  >;
}) {
  if (request.targets.length === 0) {
    await request.onConfirm();
    return null;
  }

  const targetGroups = groupBy(request.targets, (target) =>
    JSON.stringify({ filter: target.filter, sampling: target.sampling }),
  );
  const estimateResults = (
    await Promise.all(
      [...targetGroups.values()].map((targets) => estimate(targets)),
    )
  ).flat();
  const targetsByEvaluatorId = new Map(
    request.targets.map((target) => [target.evaluatorId, target]),
  );
  const results = estimateResults.map((result) => ({
    evaluatorName:
      targetsByEvaluatorId.get(result.evaluatorId)?.evaluatorName ??
      result.evaluatorId,
    ...result,
  }));
  const estimates: ActivationEstimate[] = results.flatMap((result) =>
    result.matchingObservations > 0 &&
    result.testRunCostUsd !== null &&
    result.estimatedCostUsd !== null
      ? [
          {
            ...result,
            testRunCostUsd: result.testRunCostUsd,
            estimatedCostUsd: result.estimatedCostUsd,
          },
        ]
      : [],
  );

  const matchingObservations = Math.max(
    0,
    ...results.map((result) => result.matchingObservations),
  );

  return {
    estimates,
    // With nothing matching, no evaluator can be priced. Reporting those as
    // "no rate available" would read as a data gap rather than an empty scope.
    unavailableEstimateCount:
      matchingObservations === 0 ? 0 : results.length - estimates.length,
    matchingObservations,
  };
}
