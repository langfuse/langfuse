import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { type RowSelectionState, type Updater } from "@tanstack/react-table";

type RowSelectionUpdater = Updater<RowSelectionState>;
type BooleanUpdater = Updater<boolean>;

export interface TableSelectionStoreState {
  rowSelection: RowSelectionState;
  selectAll: boolean;
  selectedPageRowIds: string[];
  pageRowIds: string[];
  totalCount: number | null;
  actions: {
    setRowSelection: (updater: RowSelectionUpdater) => void;
    setSelectAll: (updater: BooleanUpdater) => void;
    toggleRow: (rowId: string, nextSelected: boolean) => void;
    togglePageRows: (rowIds: string[], nextSelected: boolean) => void;
    clearSelection: () => void;
  };
}

export interface TableSelectionStoreLike {
  subscribe: (listener: () => void) => () => void;
  getState: () => TableSelectionStoreState;
}

const TableSelectionStoreContext =
  createContext<TableSelectionStoreLike | null>(null);

const subscribeNoop = () => () => undefined;

export function TableSelectionStoreProvider({
  children,
  store,
}: {
  children: ReactNode;
  store: TableSelectionStoreLike;
}) {
  return (
    <TableSelectionStoreContext.Provider value={store}>
      {children}
    </TableSelectionStoreContext.Provider>
  );
}

export function useOptionalTableSelectionStore() {
  return useContext(TableSelectionStoreContext);
}

function useOptionalTableSelectionValue<TValue>(
  selector: (state: TableSelectionStoreState) => TValue,
  fallback: TValue,
) {
  const store = useOptionalTableSelectionStore();

  return useSyncExternalStore(
    store?.subscribe ?? subscribeNoop,
    () => (store ? selector(store.getState()) : fallback),
    () => fallback,
  );
}

export function useTableRowIsSelected(
  rowId: string,
  fallbackSelected: boolean,
) {
  return useOptionalTableSelectionValue(
    (state) => Boolean(state.rowSelection[rowId]),
    fallbackSelected,
  );
}

export function useTableSelectAll(fallbackSelectAll: boolean) {
  return useOptionalTableSelectionValue(
    (state) => state.selectAll,
    fallbackSelectAll,
  );
}

export function useTableRowSelection(fallbackRowSelection: RowSelectionState) {
  return useOptionalTableSelectionValue(
    (state) => state.rowSelection,
    fallbackRowSelection,
  );
}
