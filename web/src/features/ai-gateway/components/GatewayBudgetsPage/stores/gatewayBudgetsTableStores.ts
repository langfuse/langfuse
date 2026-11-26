import { createStore, type StoreApi } from "zustand/vanilla";

import { createTableSelectionStore } from "@/src/components/table/table-selection-store";
import type { GatewayBudgetStatus } from "@/src/features/ai-gateway/constants/gatewayBudgetStatuses";
import type { GatewaySpendTab } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";

const PAGE_SIZE = 10;

type GatewayBudgetsTableStoreState = {
  searchQuery: string;
  status: GatewayBudgetStatus;
  pagination: { pageIndex: number; pageSize: number };
  selectionStore: ReturnType<typeof createTableSelectionStore>;
};

const stores = new Map<string, StoreApi<GatewayBudgetsTableStoreState>>();

/**
 * The search, filter, page and selection of one organization's budgets table
 * on one tab. Shared by the table and the page header, which renders outside
 * the table's tree, so "Add budget" can start with the selected rows.
 */
export function getGatewayBudgetsTableStore(
  organizationId: string,
  tab: GatewaySpendTab,
) {
  const key = `${organizationId}:${tab}`;
  const existing = stores.get(key);
  if (existing) return existing;
  const store = createStore<GatewayBudgetsTableStoreState>(() => ({
    searchQuery: "",
    status: "all",
    pagination: { pageIndex: 0, pageSize: PAGE_SIZE },
    selectionStore: createTableSelectionStore(),
  }));
  stores.set(key, store);
  return store;
}
