import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { RowHeightRendering } from "./data-table-row-height-switch";

const RowHeightRenderingContext = createContext<Pick<
  RowHeightRendering,
  "compact" | "expandedRead"
> | null>(null);

/**
 * Publishes the rendering of the height on screen, including a drag still
 * in progress. The value changes only when the row crosses Medium, so cells
 * do not re-render on every pixel.
 */
export function RowHeightRenderingProvider({
  compact,
  expandedRead,
  children,
}: {
  compact: boolean;
  expandedRead: boolean;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ compact, expandedRead }),
    [compact, expandedRead],
  );
  return (
    <RowHeightRenderingContext.Provider value={value}>
      {children}
    </RowHeightRenderingContext.Provider>
  );
}

/** Null outside a data table. Inside one, the height on screen, drag included. */
export function useRowHeightRendering() {
  return useContext(RowHeightRenderingContext);
}
