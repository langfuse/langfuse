import { useMemo } from "react";
import { useStore } from "zustand";

import { getGatewayGuardrailsTableStore } from "@/src/features/ai-gateway/stores/gatewayGuardrailsTableStores";
import { api } from "@/src/utils/api";

/**
 * The guardrails table's query and selection, shared with the flagged-requests
 * chart so selected rows filter or break down the chart. Selection clears when
 * search or pagination changes so it never outlives the listed rows.
 */
export function useGatewayGuardrailsTableState(organizationId: string) {
  const store = getGatewayGuardrailsTableStore(organizationId);
  const state = useStore(store);
  const { searchQuery, pagination, selectionStore } = state;
  const trimmedSearch = searchQuery.trim() || undefined;

  const guardrails = api.aiGateway.guardrails.list.useQuery(
    {
      orgId: organizationId,
      searchQuery: trimmedSearch,
      page: pagination.pageIndex,
      limit: pagination.pageSize,
    },
    {
      // Keep prior rows/counts when paging, searching, or resizing within the
      // same org so the page never unmounts back to the initial skeleton.
      placeholderData: (previousData, previousQuery) => {
        const previousInput = previousQuery?.queryKey[1] as
          | { input?: { orgId?: string } }
          | undefined;
        return previousInput?.input?.orgId === organizationId
          ? previousData
          : undefined;
      },
    },
  );

  const { clearSelection, toggleRow: setRowSelected } =
    selectionStore.getState().actions;
  const update = (changes: Partial<typeof state>) => {
    clearSelection();
    store.setState(changes);
  };

  const clampPageAfterDelete = (deletedCount: number) => {
    const remaining = Math.max(
      0,
      (guardrails.data?.totalCount ?? 0) - deletedCount,
    );
    const maxPage =
      remaining === 0 ? 0 : Math.floor((remaining - 1) / pagination.pageSize);
    if (pagination.pageIndex > maxPage) {
      store.setState({ pagination: { ...pagination, pageIndex: maxPage } });
    }
  };

  const matching = useMemo(
    () => ({
      type: "matching" as const,
      searchQuery: trimmedSearch,
    }),
    [trimmedSearch],
  );

  return {
    guardrails,
    selectionStore,
    matching,
    clearSelection,
    clampPageAfterDelete,
    toggleRow: (rowId: string) =>
      setRowSelected(rowId, !selectionStore.getState().rowSelection[rowId]),
    search: {
      value: searchQuery,
      onChange: (value: string) =>
        update({ searchQuery: value, pagination: firstPage(pagination) }),
    },
    pagination: {
      state: pagination,
      onChange: (value: typeof pagination) => update({ pagination: value }),
    },
  };
}

function firstPage(pagination: { pageIndex: number; pageSize: number }) {
  return { ...pagination, pageIndex: 0 };
}
