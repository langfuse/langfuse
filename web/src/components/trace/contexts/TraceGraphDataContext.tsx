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
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";

const MAX_NODES_FOR_GRAPH_UI = 5000;

interface TraceGraphDataContextValue {
  /** Agent graph data for visualization */
  agentGraphData: AgentGraphDataResponse[];
  /** Whether graph view is available (more than one node, not too large) */
  isGraphViewAvailable: boolean;
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
  const { isBetaEnabled } = useV4Beta();

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
    enabled: queryEnabled && !isBetaEnabled,
  });

  // Beta ON: Query from events table (v4)
  const eventsQuery = api.events.getAgentGraphData.useQuery(queryInput, {
    ...queryOptions,
    enabled: queryEnabled && isBetaEnabled,
  });

  // Use appropriate query based on beta toggle
  const query = isBetaEnabled ? eventsQuery : tracesQuery;

  const agentGraphData = useMemo(() => query.data ?? [], [query.data]);

  const { isGraphViewAvailable, isAgentGraph } = useMemo(() => {
    if (
      agentGraphData.length === 0 ||
      // Don't show graph UI for extremely large traces
      agentGraphData.length >= MAX_NODES_FOR_GRAPH_UI
    ) {
      return { isGraphViewAvailable: false, isAgentGraph: false };
    }

    // "Real" agent graph: observations of agentic types (not SPAN, EVENT, or
    // GENERATION) or LangGraph step metadata — shown expanded by default.
    const hasGraphableObservations = agentGraphData.some(
      (obs) =>
        obs.observationType !== "SPAN" &&
        obs.observationType !== "EVENT" &&
        obs.observationType !== "GENERATION",
    );
    const hasLangGraphData = agentGraphData.some(
      (obs) => obs.step != null && obs.step !== 0,
    );
    const isAgentGraph = hasGraphableObservations || hasLangGraphData;
    if (isAgentGraph) {
      return { isGraphViewAvailable: true, isAgentGraph };
    }

    // Otherwise the graph is still available whenever it would draw more than
    // one MEANINGFUL node — the panel just defaults to collapsed for these.
    // Mirrors the timing-based inference these traces go through
    // (buildStepData drops EVENTs and keys nodes on the observation NAME),
    // with one extra rule: a single parentless root doesn't count. v4 makes
    // this mandatory (the trace itself is mirrored as a root span, so EVERY
    // trace has one), and it's deliberately unconditional — a v3 root→child
    // chain is exactly as uninformative as a v4 one; the graph only earns its
    // panel when there's structure beyond the tree. Multiple parallel roots
    // ARE structure and count fully.
    const nonEvent = agentGraphData.filter(
      (obs) => obs.observationType !== "EVENT",
    );
    const parentless = nonEvent.filter((obs) => !obs.parentObservationId);
    const counted =
      parentless.length === 1
        ? nonEvent.filter((obs) => obs.parentObservationId)
        : nonEvent;
    const distinctNodes = new Set(counted.map((obs) => obs.name));
    return { isGraphViewAvailable: distinctNodes.size > 1, isAgentGraph };
  }, [agentGraphData]);

  const value = useMemo<TraceGraphDataContextValue>(
    () => ({
      agentGraphData,
      isGraphViewAvailable,
      isAgentGraph,
      isLoading: query.isLoading,
    }),
    [agentGraphData, isGraphViewAvailable, isAgentGraph, query.isLoading],
  );

  return (
    <TraceGraphDataContext.Provider value={value}>
      {children}
    </TraceGraphDataContext.Provider>
  );
}
