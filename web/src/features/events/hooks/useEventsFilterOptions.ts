import { api } from "@/src/utils/api";
import { useMemo } from "react";
import {
  normalizeFilterExpressionInput,
  type FilterInput,
} from "@langfuse/shared";

type UseEventsFilterOptionsParams = {
  projectId: string;
  oldFilterState: FilterInput;
  hasParentObservation?: boolean;
};

export function useEventsFilterOptions({
  projectId,
  oldFilterState,
  hasParentObservation,
}: UseEventsFilterOptionsParams) {
  const filter = useMemo(() => {
    const normalizedFilter = normalizeFilterExpressionInput(oldFilterState);

    if (hasParentObservation === undefined) {
      return normalizedFilter;
    }

    const hasParentObservationFilter = {
      column: "hasParentObservation",
      type: "boolean" as const,
      operator: "=" as const,
      value: hasParentObservation,
    };

    if (!normalizedFilter) {
      return {
        type: "group" as const,
        operator: "AND" as const,
        conditions: [hasParentObservationFilter],
      };
    }

    return {
      type: "group" as const,
      operator: "AND" as const,
      conditions: [normalizedFilter, hasParentObservationFilter],
    };
  }, [oldFilterState, hasParentObservation]);

  // Fetch filter options
  const filterOptions = api.events.filterOptions.useQuery(
    {
      projectId,
      filter,
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
      hasParentObservation:
        filterOptions.data?.hasParentObservation ?? undefined,
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
