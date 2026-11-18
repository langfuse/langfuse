import { useState } from "react";
import { useStore } from "zustand";

import { createTableSelectionStore } from "@/src/components/table/table-selection-store";
import type { GatewayBudgetStatusFilter } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayBudgetsTable/GatewayBudgetsTable";
import type { GatewaySpendTab } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";
import { api } from "@/src/utils/api";

const PAGE_SIZE = 10;

/**
 * The budgets table's query and selection, shared with the spend chart so its
 * filter is always the selected rows. Everything resets with the tab, and the
 * selection clears whenever the listed rows change, so it never outlives them.
 */
export function useGatewayBudgetsTableState(
  organizationId: string,
  tab: GatewaySpendTab,
) {
  const [state, setState] = useState(() => initialState(tab));
  if (state.tab !== tab) setState(initialState(tab));
  const { searchQuery, status, pagination, selectionStore } = state;

  const budgets = api.aiGateway.listBudgets.useQuery({
    orgId: organizationId,
    scope: tab === "apiKeys" ? "API_KEY" : "USER",
    searchQuery: searchQuery.trim() || undefined,
    exceededOnly: status === "exceeded" || undefined,
    page: pagination.pageIndex,
    limit: pagination.pageSize,
  });
  const rowSelection = useStore(selectionStore, (store) => store.rowSelection);
  const rows = budgets.data?.rows ?? [];
  const selectedRows = rows.filter((row) => rowSelection[row.id]);

  const { clearSelection, toggleRow } = selectionStore.getState().actions;
  const update = (changes: Partial<typeof state>) => {
    clearSelection();
    setState((current) => ({ ...current, ...changes }));
  };

  return {
    budgets,
    selectionStore,
    selectedRows,
    clearSelection,
    toggleRow: (rowId: string) => toggleRow(rowId, !rowSelection[rowId]),
    search: {
      value: searchQuery,
      onChange: (value: string) =>
        update({ searchQuery: value, pagination: firstPage(pagination) }),
    },
    status: {
      value: status,
      onChange: (value: GatewayBudgetStatusFilter) =>
        update({ status: value, pagination: firstPage(pagination) }),
    },
    pagination: {
      state: pagination,
      onChange: (value: typeof pagination) => update({ pagination: value }),
    },
  };
}

function initialState(tab: GatewaySpendTab) {
  return {
    tab,
    searchQuery: "",
    status: "all" as GatewayBudgetStatusFilter,
    pagination: { pageIndex: 0, pageSize: PAGE_SIZE },
    selectionStore: createTableSelectionStore(),
  };
}

function firstPage(pagination: { pageIndex: number; pageSize: number }) {
  return { ...pagination, pageIndex: 0 };
}
