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

/**
 * Storage key for JSON expansion state in sessionStorage
 */
const STORAGE_KEY = "trace2-jsonExpansionState";

/**
 * Read expansion state for a specific field directly from sessionStorage
 * without subscribing to React context (avoids re-renders).
 *
 * @param field - Field name (e.g., "input", "output", "metadata")
 * @returns Expansion state for the field, or {} if not found
 */
export function readExpansionFromStorage(field: string): ExpandedState {
  if (typeof window === "undefined") return {};

  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return {};

    const parsed = JSON.parse(stored) as JsonExpansionState;
    return parsed[field] ?? {};
  } catch (error) {
    console.error("Failed to read expansion state from storage", error);
    return {};
  }
}

/**
 * Write expansion state for a specific field directly to sessionStorage
 * without going through React context (avoids triggering re-renders).
 *
 * @param field - Field name (e.g., "input", "output", "metadata")
 * @param state - Expansion state to save
 */
export function writeExpansionToStorage(
  field: string,
  state: ExpandedState,
): void {
  if (typeof window === "undefined") return;

  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    const parsed: JsonExpansionState = stored
      ? (JSON.parse(stored) as JsonExpansionState)
      : { input: {}, output: {}, metadata: {}, log: {} };

    (parsed as Record<string, ExpandedState>)[field] = state;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch (error) {
    console.error("Failed to write expansion state to storage", error);
  }
}

export function JsonExpansionProvider({ children }: { children: ReactNode }) {
  const [expansionState, setExpansionState] =
    useSessionStorage<JsonExpansionState>(STORAGE_KEY, {
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
