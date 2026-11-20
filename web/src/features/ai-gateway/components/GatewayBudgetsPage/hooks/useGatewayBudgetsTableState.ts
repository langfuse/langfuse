import { useMemo } from "react";
import { useStore } from "zustand";

import type { GatewayBudgetStatus } from "@/src/features/ai-gateway/constants/gatewayBudgetStatuses";
import {
  GATEWAY_SPEND_TABS,
  type GatewaySpendTab,
} from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";
import { getGatewayBudgetsTableStore } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/stores/gatewayBudgetsTableStores";
import { api } from "@/src/utils/api";

/**
 * The budgets table's query and selection, shared with the spend chart so its
 * filter is always the selected rows, or every matching row under select-all.
 * The selection clears whenever the listed rows change, so it never outlives
 * them. The page header reads the same state, to start "Add budget" with the
 * selected rows.
 */
export function useGatewayBudgetsTableState(
  organizationId: string,
  tab: GatewaySpendTab,
) {
  const store = getGatewayBudgetsTableStore(organizationId, tab);
  const state = useStore(store);
  const { searchQuery, status, pagination, selectionStore } = state;
  const trimmedSearch = searchQuery.trim() || undefined;

  const budgets = api.aiGateway.listBudgets.useQuery({
    orgId: organizationId,
    scope: GATEWAY_SPEND_TABS[tab].scope,
    searchQuery: trimmedSearch,
    status,
    page: pagination.pageIndex,
    limit: pagination.pageSize,
  });
  const rowSelection = useStore(selectionStore, (store) => store.rowSelection);
  const selectAll = useStore(selectionStore, (store) => store.selectAll);
  const rows = budgets.data?.rows;
  // Stable while the rows and selection are, so the spend chart's query is too.
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
    budgets,
    selectionStore,
    selectedRows,
    /** Every row matching the search and status, across all pages. */
    selectAll,
    matching: {
      type: "matching" as const,
      searchQuery: trimmedSearch,
      status,
    },
    clearSelection,
    toggleRow: (rowId: string) => toggleRow(rowId, !rowSelection[rowId]),
    search: {
      value: searchQuery,
      onChange: (value: string) =>
        update({ searchQuery: value, pagination: firstPage(pagination) }),
    },
    status: {
      value: status,
      onChange: (value: GatewayBudgetStatus) =>
        update({ status: value, pagination: firstPage(pagination) }),
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
