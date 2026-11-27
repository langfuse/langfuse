import type { FilterState } from "@langfuse/shared";
import { TOPICS_COST_ESTIMATE_MAX_FACETS } from "@langfuse/shared/topics";
import { useQueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import isEqual from "lodash/isEqual";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api, type RouterInputs } from "@/src/utils/api";
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
  source: "setup" | "new_map" | "edit_map" | "snapshot";
};

export function useTopicCostEstimate({
  projectId,
  filter,
  facetIds,
  source,
}: TopicCostEstimateInput): TopicCostForecast {
  const capture = useTopicsCapture();
  const queryClient = useQueryClient();
  const input = { projectId, filter, facetIds };
  const estimate = api.topics.costEstimate.useQuery(input, {
    enabled:
      facetIds.length > 0 && facetIds.length <= TOPICS_COST_ESTIMATE_MAX_FACETS,
    refetchInterval: (query) =>
      query.state.data?.status === "running" ? 2000 : false,
  });
  const refreshEstimate = (selection: RouterInputs["topics"]["costEstimate"]) =>
    queryClient.invalidateQueries({
      queryKey: getQueryKey(api.topics.costEstimate, selection, "query"),
      exact: true,
    });
  const start = api.topics.startCostEstimate.useMutation({
    onSuccess: (_result, submitted) => refreshEstimate(submitted),
  });
  const matchesSelection = isEqual(start.variables, input);
  const canAddModelPrice = useHasProjectAccess({
    projectId,
    scope: "models:CUD",
  });
  return {
    estimate: estimate.data ?? null,
    facetCount: facetIds.length,
    modelPrice: canAddModelPrice
      ? { projectId, onCreated: () => refreshEstimate(input) }
      : null,
    // Keep the action disabled while the newly started estimate loads.
    starting: (matchesSelection && start.isPending) || estimate.isRefetching,
    error: matchesSelection ? (start.error?.message ?? null) : null,
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
