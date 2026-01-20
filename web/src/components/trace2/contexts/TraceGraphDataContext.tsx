/**
 * TraceGraphDataContext - Provides agent graph data for visualization.
 *
 * Purpose:
 * - Fetches agent graph data once and shares across components
 * - Computes isGraphViewAvailable for UI conditionals
 * - Avoids duplicate fetches in header and graph components
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { api } from "@/src/utils/api";
import { type AgentGraphDataResponse } from "@/src/features/trace-graph-view/types";

const MAX_NODES_FOR_GRAPH_UI = 5000;

interface TraceGraphDataContextValue {
  /** Agent graph data for visualization */
  agentGraphData: AgentGraphDataResponse[];
  /** Whether graph view is available (has graphable data, not too large) */
  isGraphViewAvailable: boolean;
  /** Whether data is currently loading */
  isLoading: boolean;
}

const TraceGraphDataContext = createContext<TraceGraphDataContextValue | null>(
  null,
);

export function useTraceGraphData(): TraceGraphDataContextValue {
  const context = useContext(TraceGraphDataContext);
  if (!context) {
    throw new Error(
      "useTraceGraphData must be used within a TraceGraphDataProvider",
    );
  }
  return context;
}

interface TraceGraphDataProviderProps {
  children: ReactNode;
  projectId: string;
  traceId: string;
  observations: Array<{ startTime: Date }>;
}

export function TraceGraphDataProvider({
  children,
  projectId,
  traceId,
  observations,
}: TraceGraphDataProviderProps) {
  // Skip graph data entirely for large traces to avoid performance issues
  const exceedsThreshold = observations.length >= MAX_NODES_FOR_GRAPH_UI;

  // Calculate time bounds using loop to avoid stack overflow from spread operator
  // Math.min(...array) with 10k+ elements can exceed JavaScript call stack limit
  const { minStartTime, maxStartTime } = useMemo(() => {
    if (exceedsThreshold || observations.length === 0) {
      return { minStartTime: null, maxStartTime: null };
    }

    let minTime = Infinity;
    let maxTime = 0;
    for (const obs of observations) {
      const t = obs.startTime.getTime();
      if (t < minTime) minTime = t;
      if (t > maxTime) maxTime = t;
    }

    return {
      minStartTime: new Date(minTime).toISOString(),
      maxStartTime: new Date(maxTime).toISOString(),
    };
  }, [observations, exceedsThreshold]);

  const query = api.traces.getAgentGraphData.useQuery(
    {
      projectId,
      traceId,
      minStartTime: minStartTime ?? "",
      maxStartTime: maxStartTime ?? "",
    },
    {
      enabled:
        !exceedsThreshold &&
        observations.length > 0 &&
        minStartTime !== null &&
        maxStartTime !== null,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      staleTime: 50 * 60 * 1000, // 50 minutes
    },
  );

  const agentGraphData = useMemo(() => query.data ?? [], [query.data]);

  const isGraphViewAvailable = useMemo(() => {
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

  const value = useMemo<TraceGraphDataContextValue>(
    () => ({
      agentGraphData,
      isGraphViewAvailable,
      isLoading: query.isLoading,
    }),
    [agentGraphData, isGraphViewAvailable, query.isLoading],
  );

  return (
    <TraceGraphDataContext.Provider value={value}>
      {children}
    </TraceGraphDataContext.Provider>
  );
}
