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
import {
  type TraceDomain,
  type ScoreDomain,
  ObservationLevel,
} from "@langfuse/shared";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { type TreeNode, type TraceSearchListItem } from "../lib/types";
import {
  buildTraceUiData,
  dedupeObservationsById,
  getObservationLevels,
  removeHiddenNodes,
} from "../lib/tree-building";
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
  observations: rawObservations,
  serverScores,
  corrections,
  comments,
  children,
}: TraceDataProviderProps) {
  const { minObservationLevel } = useViewPreferences();

  // Collapse duplicate/colliding observation ids to one row per id up front, so
  // the SAME de-duped set feeds the tree builder AND every consumer that resolves
  // a row from `observations` (notably the detail panel's `observations.find`).
  // Without this the tree picks the earliest-startTime row while the panel's
  // `.find` returns the first row in the raw array — on corrupt traces those can
  // differ, so the timeline and the opened detail panel could silently show
  // different data. No-op (same reference) for well-formed traces.
  const observations = useMemo(
    () => dedupeObservationsById(rawObservations),
    [rawObservations],
  );

  // Build full tree (no level filtering) — only rebuilds when data changes
  const uiData = useMemo(() => {
    return buildTraceUiData(trace, observations);
  }, [trace, observations]);

  // Apply level filtering as a cheap post-processing step
  const { filteredRoots, filteredSearchItems, hiddenObservationsCount } =
    useMemo(() => {
      const allowedLevels = getObservationLevels(minObservationLevel);
      const isAllLevels = allowedLevels.includes(ObservationLevel.DEBUG);

      if (isAllLevels) {
        return {
          filteredRoots: uiData.roots,
          filteredSearchItems: uiData.searchItems,
          hiddenObservationsCount: 0,
        };
      }

      const allowedSet = new Set<string>(allowedLevels);
      const isHidden = (node: TreeNode) =>
        node.type !== "TRACE" && !!node.level && !allowedSet.has(node.level);

      const filteredRoots = removeHiddenNodes(uiData.roots, isHidden);
      const filteredSearchItems = uiData.searchItems.filter(
        (item) => !isHidden(item.node),
      );
      const hiddenObservationsCount =
        uiData.searchItems.length - filteredSearchItems.length;

      return { filteredRoots, filteredSearchItems, hiddenObservationsCount };
    }, [uiData, minObservationLevel]);

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
      roots: filteredRoots,
      nodeMap: uiData.nodeMap,
      searchItems: filteredSearchItems,
      hiddenObservationsCount,
      comments,
    }),
    [
      trace,
      observations,
      serverScores,
      mergedScores,
      corrections,
      filteredRoots,
      filteredSearchItems,
      hiddenObservationsCount,
      uiData.nodeMap,
      comments,
    ],
  );

  return (
    <TraceDataContext.Provider value={value}>
      {children}
    </TraceDataContext.Provider>
  );
}
