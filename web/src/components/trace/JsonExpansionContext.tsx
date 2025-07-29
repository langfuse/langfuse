import { createContext, useContext, useState, useCallback } from "react";

// Context Provider to store expanded/collapsed state of JSONs across different JSONs with similar structure
// Used for traces (input/output/metadata) but easily expandable to further fields.

type ExpandedState = Record<string, boolean> | boolean;
// Stored then like this:
// {"products.0":true,"messages.0":true} - specific expansions
// true - expand all
// false - collapse all (user action)
// {} - user collapsed all (no rows expanded)
// undefined - not set yet (use smart expansion)

type JsonExpansionState = {
  input: ExpandedState;
  output: ExpandedState;
  metadata: ExpandedState;
};

type JsonExpansionContextType = {
  expansionState: JsonExpansionState;
  setFieldExpansion: (
    field: keyof JsonExpansionState,
    expansion: Record<string, boolean>,
  ) => void;
};

const JsonExpansionContext = createContext<JsonExpansionContextType>({
  expansionState: { input: {}, output: {}, metadata: {} },
  setFieldExpansion: () => {},
});

export const useJsonExpansion = () => useContext(JsonExpansionContext);

export function JsonExpansionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [expansionState, setExpansionState] = useState<JsonExpansionState>({
    input: {},
    output: {},
    metadata: {},
  });

  const setFieldExpansion = useCallback(
    (field: keyof JsonExpansionState, expansion: Record<string, boolean>) => {
      setExpansionState((prev) => ({
        ...prev,
        [field]: expansion,
      }));
    },
    [],
  );

  return (
    <JsonExpansionContext.Provider
      value={{ expansionState, setFieldExpansion }}
    >
      {children}
    </JsonExpansionContext.Provider>
  );
}
