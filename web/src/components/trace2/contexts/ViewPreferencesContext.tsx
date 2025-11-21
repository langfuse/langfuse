/**
 * ViewPreferencesContext - Manages user display preferences persisted to localStorage.
 *
 * Purpose:
 * - Stores toggle states for tree item display (duration, cost, scores, comments)
 * - Manages minimum observation level filter
 * - Persists preferences across sessions via localStorage
 *
 * Not responsible for:
 * - Trace data - see TraceDataContext
 * - Selection/navigation state - see SelectionContext
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { type ObservationLevelType, ObservationLevel } from "@langfuse/shared";
import useLocalStorage from "@/src/components/useLocalStorage";

interface ViewPreferencesContextValue {
  showDuration: boolean;
  setShowDuration: (value: boolean) => void;
  showCostTokens: boolean;
  setShowCostTokens: (value: boolean) => void;
  showScores: boolean;
  setShowScores: (value: boolean) => void;
  colorCodeMetrics: boolean;
  setColorCodeMetrics: (value: boolean) => void;
  showComments: boolean;
  setShowComments: (value: boolean) => void;
  showGraph: boolean;
  setShowGraph: (value: boolean) => void;
  minObservationLevel: ObservationLevelType;
  setMinObservationLevel: (value: ObservationLevelType) => void;
}

const ViewPreferencesContext =
  createContext<ViewPreferencesContextValue | null>(null);

export function useViewPreferences(): ViewPreferencesContextValue {
  const context = useContext(ViewPreferencesContext);
  if (!context) {
    throw new Error(
      "useViewPreferences must be used within a ViewPreferencesProvider",
    );
  }
  return context;
}

interface ViewPreferencesProviderProps {
  children: ReactNode;
  defaultMinObservationLevel?: ObservationLevelType;
}

export function ViewPreferencesProvider({
  children,
  defaultMinObservationLevel,
}: ViewPreferencesProviderProps) {
  const [showDuration, setShowDuration] = useLocalStorage(
    "durationOnObservationTree",
    true,
  );
  const [showCostTokens, setShowCostTokens] = useLocalStorage(
    "costTokensOnObservationTree",
    true,
  );
  const [showScores, setShowScores] = useLocalStorage(
    "scoresOnObservationTree",
    true,
  );
  const [colorCodeMetrics, setColorCodeMetrics] = useLocalStorage(
    "colorCodeMetricsOnObservationTree",
    true,
  );
  const [showComments, setShowComments] = useLocalStorage("showComments", true);
  const [showGraph, setShowGraph] = useLocalStorage("showGraph", true);
  const [minObservationLevel, setMinObservationLevel] =
    useLocalStorage<ObservationLevelType>(
      "minObservationLevel",
      defaultMinObservationLevel ?? ObservationLevel.DEFAULT,
    );

  const value = useMemo<ViewPreferencesContextValue>(
    () => ({
      showDuration,
      setShowDuration,
      showCostTokens,
      setShowCostTokens,
      showScores,
      setShowScores,
      colorCodeMetrics,
      setColorCodeMetrics,
      showComments,
      setShowComments,
      showGraph,
      setShowGraph,
      minObservationLevel,
      setMinObservationLevel,
    }),
    [
      showDuration,
      setShowDuration,
      showCostTokens,
      setShowCostTokens,
      showScores,
      setShowScores,
      colorCodeMetrics,
      setColorCodeMetrics,
      showComments,
      setShowComments,
      showGraph,
      setShowGraph,
      minObservationLevel,
      setMinObservationLevel,
    ],
  );

  return (
    <ViewPreferencesContext.Provider value={value}>
      {children}
    </ViewPreferencesContext.Provider>
  );
}
