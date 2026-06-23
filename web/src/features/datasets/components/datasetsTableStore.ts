import { createStore, type StoreApi } from "zustand/vanilla";
import { type RowSelectionState, type Updater } from "@tanstack/react-table";
import { type TableSelectionStoreState } from "@/src/components/table/table-selection-store";

type RowSelectionUpdater = Updater<RowSelectionState>;
type BooleanUpdater = Updater<boolean>;

export interface DatasetsTableStoreState extends TableSelectionStoreState {
  actions: TableSelectionStoreState["actions"] & {
    syncPageRows: (payload: {
      pageRowIds: string[];
      totalCount: number | null;
    }) => void;
  };
}

export type DatasetsTableStore = StoreApi<DatasetsTableStoreState>;

function resolveUpdater<TValue>(
  updater: Updater<TValue>,
  previousValue: TValue,
): TValue {
  return typeof updater === "function"
    ? (updater as (old: TValue) => TValue)(previousValue)
    : updater;
}

function getSelectedPageRowIds(
  rowSelection: RowSelectionState,
  pageRowIds: string[],
) {
  return pageRowIds.filter((rowId) => Boolean(rowSelection[rowId]));
}

export function createDatasetsTableStore(): DatasetsTableStore {
  return createStore<DatasetsTableStoreState>((set, get) => {
    const updateSelection = (
      rowSelection: RowSelectionState,
      selectAll = get().selectAll,
    ) => {
      const { pageRowIds } = get();

      set({
        rowSelection,
        selectAll,
        selectedPageRowIds: getSelectedPageRowIds(rowSelection, pageRowIds),
      });
    };

    const setSelectAll = (updater: BooleanUpdater) => {
      const nextSelectAll = resolveUpdater(updater, get().selectAll);
      if (nextSelectAll === get().selectAll) return;

      set({ selectAll: nextSelectAll });
    };

    const clearSelection = () => {
      updateSelection({}, false);
    };

    const toggleRows = (rowIds: string[], nextSelected: boolean) => {
      const nextRowSelection = { ...get().rowSelection };
      for (const rowId of rowIds) {
        if (nextSelected) {
          nextRowSelection[rowId] = true;
        } else {
          delete nextRowSelection[rowId];
        }
      }

      updateSelection(nextRowSelection, nextSelected ? get().selectAll : false);
    };

    return {
      rowSelection: {},
      selectAll: false,
      selectedPageRowIds: [],
      pageRowIds: [],
      totalCount: null,
      actions: {
        setRowSelection: (updater: RowSelectionUpdater) => {
          updateSelection(resolveUpdater(updater, get().rowSelection));
        },
        setSelectAll,
        toggleRow: (rowId: string, nextSelected: boolean) => {
          toggleRows([rowId], nextSelected);
        },
        toggleRows,
        togglePageRows: (rowIds: string[], nextSelected: boolean) => {
          if (!nextSelected) {
            clearSelection();
            return;
          }

          const nextRowSelection = { ...get().rowSelection };
          for (const rowId of rowIds) {
            nextRowSelection[rowId] = true;
          }

          updateSelection(nextRowSelection);
        },
        clearSelection,
        syncPageRows: ({ pageRowIds, totalCount }) => {
          const { rowSelection } = get();
          set({
            pageRowIds,
            totalCount,
            selectedPageRowIds: getSelectedPageRowIds(rowSelection, pageRowIds),
          });
        },
      },
    };
  });
}
