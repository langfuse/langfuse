import type { FilterState } from "@langfuse/shared";
import { TOPICS_COST_ESTIMATE_MAX_FACETS } from "@langfuse/shared/topics";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import {
  TopicCostEstimateCard,
  type TopicCostForecast,
} from "./TopicCostEstimateCard";
import type { TopicEstimateVolume } from "./TopicCostEstimateView";
import { useTopicsCapture } from "./useTopicsCapture";

type TopicCostEstimateInput = {
  projectId: string;
  filter: FilterState;
  facetIds: string[];
  source: "setup" | "new_map" | "snapshot";
};

export function useTopicCostEstimate({
  projectId,
  filter,
  facetIds,
  source,
}: TopicCostEstimateInput): TopicCostForecast {
  const capture = useTopicsCapture();
  const utils = api.useUtils();
  const input = { projectId, filter, facetIds };
  const estimate = api.topics.costEstimate.useQuery(input, {
    enabled:
      facetIds.length > 0 && facetIds.length <= TOPICS_COST_ESTIMATE_MAX_FACETS,
    refetchInterval: (query) =>
      query.state.data?.status === "running" ? 2000 : false,
  });
  const refreshPrices = () => utils.topics.costEstimate.invalidate(input);
  const start = api.topics.startCostEstimate.useMutation({
    onSuccess: refreshPrices,
  });
  const canAddModelPrice = useHasProjectAccess({
    projectId,
    scope: "models:CUD",
  });
  return {
    estimate: estimate.data ?? null,
    facetCount: facetIds.length,
    modelPrice: canAddModelPrice
      ? { projectId, onCreated: refreshPrices }
      : null,
    // Keep the action disabled while the newly started estimate loads.
    starting: start.isPending || estimate.isRefetching,
    error: start.error?.message ?? null,
    onStart: () => {
      capture("topics:cost_estimate_started", { source });
      start.mutate(input);
    },
  };
}

/** Starts a background cost estimate and follows it until its result. */
export function TopicCostEstimate({
  projectId,
  filter,
  facetIds,
  source,
  ...volume
}: TopicCostEstimateInput & TopicEstimateVolume) {
  const forecast = useTopicCostEstimate({
    projectId,
    filter,
    facetIds,
    source,
  });
  return <TopicCostEstimateCard {...forecast} {...volume} />;
}
