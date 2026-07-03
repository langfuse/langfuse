import { useEffect } from "react";
import { type DatasetsTableStore } from "@/src/features/datasets/store/datasetsTableStore";

/**
 * Bridges React Query page data into the selection store, and resets the
 * selection when the folder/search scope changes. The reset is an effect (not a
 * nav-handler call) so browser back/forward — which changes the route without
 * firing a handler — also clears a now-out-of-scope selection.
 */
export function useDatasetsTableSelectionSync({
  store,
  pageRowIds,
  totalCount,
  currentFolderPath,
  searchQuery,
}: {
  store: DatasetsTableStore;
  pageRowIds: string[];
  totalCount: number | null;
  currentFolderPath: string | undefined;
  searchQuery: string | null;
}) {
  // Mirror the visible page's rows into the store so selection stays page-scoped.
  useEffect(() => {
    store.getState().actions.syncPageRows({ pageRowIds, totalCount });
  }, [store, pageRowIds, totalCount]);

  // Reset the selection when the folder/search scope changes so Delete never
  // targets rows from a scope the user has left. Pagination is excluded — it
  // keeps the same scope.
  useEffect(() => {
    store.getState().actions.clearSelection();
  }, [store, currentFolderPath, searchQuery]);
}
