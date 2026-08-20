/**
 * JsonExpansionContext - Persists JSON expand/collapse state per view type
 *
 * Purpose:
 * - Store which JSON paths are expanded/collapsed
 * - Persist state in sessionStorage (per-tab, clears on tab close)
 * - Separate storage per view type (formatted, json, advanced-json)
 *
 * Storage keys:
 * - trace2-expansion:formatted - For formatted (pretty) view, per-field expansion
 * - trace2-expansion:json - For legacy JSON view, boolean per field
 * - trace2-expansion:advanced-json - For advanced JSON view, prefixed paths
 */

import { createContext, useContext, useCallback, type ReactNode } from "react";
import useSessionStorage from "@/src/components/useSessionStorage";

// Storage keys per view type
const STORAGE_KEYS = {
  formatted: "trace2-expansion:formatted",
  json: "trace2-expansion:json",
  advancedJson: "trace2-expansion:advanced-json",
} as const;

// Types for each view's expansion state
type FormattedExpansionState = {
  input: Record<string, boolean>;
  output: Record<string, boolean>;
  metadata: Record<string, boolean>;
  [key: string]: Record<string, boolean>; // Dynamic keys for log view
};

type JsonExpansionState = {
  input: boolean;
  output: boolean;
  metadata: boolean;
};

type AdvancedJsonExpansionState = Record<string, boolean>; // Prefixed paths like "input.messages.0"

interface JsonExpansionContextValue {
  // Formatted view state (per-field, path-based expansion)
  formattedExpansion: FormattedExpansionState;
  setFormattedFieldExpansion: (
    field: string,
    expansion: Record<string, boolean>,
  ) => void;

  // JSON view state (boolean per field - collapsed/expanded)
  jsonExpansion: JsonExpansionState;
  setJsonFieldExpansion: (
    field: "input" | "output" | "metadata",
    expanded: boolean,
  ) => void;

  // Advanced JSON view state (prefixed paths)
  advancedJsonExpansion: AdvancedJsonExpansionState;
  setAdvancedJsonExpansion: (expansion: AdvancedJsonExpansionState) => void;
}

const JsonExpansionContext = createContext<JsonExpansionContextValue>({
  formattedExpansion: { input: {}, output: {}, metadata: {} },
  setFormattedFieldExpansion: () => {},
  jsonExpansion: { input: true, output: true, metadata: true },
  setJsonFieldExpansion: () => {},
  advancedJsonExpansion: {},
  setAdvancedJsonExpansion: () => {},
});

export const useJsonExpansion = () => {
  return useContext(JsonExpansionContext);
};

/**
 * Read formatted expansion state directly from sessionStorage
 */
export function readFormattedExpansion(field: string): Record<string, boolean> {
  if (typeof window === "undefined") return {};

  try {
    const stored = sessionStorage.getItem(STORAGE_KEYS.formatted);
    if (!stored) return {};

    const parsed = JSON.parse(stored) as FormattedExpansionState;
    return parsed[field] ?? {};
  } catch {
    return {};
  }
}

/**
 * Write formatted expansion state directly to sessionStorage
 */
export function writeFormattedExpansion(
  field: string,
  state: Record<string, boolean>,
): void {
  if (typeof window === "undefined") return;

  try {
    const stored = sessionStorage.getItem(STORAGE_KEYS.formatted);
    const parsed: FormattedExpansionState = stored
      ? (JSON.parse(stored) as FormattedExpansionState)
      : { input: {}, output: {}, metadata: {} };

    parsed[field] = state;
    sessionStorage.setItem(STORAGE_KEYS.formatted, JSON.stringify(parsed));
  } catch {
    // Silently fail
  }
}

export function JsonExpansionProvider({ children }: { children: ReactNode }) {
  // Formatted view state (per-field, path-based)
  const [formattedExpansion, setFormattedExpansion] =
    useSessionStorage<FormattedExpansionState>(STORAGE_KEYS.formatted, {
      input: {},
      output: {},
      metadata: {},
    });

  // JSON view state (boolean per field)
  const [jsonExpansion, setJsonExpansion] =
    useSessionStorage<JsonExpansionState>(STORAGE_KEYS.json, {
      input: true, // Default expanded
      output: true,
      metadata: true,
    });

  // Advanced JSON view state (prefixed paths)
  const [advancedJsonExpansion, setAdvancedJsonExpansion] =
    useSessionStorage<AdvancedJsonExpansionState>(
      STORAGE_KEYS.advancedJson,
      {},
    );

  const setFormattedFieldExpansion = useCallback(
    (field: string, expansion: Record<string, boolean>) => {
      setFormattedExpansion((prev) => ({
        ...prev,
        [field]: expansion,
      }));
    },
    [setFormattedExpansion],
  );

  const setJsonFieldExpansion = useCallback(
    (field: "input" | "output" | "metadata", expanded: boolean) => {
      setJsonExpansion((prev) => ({
        ...prev,
        [field]: expanded,
      }));
    },
    [setJsonExpansion],
  );

  const handleSetAdvancedJsonExpansion = useCallback(
    (expansion: AdvancedJsonExpansionState) => {
      setAdvancedJsonExpansion(expansion);
    },
    [setAdvancedJsonExpansion],
  );

  return (
    <JsonExpansionContext.Provider
      value={{
        formattedExpansion,
        setFormattedFieldExpansion,
        jsonExpansion,
        setJsonFieldExpansion,
        advancedJsonExpansion,
        setAdvancedJsonExpansion: handleSetAdvancedJsonExpansion,
      }}
    >
      {children}
    </JsonExpansionContext.Provider>
  );
}
