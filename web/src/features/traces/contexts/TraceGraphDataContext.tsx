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
import { useReadPath } from "@/src/features/events";
import {
  MAX_NODES_FOR_GRAPH_UI,
  resolveGraphAvailability,
  type GraphAvailability,
} from "@/src/features/traces/fns/graphAvailability";

interface TraceGraphDataContextValue {
  /** Agent graph data for visualization */
  agentGraphData: AgentGraphDataResponse[];
  /** Whether graph view is available (more than one node, not too large) */
  isGraphViewAvailable: boolean;
  /** The same answer plus the reason, for the disabled Graph segment. */
  graphAvailability: GraphAvailability;
  /**
   * A "real" agent graph (agentic observation types or LangGraph metadata) —
   * shown expanded by default. Traces that only qualify via the >1-node rule
   * get a collapsed-by-default graph panel instead.
   */
  isAgentGraph: boolean;
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
  const { isV4 } = useReadPath();

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

  const queryEnabled =
    !exceedsThreshold &&
    observations.length > 0 &&
    minStartTime !== null &&
    maxStartTime !== null;

  const queryInput = {
    projectId,
    traceId,
    minStartTime: minStartTime ?? "",
    maxStartTime: maxStartTime ?? "",
  };

  const queryOptions = {
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    staleTime: 50 * 60 * 1000, // 50 minutes
  };

  // Beta OFF: Query from observations table (existing behavior)
  const tracesQuery = api.traces.getAgentGraphData.useQuery(queryInput, {
    ...queryOptions,
    enabled: queryEnabled && !isV4,
  });

  // Beta ON: Query from events table (v4)
  const eventsQuery = api.events.getAgentGraphData.useQuery(queryInput, {
    ...queryOptions,
    enabled: queryEnabled && isV4,
  });

  // Use appropriate query based on beta toggle
  const query = isV4 ? eventsQuery : tracesQuery;

  const agentGraphData = useMemo(() => query.data ?? [], [query.data]);

  const graphAvailability = useMemo(
    () => resolveGraphAvailability(agentGraphData),
    [agentGraphData],
  );
  const isGraphViewAvailable = graphAvailability.available;
  const isAgentGraph =
    graphAvailability.available && graphAvailability.isAgentGraph;

  const value = useMemo<TraceGraphDataContextValue>(
    () => ({
      agentGraphData,
      isGraphViewAvailable,
      graphAvailability,
      isAgentGraph,
      isLoading: query.isLoading,
    }),
    [
      agentGraphData,
      isGraphViewAvailable,
      graphAvailability,
      isAgentGraph,
      query.isLoading,
    ],
  );

  return (
    <TraceGraphDataContext.Provider value={value}>
      {children}
    </TraceGraphDataContext.Provider>
  );
}
