import { createStore, type StoreApi } from "zustand/vanilla";
import { type RowSelectionState, type Updater } from "@tanstack/react-table";
import { type TableSelectionStoreState } from "@/src/components/table/table-selection-store";

type RowSelectionUpdater = Updater<RowSelectionState>;
type BooleanUpdater = Updater<boolean>;

export interface ObservationsTableStoreState extends TableSelectionStoreState {
  showAddToDatasetDialog: boolean;
  actions: TableSelectionStoreState["actions"] & {
    syncPageRows: (payload: {
      pageRowIds: string[];
      totalCount: number | null;
    }) => void;
    syncSelectAll: (selectAll: boolean) => void;
    setShowAddToDatasetDialog: (isOpen: boolean) => void;
  };
}

export type ObservationsTableStore = StoreApi<ObservationsTableStoreState>;

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

export function createObservationsTableStore({
  initialSelectAll,
  onSelectAllChange,
}: {
  initialSelectAll: boolean;
  onSelectAllChange: (selectAll: boolean) => void;
}): ObservationsTableStore {
  return createStore<ObservationsTableStoreState>((set, get) => {
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
      onSelectAllChange(nextSelectAll);
    };

    const clearSelection = () => {
      updateSelection({}, false);
      onSelectAllChange(false);
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
      if (!nextSelected) onSelectAllChange(false);
    };

    return {
      rowSelection: {},
      selectAll: initialSelectAll,
      selectedPageRowIds: [],
      pageRowIds: [],
      totalCount: null,
      showAddToDatasetDialog: false,
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
        syncSelectAll: (selectAll: boolean) => {
          if (selectAll !== get().selectAll) {
            set({ selectAll });
          }
        },
        setShowAddToDatasetDialog: (isOpen: boolean) => {
          set({ showAddToDatasetDialog: isOpen });
        },
      },
    };
  });
}
