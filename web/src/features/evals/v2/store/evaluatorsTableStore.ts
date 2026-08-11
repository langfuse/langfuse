import { type RowSelectionState, type Updater } from "@tanstack/react-table";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { TableSelectionStoreState } from "@/src/components/table/table-selection-store";

export type EvaluatorsTableStoreState = TableSelectionStoreState;

export type EvaluatorsTableStore = StoreApi<EvaluatorsTableStoreState>;

function resolveUpdater<T>(updater: Updater<T>, current: T) {
  return typeof updater === "function"
    ? (updater as (value: T) => T)(current)
    : updater;
}

export function createEvaluatorsTableStore(): EvaluatorsTableStore {
  return createStore<EvaluatorsTableStoreState>((set, get) => {
    const updateSelection = (
      rowSelection: RowSelectionState,
      selectAll = get().selectAll,
    ) => {
      set({
        rowSelection,
        selectAll,
      });
    };

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
          if (!selected) {
            clearSelection();
            return;
          }
          toggleRows(rowIds, true);
        },
        clearSelection,
      },
    };
  });
}
