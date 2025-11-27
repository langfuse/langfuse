/**
 * GraphDataContext - Provides agent graph data for visualization.
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
    throw new Error("useGraphData must be used within a GraphDataProvider");
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
      enabled: observations.length > 0,
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
