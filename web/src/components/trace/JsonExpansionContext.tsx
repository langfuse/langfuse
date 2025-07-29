import { createContext, useContext, useState, useCallback } from "react";

// Context Provider to store expanded/collapsed state of JSONs across different JSONs with similar structure
// Used for traces (input/output/metadata) but easily expandable to further fields.

type ExpandedState = Record<string, boolean>;
// Stored then like this:
// {"0":true,"messages":true}
// Which is "doubled", 0 is the tanstack table format and messages is the respective key in the object.
// {} means collapse everything while undefined/null means not set yet.

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
      const expansionKeys = Object.keys(expansion).filter(
        (key) => expansion[key],
      );
      console.log(
        `[JsonExpansionProvider] Updating ${field} expansion with ${expansionKeys.length} expanded keys: ${expansionKeys.join(", ")}. New state: ${JSON.stringify(expansion)}`,
      );
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
