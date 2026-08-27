import { useEffect } from "react";
import { type ExperimentsTableStore } from "@/src/features/experiments/store/experimentsTableStore";

/**
 * Bridges React Query page data into the selection store so selection stays
 * page-scoped. No scope-based reset (unlike datasets): consumers only read
 * `selectedPageRowIds`, so selections outside the visible page are inert.
 */
export function useExperimentsTableSelectionSync({
  store,
  pageRowIds,
  totalCount,
}: {
  store: ExperimentsTableStore;
  pageRowIds: string[];
  totalCount: number | null;
}) {
  useEffect(() => {
    store.getState().actions.syncPageRows({ pageRowIds, totalCount });
  }, [store, pageRowIds, totalCount]);
}
