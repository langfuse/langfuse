import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

export interface SelectionData {
  dataField: "input" | "output" | "metadata";
  path: string[];
  rangeStart: number[];
  rangeEnd: number[];
  selectedText: string;
  anchorRect: DOMRect | null;
  startRect?: DOMRect; // Position of selection start (for bubble positioning)
}

interface InlineCommentSelectionContextType {
  selection: SelectionData | null;
  setSelection: (selection: SelectionData | null) => void;
  clearSelection: () => void;
  isSelecting: boolean;
}

const InlineCommentSelectionContext =
  createContext<InlineCommentSelectionContextType | null>(null);

export function InlineCommentSelectionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [selection, setSelection] = useState<SelectionData | null>(null);

  const clearSelection = useCallback(() => {
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  return (
    <InlineCommentSelectionContext.Provider
      value={{
        selection,
        setSelection,
        clearSelection,
        isSelecting: selection !== null,
      }}
    >
      {children}
    </InlineCommentSelectionContext.Provider>
  );
}

export function useInlineCommentSelection() {
  const context = useContext(InlineCommentSelectionContext);
  if (!context) {
    throw new Error(
      "useInlineCommentSelection must be used within InlineCommentSelectionProvider",
    );
  }
  return context;
}

/**
 * Optional hook that doesn't throw if context is missing.
 * Useful for components that may or may not be inside the provider.
 */
export function useInlineCommentSelectionOptional() {
  return useContext(InlineCommentSelectionContext);
}
