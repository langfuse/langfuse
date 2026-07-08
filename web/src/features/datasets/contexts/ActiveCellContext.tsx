import { type ScoreAggregate } from "@langfuse/shared";
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";

type ActiveCell = {
  traceId: string;
  observationId?: string;
  scoreAggregates: ScoreAggregate;
  environment?: string;
};

type ActiveCellContextValue = {
  activeCell: ActiveCell | null;
  setActiveCell: (cell: ActiveCell | null) => void;
  clearActiveCell: () => void;
};

/**
 * Tracks active dataset run item cell for annotation UI.
 *
 * Single cell can be active at a time. Used for cell highlighting
 * and side panel state management.
 */
const ActiveCellContext = createContext<ActiveCellContextValue | undefined>(
  undefined,
);

export function ActiveCellProvider({ children }: { children: ReactNode }) {
  const [activeCell, setActiveCellState] = useState<ActiveCell | null>(null);

  const setActiveCell = useCallback((cell: ActiveCell | null) => {
    setActiveCellState(cell);
  }, []);

  const clearActiveCell = useCallback(() => {
    setActiveCellState(null);
  }, []);

  const value = useMemo(
    () => ({ activeCell, setActiveCell, clearActiveCell }),
    [activeCell, setActiveCell, clearActiveCell],
  );

  return (
    <ActiveCellContext.Provider value={value}>
      {children}
    </ActiveCellContext.Provider>
  );
}

export function useActiveCell() {
  const context = useContext(ActiveCellContext);
  if (!context) {
    throw new Error("useActiveCell must be used within ActiveCellProvider");
  }
  return context;
}
