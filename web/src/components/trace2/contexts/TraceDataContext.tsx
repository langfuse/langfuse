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
  scores: WithStringifiedMetadata<ScoreDomain>[];
  tree: TreeNode;
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
  scores: WithStringifiedMetadata<ScoreDomain>[];
  comments: Map<string, number>;
  children: ReactNode;
}

export function TraceDataProvider({
  trace,
  observations,
  scores,
  comments,
  children,
}: TraceDataProviderProps) {
  const uiData = useMemo(() => {
    return buildTraceUiData(trace, observations);
  }, [trace, observations]);

  const value = useMemo<TraceDataContextValue>(
    () => ({
      trace,
      observations,
      scores,
      tree: uiData.tree,
      nodeMap: uiData.nodeMap,
      searchItems: uiData.searchItems,
      hiddenObservationsCount: uiData.hiddenObservationsCount,
      comments,
    }),
    [trace, observations, scores, uiData, comments],
  );

  return (
    <TraceDataContext.Provider value={value}>
      {children}
    </TraceDataContext.Provider>
  );
}
