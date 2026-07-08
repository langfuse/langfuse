import { calculateNumericDiff } from "@/src/features/datasets/lib/calculateBaselineDiff";
import { type EnrichedDatasetRunItem } from "@langfuse/shared/src/server";

const getLatency = (runItem: EnrichedDatasetRunItem) => {
  return runItem.observation?.latency ?? runItem.trace.duration;
};

const getTotalCost = (runItem: EnrichedDatasetRunItem) => {
  return runItem.observation?.calculatedTotalCost ?? runItem.trace.totalCost;
};

export function useResourceMetricsDiff(
  current: EnrichedDatasetRunItem,
  baseline?: EnrichedDatasetRunItem | null,
) {
  const baseProps = {
    latency: getLatency(current),
    totalCost: getTotalCost(current),
    latencyDiff: null,
    totalCostDiff: null,
  };

  if (!baseline) return baseProps;

  return {
    ...baseProps,
    latencyDiff: calculateNumericDiff(baseProps.latency, getLatency(baseline)),
    totalCostDiff: calculateNumericDiff(
      baseProps.totalCost,
      getTotalCost(baseline),
    ),
  };
}
