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

/** Log view ordering mode */
export type LogViewMode = "chronological" | "tree-order";

/** Log view tree visualization style (only applies in tree-order mode) */
export type LogViewTreeStyle = "flat" | "indented";

/** JSON view preference (formatted/pretty vs raw JSON) */
export type JsonViewPreference = "pretty" | "json";

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
  /** Whether trace is rendered in peek mode (e.g., annotation queues) */
  isPeekMode: boolean;
  /** Log view ordering mode (chronological or tree-order) */
  logViewMode: LogViewMode;
  setLogViewMode: (value: LogViewMode) => void;
  /** Log view tree style (flat or indented, only applies in tree-order mode) */
  logViewTreeStyle: LogViewTreeStyle;
  setLogViewTreeStyle: (value: LogViewTreeStyle) => void;
  /** JSON view preference (pretty/formatted or raw JSON) */
  jsonViewPreference: JsonViewPreference;
  setJsonViewPreference: (value: JsonViewPreference) => void;
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
  /** Context in which trace is rendered - affects feature availability */
  traceContext?: "peek" | "fullscreen";
}

export function ViewPreferencesProvider({
  children,
  traceContext = "fullscreen",
}: ViewPreferencesProviderProps) {
  const isPeekMode = traceContext === "peek";
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
      ObservationLevel.DEFAULT,
    );
  const [logViewMode, setLogViewMode] = useLocalStorage<LogViewMode>(
    "logViewMode",
    "chronological",
  );
  const [logViewTreeStyle, setLogViewTreeStyle] =
    useLocalStorage<LogViewTreeStyle>("logViewTreeStyle", "flat");
  const [jsonViewPreference, setJsonViewPreference] =
    useLocalStorage<JsonViewPreference>("jsonViewPreference", "pretty");

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
      isPeekMode,
      logViewMode,
      setLogViewMode,
      logViewTreeStyle,
      setLogViewTreeStyle,
      jsonViewPreference,
      setJsonViewPreference,
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
      isPeekMode,
      logViewMode,
      setLogViewMode,
      logViewTreeStyle,
      setLogViewTreeStyle,
      jsonViewPreference,
      setJsonViewPreference,
    ],
  );

  return (
    <ViewPreferencesContext.Provider value={value}>
      {children}
    </ViewPreferencesContext.Provider>
  );
}
