import { useMemo } from "react";
import { api } from "@/src/utils/api";
import { type AgentGraphDataResponse } from "@/src/features/trace-graph-view/types";

export type UseAgentGraphDataParams = {
  projectId: string;
  traceId: string;
  observations: Array<{ startTime: Date }>;
  enabled?: boolean;
};

/**
 * Hook to fetch agent graph data for visualization.
 * Calculates time bounds from observations and fetches graph data.
 *
 * @param projectId - Project ID
 * @param traceId - Trace ID
 * @param observations - Array of observations with startTime
 * @param enabled - Whether to enable the query (default: true)
 */
export function useAgentGraphData({
  projectId,
  traceId,
  observations,
  enabled = true,
}: UseAgentGraphDataParams) {
  // Calculate time bounds from observations
  const observationStartTimes = observations.map((o) => o.startTime.getTime());
  const minStartTime = new Date(
    Math.min(...observationStartTimes, Date.now()),
  ).toISOString();
  const maxStartTime = new Date(
    Math.max(...observationStartTimes, 0),
  ).toISOString();

  const query = api.traces.getAgentGraphData.useQuery(
    {
      projectId,
      traceId,
      minStartTime,
      maxStartTime,
    },
    {
      enabled: enabled && observations.length > 0,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      staleTime: 50 * 60 * 1000, // 50 minutes
    },
  );

  const data = useMemo(() => query.data ?? [], [query.data]);

  return {
    data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}

const MAX_NODES_FOR_GRAPH_UI = 5000;

/**
 * Determines if graph view should be available based on observation data.
 */
export function useIsGraphViewAvailable(
  agentGraphData: AgentGraphDataResponse[],
): boolean {
  return useMemo(() => {
    if (agentGraphData.length === 0) {
      return false;
    }

    // Don't show graph UI for extremely large traces
    if (agentGraphData.length >= MAX_NODES_FOR_GRAPH_UI) {
      return false;
    }

    // Check if there are observations that would be included in the graph
    // (not SPAN, EVENT, or GENERATION)
    const hasGraphableObservations = agentGraphData.some(
      (obs) =>
        obs.observationType !== "SPAN" &&
        obs.observationType !== "EVENT" &&
        obs.observationType !== "GENERATION",
    );

    // Check for LangGraph data (has step != 0)
    const hasLangGraphData = agentGraphData.some(
      (obs) => obs.step != null && obs.step !== 0,
    );

    return hasGraphableObservations || hasLangGraphData;
  }, [agentGraphData]);
}
