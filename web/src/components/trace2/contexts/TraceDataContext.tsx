/**
 * TraceDataContext - Provides read-only trace data and derived structures.
 *
 * Purpose:
 * - Provides trace, observations, scores from props
 * - Computes and memoizes tree structure, nodeMap, and searchItems
 *
 * Not responsible for:
 * - Data fetching (done by parent via API hooks)
 * - UI state (selection, collapsed nodes) - see SelectionContext
 * - Display preferences - see ViewPreferencesContext
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { type TraceDomain, type ScoreDomain } from "@langfuse/shared";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { type TreeNode, type TraceSearchListItem } from "../lib/types";
import { buildTraceUiData } from "../lib/tree-building";
import { useViewPreferences } from "./ViewPreferencesContext";
import { useMergedScores } from "@/src/features/scores/lib/useMergedScores";

type TraceType = Omit<
  WithStringifiedMetadata<TraceDomain>,
  "input" | "output"
> & {
  input: string | null;
  output: string | null;
};

interface TraceDataContextValue {
  trace: TraceType;
  observations: ObservationReturnTypeWithMetadata[];
  serverScores: WithStringifiedMetadata<ScoreDomain>[];
  mergedScores: WithStringifiedMetadata<ScoreDomain>[];
  corrections: ScoreDomain[];
  roots: TreeNode[];
  nodeMap: Map<string, TreeNode>;
  searchItems: TraceSearchListItem[];
  hiddenObservationsCount: number;
  comments: Map<string, number>;
}

const TraceDataContext = createContext<TraceDataContextValue | null>(null);

export function useTraceData(): TraceDataContextValue {
  const context = useContext(TraceDataContext);
  if (!context) {
    throw new Error("useTraceData must be used within a TraceDataProvider");
  }
  return context;
}

interface TraceDataProviderProps {
  trace: TraceType;
  observations: ObservationReturnTypeWithMetadata[];
  serverScores: WithStringifiedMetadata<ScoreDomain>[];
  corrections: ScoreDomain[];
  comments: Map<string, number>;
  children: ReactNode;
}

/**
 * TraceDataProvider must be rendered within ViewPreferencesProvider.
 * It consumes minObservationLevel directly from ViewPreferencesContext.
 */
export function TraceDataProvider({
  trace,
  observations,
  serverScores,
  corrections,
  comments,
  children,
}: TraceDataProviderProps) {
  const { minObservationLevel } = useViewPreferences();

  const uiData = useMemo(() => {
    return buildTraceUiData(trace, observations, minObservationLevel);
  }, [trace, observations, minObservationLevel]);

  // Merge scores with optimistic cache
  const mergedScores = useMergedScores(
    serverScores,
    {
      type: "trace",
      traceId: trace.id,
    },
    "target-and-child-scores",
  );

  const value = useMemo<TraceDataContextValue>(
    () => ({
      trace,
      observations,
      serverScores: serverScores,
      mergedScores,
      corrections,
      roots: uiData.roots,
      nodeMap: uiData.nodeMap,
      searchItems: uiData.searchItems,
      hiddenObservationsCount: uiData.hiddenObservationsCount,
      comments,
    }),
    [
      trace,
      observations,
      serverScores,
      mergedScores,
      corrections,
      uiData,
      comments,
    ],
  );

  return (
    <TraceDataContext.Provider value={value}>
      {children}
    </TraceDataContext.Provider>
  );
}
