import { createStore, type StoreApi } from "zustand/vanilla";
import { type RowSelectionState, type Updater } from "@tanstack/react-table";
import { type TableSelectionStoreState } from "@/src/components/table/table-selection-store";
import { type RouterInput } from "@/src/utils/types";
import { type usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

type RowSelectionUpdater = Updater<RowSelectionState>;
type BooleanUpdater = Updater<boolean>;
type DeleteManyInput = RouterInput["datasets"]["deleteMany"];
type PostHogClientCapture = ReturnType<typeof usePostHogClientCapture>;

// Row ids encode whether a row is a folder so the selection (just ids) can be
// split back into datasets vs folders without the full row objects.
const FOLDER_ROW_ID_PREFIX = "folder:";

export function toFolderRowId(folderPath: string) {
  return `${FOLDER_ROW_ID_PREFIX}${folderPath}`;
}

function splitSelectedRowIds(rowIds: string[]) {
  const datasetIds: string[] = [];
  const folderPaths: string[] = [];
  for (const rowId of rowIds) {
    if (rowId.startsWith(FOLDER_ROW_ID_PREFIX)) {
      folderPaths.push(rowId.slice(FOLDER_ROW_ID_PREFIX.length));
    } else {
      datasetIds.push(rowId);
    }
  }
  return { datasetIds, folderPaths };
}

// Folder + search the delete targets; passed at click time (route state, not
// mirrored into the store).
type DatasetsTableScope = {
  folderPath: string | undefined;
  searchQuery: string | null;
};

export interface DatasetsTableStoreState extends TableSelectionStoreState {
  actions: TableSelectionStoreState["actions"] & {
    syncPageRows: (payload: {
      pageRowIds: string[];
      totalCount: number | null;
    }) => void;
    deleteSelected: (params: {
      projectId: string;
      deleteMany: (input: DeleteManyInput) => Promise<unknown>;
      capture: PostHogClientCapture;
      scope: DatasetsTableScope;
    }) => Promise<void>;
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
        deleteSelected: async ({ projectId, deleteMany, capture, scope }) => {
          const { selectAll, selectedPageRowIds } = get();
          const { datasetIds, folderPaths } =
            splitSelectedRowIds(selectedPageRowIds);

          capture("datasets:delete_form_submit", {
            source: "table-multi-select",
            // Folder-expanded total is unknown client-side, so omit for select-all.
            count: selectAll
              ? undefined
              : datasetIds.length + folderPaths.length,
            datasets: datasetIds.length,
            folders: folderPaths.length,
            selectAll,
          });

          await deleteMany({
            projectId,
            datasetIds,
            folderPaths,
            isBatchAction: selectAll,
            query: {
              filter: null,
              orderBy: { column: "createdAt", order: "DESC" },
              searchQuery: scope.searchQuery ?? undefined,
              pathPrefix: scope.folderPath,
            },
          });

          clearSelection();
        },
      },
    };
  });
}
