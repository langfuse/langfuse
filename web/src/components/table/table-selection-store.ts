import { useSyncExternalStore } from "react";
import { type RowSelectionState, type Updater } from "@tanstack/react-table";
import { createStore, type StoreApi } from "zustand/vanilla";

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
    toggleRows: (rowIds: string[], nextSelected: boolean) => void;
    togglePageRows: (rowIds: string[], nextSelected: boolean) => void;
    clearSelection: () => void;
  };
}

export type TableSelectionStore = StoreApi<TableSelectionStoreState>;

function resolveUpdater<T>(updater: Updater<T>, current: T) {
  return typeof updater === "function"
    ? (updater as (value: T) => T)(current)
    : updater;
}

export function createTableSelectionStore(): TableSelectionStore {
  return createStore<TableSelectionStoreState>((set, get) => {
    const updateSelection = (
      rowSelection: RowSelectionState,
      selectAll = get().selectAll,
    ) => set({ rowSelection, selectAll });
    const clearSelection = () => updateSelection({}, false);
    const toggleRows = (rowIds: string[], selected: boolean) => {
      const rowSelection = { ...get().rowSelection };
      for (const rowId of rowIds) {
        if (selected) rowSelection[rowId] = true;
        else delete rowSelection[rowId];
      }
      updateSelection(rowSelection, selected ? get().selectAll : false);
    };

    return {
      rowSelection: {},
      selectAll: false,
      selectedPageRowIds: [],
      pageRowIds: [],
      totalCount: null,
      actions: {
        setRowSelection: (updater) =>
          updateSelection(resolveUpdater(updater, get().rowSelection)),
        setSelectAll: (updater) =>
          set({ selectAll: resolveUpdater(updater, get().selectAll) }),
        toggleRow: (rowId, selected) => toggleRows([rowId], selected),
        toggleRows,
        togglePageRows: (rowIds, selected) => {
          if (!selected) return clearSelection();
          toggleRows(rowIds, true);
        },
        clearSelection,
      },
    };
  });
}

/**
 * Minimal store surface DataTable needs for selection rendering. Tables that
 * keep selection in an external store pass it explicitly via the
 * `selectionStore` prop; DataTable stays context-free so nested tables are
 * unaffected by each other's selection state.
 */
export interface TableSelectionStoreLike {
  subscribe: (listener: () => void) => () => void;
  getState: () => TableSelectionStoreState;
}

const subscribeNoop = () => () => undefined;

function useTableSelectionValue<TValue>(
  store: TableSelectionStoreLike | undefined,
  selector: (state: TableSelectionStoreState) => TValue,
  fallback: TValue,
) {
  return useSyncExternalStore(
    store?.subscribe ?? subscribeNoop,
    () => (store ? selector(store.getState()) : fallback),
    () => fallback,
  );
}

export function useTableRowIsSelected(
  store: TableSelectionStoreLike | undefined,
  rowId: string,
  fallbackSelected: boolean,
) {
  return useTableSelectionValue(
    store,
    (state) => Boolean(state.rowSelection[rowId]),
    fallbackSelected,
  );
}

export function useTableSelectAll(
  store: TableSelectionStoreLike | undefined,
  fallbackSelectAll: boolean,
) {
  return useTableSelectionValue(
    store,
    (state) => state.selectAll,
    fallbackSelectAll,
  );
}

export function useTableRowSelection(
  store: TableSelectionStoreLike | undefined,
  fallbackRowSelection: RowSelectionState,
) {
  return useTableSelectionValue(
    store,
    (state) => state.rowSelection,
    fallbackRowSelection,
  );
}
