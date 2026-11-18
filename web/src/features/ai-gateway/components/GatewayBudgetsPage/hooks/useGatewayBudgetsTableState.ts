import { useMemo, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { useStore } from "zustand";

import { createTableSelectionStore } from "@/src/components/table/table-selection-store";
import type { GatewayBudgetStatus } from "@/src/features/ai-gateway/constants/gatewayBudgetStatuses";
import type { GatewaySpendTab } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";
import { api } from "@/src/utils/api";

const PAGE_SIZE = 10;

/**
 * The budgets table's query and selection, shared with the spend chart so its
 * filter is always the selected rows. The selection clears whenever the listed
 * rows change, so it never outlives them.
 */
export function useGatewayBudgetsTableState(
  organizationId: string,
  tab: GatewaySpendTab,
) {
  const [state, setState] = useState(initialState);
  const { searchQuery, status, pagination, selectionStore } = state;

  const budgets = api.aiGateway.listBudgets.useQuery(
    {
      orgId: organizationId,
      scope: tab === "apiKeys" ? "API_KEY" : "USER",
      searchQuery: searchQuery.trim() || undefined,
      status,
      page: pagination.pageIndex,
      limit: pagination.pageSize,
    },
    // The table re-renders without end while it shows loading rows after it
    // has shown data once, so keep the previous rows until the next ones load.
    { placeholderData: keepPreviousData },
  );
  const rowSelection = useStore(selectionStore, (store) => store.rowSelection);
  const rows = budgets.data?.rows;
  // Stable while the rows and selection are, so the spend chart's query is too.
  const selectedRows = useMemo(
    () => (rows ?? []).filter((row) => rowSelection[row.id]),
    [rows, rowSelection],
  );

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
      onChange: (value: GatewayBudgetStatus) =>
        update({ status: value, pagination: firstPage(pagination) }),
    },
    pagination: {
      state: pagination,
      onChange: (value: typeof pagination) => update({ pagination: value }),
    },
  };
}

function initialState() {
  return {
    searchQuery: "",
    status: "all" as GatewayBudgetStatus,
    pagination: { pageIndex: 0, pageSize: PAGE_SIZE },
    selectionStore: createTableSelectionStore(),
  };
}

function firstPage(pagination: { pageIndex: number; pageSize: number }) {
  return { ...pagination, pageIndex: 0 };
}
