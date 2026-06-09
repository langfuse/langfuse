import { api } from "@/src/utils/api";
import { useMemo } from "react";
import {
  getFilterExpressionLeafFilters,
  normalizeFilterExpressionInput,
  type FilterInput,
  type TimeFilter,
} from "@langfuse/shared";

type UseEventsFilterOptionsParams = {
  projectId: string;
  oldFilterState: FilterInput;
  hasParentObservation?: boolean;
  isRootObservation?: boolean;
};

export function useEventsFilterOptions({
  projectId,
  oldFilterState,
  hasParentObservation,
  isRootObservation,
}: UseEventsFilterOptionsParams) {
  const filter = useMemo(() => {
    return normalizeFilterExpressionInput(oldFilterState);
  }, [oldFilterState]);

  const startTimeFilters = useMemo(() => {
    return getFilterExpressionLeafFilters(filter).filter(
      (f): f is TimeFilter =>
        (f.column === "Start Time" || f.column === "startTime") &&
        f.type === "datetime",
    );
  }, [filter]);

  // Fetch filter options
  const filterOptions = api.events.filterOptions.useQuery(
    {
      projectId,
      filter,
      startTimeFilter:
        startTimeFilters.length > 0 ? startTimeFilters : undefined,
      isRootObservation,
      hasParentObservation,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
      // Keep showing previous options while fetching new ones to avoid sidebar flicker
      // TODO: maybe remove b/c unnecessary?
      placeholderData: (prev) => prev,
    },
  );

  // Transform filter options for sidebar
  const newFilterOptions = useMemo(() => {
    const scoreCategories =
      filterOptions.data?.score_categories?.reduce(
        (acc, score) => {
          acc[score.label] = score.values;
          return acc;
        },
        {} as Record<string, string[]>,
      ) ?? undefined;

    const scoresNumeric = filterOptions.data?.scores_avg ?? undefined;
    const traceScoreCategories =
      filterOptions.data?.trace_score_categories?.reduce(
        (acc, score) => {
          acc[score.label] = score.values;
          return acc;
        },
        {} as Record<string, string[]>,
      ) ?? undefined;
    const traceScoresNumeric =
      filterOptions.data?.trace_scores_avg ?? undefined;

    return {
      environment: filterOptions.data?.environment ?? undefined,
      name: filterOptions.data?.name ?? undefined,
      type: filterOptions.data?.type ?? undefined,
      level: filterOptions.data?.level ?? undefined,
      providedModelName: filterOptions.data?.providedModelName ?? undefined,
      modelId: filterOptions.data?.modelId ?? undefined,
      promptName: filterOptions.data?.promptName ?? undefined,
      traceTags: filterOptions.data?.traceTags ?? undefined,
      traceName: filterOptions.data?.traceName ?? undefined,
      userId: filterOptions.data?.userId ?? undefined,
      sessionId: filterOptions.data?.sessionId ?? undefined,
      version: filterOptions.data?.version ?? undefined,
      experimentDatasetId: filterOptions.data?.experimentDatasetId ?? undefined,
      experimentId: filterOptions.data?.experimentId ?? undefined,
      experimentName: filterOptions.data?.experimentName ?? undefined,
      isRootObservation: filterOptions.data?.isRootObservation ?? undefined,
      toolNames: filterOptions.data?.toolNames ?? undefined,
      calledToolNames: filterOptions.data?.calledToolNames ?? undefined,
      toolDefinitions: [],
      toolCalls: [],
      latency: [],
      timeToFirstToken: [],
      tokensPerSecond: [],
      inputTokens: [],
      outputTokens: [],
      totalTokens: [],
      inputCost: [],
      outputCost: [],
      totalCost: [],
      score_categories: scoreCategories,
      scores_avg: scoresNumeric,
      trace_score_categories: traceScoreCategories,
      trace_scores_avg: traceScoresNumeric,
    };
  }, [filterOptions.data]);

  return {
    filterOptions: newFilterOptions,
    isFilterOptionsPending: filterOptions.isPending,
  };
}
