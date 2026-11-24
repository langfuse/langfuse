import { useMemo } from "react";
import { useStore } from "zustand";

import { getGatewayGuardrailsTableStore } from "@/src/features/ai-gateway/components/GatewayGuardrailsPage/stores/gatewayGuardrailsTableStores";
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

  const guardrails = api.aiGateway.listGuardrails.useQuery({
    orgId: organizationId,
    searchQuery: trimmedSearch,
    page: pagination.pageIndex,
    limit: pagination.pageSize,
  });
  const rowSelection = useStore(selectionStore, (s) => s.rowSelection);
  const selectAll = useStore(selectionStore, (s) => s.selectAll);
  const rows = guardrails.data?.rows;

  const selectedRows = useMemo(
    () => (rows ?? []).filter((row) => rowSelection[row.id]),
    [rows, rowSelection],
  );

  const { clearSelection, toggleRow } = selectionStore.getState().actions;
  const update = (changes: Partial<typeof state>) => {
    clearSelection();
    store.setState(changes);
  };

  return {
    guardrails,
    selectionStore,
    selectedRows,
    selectAll,
    matching: {
      type: "matching" as const,
      searchQuery: trimmedSearch,
    },
    clearSelection,
    toggleRow: (rowId: string) => toggleRow(rowId, !rowSelection[rowId]),
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
