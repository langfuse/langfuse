import { createContext, useContext, useMemo, type ReactNode } from "react";
import { type TraceDomain, type ScoreDomain } from "@langfuse/shared";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { type TreeNode } from "@/src/components/trace/lib/types";
import { type TraceSearchListItem } from "@/src/components/trace/TraceSearchList";
import { buildTraceUiData } from "@/src/components/trace/lib/helpers";

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
  children: ReactNode;
}

export function TraceDataProvider({
  trace,
  observations,
  scores,
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
    }),
    [trace, observations, scores, uiData],
  );

  return (
    <TraceDataContext.Provider value={value}>
      {children}
    </TraceDataContext.Provider>
  );
}
