import { useMemo } from "react";

type BatchQueryLike<TItem> = {
  data?: TItem[];
  isPending: boolean;
  isFetching: boolean;
};

/**
 * Per-row loading state for a batch query that lands one step behind the rows
 * (trace metrics, batched I/O). A row keeps whatever it already has while the
 * next batch is in flight; only a row whose id has not arrived yet reads as
 * pending — so a refresh does not blink every cell back to a skeleton.
 */
export function usePendingRowIds<TItem extends { id: string }>(
  query: BatchQueryLike<TItem>,
): (rowId: string) => boolean {
  const loadedIds = useMemo(
    () => new Set((query.data ?? []).map((item) => item.id)),
    [query.data],
  );

  return (rowId: string) =>
    (query.isPending || query.isFetching) && !loadedIds.has(rowId);
}
