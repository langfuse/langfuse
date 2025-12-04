/**
 * JsonExpansionContext - Persists JSON expand/collapse state across observations
 *
 * Purpose:
 * - Store which JSON paths are expanded/collapsed (e.g., "response.data.items": true)
 * - Persist state in sessionStorage (per-tab, clears on tab close)
 * - Share expansion state between observations with similar JSON structure
 *
 * Usage:
 * - Components receive externalExpansionState and onExternalExpansionChange props
 * - When user expands a path, it persists across observation switches
 * - Separate from TraceDataContext to avoid unnecessary re-renders
 */

import { createContext, useContext, useCallback, type ReactNode } from "react";
import useSessionStorage from "@/src/components/useSessionStorage";

type ExpandedState = Record<string, boolean> | boolean;

type JsonExpansionState = {
  input: ExpandedState;
  output: ExpandedState;
  metadata: ExpandedState;
  log: ExpandedState;
  // Dynamic keys for per-observation log view expansion (e.g., "log:observationId")
  [key: string]: ExpandedState;
};

interface JsonExpansionContextValue {
  expansionState: JsonExpansionState;
  setFieldExpansion: (field: string, expansion: ExpandedState) => void;
}

const JsonExpansionContext = createContext<JsonExpansionContextValue>({
  expansionState: { input: {}, output: {}, metadata: {}, log: {} },
  setFieldExpansion: () => {},
});

export const useJsonExpansion = () => useContext(JsonExpansionContext);

export function JsonExpansionProvider({ children }: { children: ReactNode }) {
  const [expansionState, setExpansionState] =
    useSessionStorage<JsonExpansionState>("trace2-jsonExpansionState", {
      input: {},
      output: {},
      metadata: {},
      log: {},
    });

  const setFieldExpansion = useCallback(
    (field: string, expansion: ExpandedState) => {
      setExpansionState((prev) => ({
        ...prev,
        [field]: expansion,
      }));
    },
    [setExpansionState],
  );

  return (
    <JsonExpansionContext.Provider
      value={{
        expansionState,
        setFieldExpansion,
      }}
    >
      {children}
    </JsonExpansionContext.Provider>
  );
}
