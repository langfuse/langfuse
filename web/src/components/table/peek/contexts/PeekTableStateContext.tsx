import {
  createContext,
  useContext,
  useState,
  useMemo,
  type ReactNode,
} from "react";
import type { FilterState, OrderByState } from "@langfuse/shared";

interface PeekTableState {
  filters: FilterState;
  sorting: OrderByState;
  pagination: { pageIndex: number; pageSize: number };
  search: { query: string | null; type: string[] };
}

interface PeekTableStateContextValue {
  tableState: PeekTableState;
  setTableState: (state: PeekTableState) => void;
}

const PeekTableStateContext = createContext<
  PeekTableStateContextValue | undefined
>(undefined);

export function PeekTableStateProvider({ children }: { children: ReactNode }) {
  const [tableState, setTableState] = useState<PeekTableState>({
    filters: [],
    sorting: null,
    pagination: { pageIndex: 0, pageSize: 50 },
    search: { query: null, type: ["id"] },
  });

  const value = useMemo(() => ({ tableState, setTableState }), [tableState]);

  return (
    <PeekTableStateContext.Provider value={value}>
      {children}
    </PeekTableStateContext.Provider>
  );
}

export function usePeekTableState() {
  return useContext(PeekTableStateContext);
}
