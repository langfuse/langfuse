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
import type { TraceSearchListItem } from "@/src/features/traces/types/traceSearchListItem";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  type TraceDomain,
  type ScoreDomain,
  ObservationLevel,
} from "@langfuse/shared";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { isObservationTreeNode, type TreeNode } from "../types/treeNode";
import {
  buildTraceUiData,
  buildSessionUiData,
  dedupeObservationsById,
  getObservationLevels,
  removeHiddenNodes,
} from "../fns/treeBuilding";
import {
  calculateTraceDuration,
  findEarliestStartTime,
} from "@/src/features/traces/fns/timelineCalculations";
import { useViewPreferences } from "./ViewPreferencesContext";
import { useMergedScores } from "@/src/features/scores/lib/useMergedScores";
import { traceLevelScoreOwnerIds } from "@/src/features/traces/fns/nodeScores";

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
  activeTraceObservations: ObservationReturnTypeWithMetadata[];
  serverScores: WithStringifiedMetadata<ScoreDomain>[];
  mergedScores: WithStringifiedMetadata<ScoreDomain>[];
  corrections: ScoreDomain[];
  roots: TreeNode[];
  /** Node ids that own the trace's trace-level scores. Derived from the
   * STRUCTURAL roots, never the level-filtered ones — hiding a root promotes its
   * children into `roots`, and a promoted child is not a stand-in for the trace. */
  traceLevelScoreOwnerIds: Set<string>;
  nodeMap: Map<string, TreeNode>;
  searchItems: TraceSearchListItem[];
  hiddenObservationsCount: number;
  /**
   * Observation that was merged in from a by-id fetch because it sits outside the
   * loaded (capped) list. Its ancestors are unknown, so treeBuilding places it at
   * root level — the views MUST mark it, or a deeply nested observation silently
   * reads as top-level.
   */
  detachedObservationId: string | null;
  /**
   * True when that observation renders at root level WITHOUT being a root: its
   * own parent fell past the cap too, so treeBuilding could not resolve the
   * reference and nulled it. The three cases collapse to this one question —
   * a loaded parent nests correctly, and a genuinely parentless row IS a root —
   * but they must not be conflated: reading "no parent" as "parent is loaded"
   * is what made the UI claim a position it did not have.
   */
  detachedObservationIsMisplaced: boolean;
  /** Observation cap this trace was loaded under, when it hit it. */
  truncatedAtObservations?: number;
  comments: Map<string, number>;
  /** Timeline origin (the 0s mark): earliest start across the whole tree. The
   * single owner of the temporal frame — timeline, playhead, and graph all
   * consume these two instead of re-deriving them. */
  traceStartTime: Date;
  /** Total trace span in seconds, origin → latest end (0 for empty traces). */
  traceDuration: number;
  isTraceDetailLoading: boolean;
  isTraceDetailError: boolean;
  isSessionScope: boolean;
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
  sessionTraces?: TraceType[];
  observations: ObservationReturnTypeWithMetadata[];
  activeTraceObservations?: ObservationReturnTypeWithMetadata[];
  serverScores: WithStringifiedMetadata<ScoreDomain>[];
  corrections: ScoreDomain[];
  comments: Map<string, number>;
  detachedObservationId?: string | null;
  detachedObservationIsMisplaced?: boolean;
  truncatedAtObservations?: number;
  isTraceDetailLoading?: boolean;
  isTraceDetailError?: boolean;
  children: ReactNode;
}

/**
 * TraceDataProvider must be rendered within ViewPreferencesProvider.
 * It consumes minObservationLevel directly from ViewPreferencesContext.
 */
export function TraceDataProvider({
  trace,
  sessionTraces,
  observations: rawObservations,
  activeTraceObservations,
  serverScores,
  corrections,
  comments,
  detachedObservationId = null,
  detachedObservationIsMisplaced = false,
  truncatedAtObservations,
  isTraceDetailLoading = false,
  isTraceDetailError = false,
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
    () =>
      sessionTraces ? rawObservations : dedupeObservationsById(rawObservations),
    [rawObservations, sessionTraces],
  );

  // Build full tree (no level filtering) — only rebuilds when data changes
  const uiData = useMemo(() => {
    return sessionTraces
      ? buildSessionUiData(trace.sessionId ?? "", sessionTraces, observations)
      : buildTraceUiData(trace, observations);
  }, [trace, sessionTraces, observations]);

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
        isObservationTreeNode(node) &&
        !!node.level &&
        !allowedSet.has(node.level);

      const filteredRoots = removeHiddenNodes(uiData.roots, isHidden);
      const filteredSearchItems = uiData.searchItems.filter(
        (item) => !isHidden(item.node),
      );
      const hiddenObservationsCount =
        uiData.searchItems.length - filteredSearchItems.length;

      return { filteredRoots, filteredSearchItems, hiddenObservationsCount };
    }, [uiData, minObservationLevel]);

  // Temporal frame, derived once from the filtered roots (single source of
  // truth for the timeline scale, the playback engine, and scroll math).
  const traceStartTime = useMemo(
    () => findEarliestStartTime(filteredRoots) ?? new Date(),
    [filteredRoots],
  );
  const traceDuration = useMemo(
    () => calculateTraceDuration(filteredRoots, traceStartTime),
    [filteredRoots, traceStartTime],
  );

  const traceLevelScoreOwnerIdSet = useMemo(() => {
    if (sessionTraces) return traceLevelScoreOwnerIds(uiData.roots);
    return traceLevelScoreOwnerIds(
      uiData.roots,
      // Only a misplaced row is an impostor among the roots; a genuine root
      // that happened to fall past the cap is still a root.
      detachedObservationIsMisplaced ? detachedObservationId : null,
    );
  }, [
    sessionTraces,
    uiData.roots,
    detachedObservationId,
    detachedObservationIsMisplaced,
  ]);

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
      activeTraceObservations: activeTraceObservations ?? observations,
      serverScores: serverScores,
      mergedScores,
      corrections,
      roots: filteredRoots,
      traceLevelScoreOwnerIds: traceLevelScoreOwnerIdSet,
      nodeMap: uiData.nodeMap,
      searchItems: filteredSearchItems,
      hiddenObservationsCount,
      detachedObservationId,
      detachedObservationIsMisplaced,
      truncatedAtObservations,
      comments,
      traceStartTime,
      traceDuration,
      isTraceDetailLoading,
      isTraceDetailError,
      isSessionScope: !!sessionTraces,
    }),
    [
      trace,
      observations,
      activeTraceObservations,
      serverScores,
      mergedScores,
      corrections,
      filteredRoots,
      traceLevelScoreOwnerIdSet,
      filteredSearchItems,
      hiddenObservationsCount,
      detachedObservationId,
      detachedObservationIsMisplaced,
      truncatedAtObservations,
      uiData.nodeMap,
      comments,
      traceStartTime,
      traceDuration,
      isTraceDetailLoading,
      isTraceDetailError,
      sessionTraces,
    ],
  );

  return (
    <TraceDataContext.Provider value={value}>
      {children}
    </TraceDataContext.Provider>
  );
}
