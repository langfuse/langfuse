import { createStore, type StoreApi } from "zustand/vanilla";

import { createTableSelectionStore } from "@/src/components/table/table-selection-store";

const PAGE_SIZE = 10;

type GatewayGuardrailsTableStoreState = {
  searchQuery: string;
  pagination: { pageIndex: number; pageSize: number };
  selectionStore: ReturnType<typeof createTableSelectionStore>;
};

const stores = new Map<string, StoreApi<GatewayGuardrailsTableStoreState>>();

/** Search, page, and row selection for an organization's guardrails table. */
export function getGatewayGuardrailsTableStore(organizationId: string) {
  const existing = stores.get(organizationId);
  if (existing) return existing;
  const store = createStore<GatewayGuardrailsTableStoreState>(() => ({
    searchQuery: "",
    pagination: { pageIndex: 0, pageSize: PAGE_SIZE },
    selectionStore: createTableSelectionStore(),
  }));
  stores.set(organizationId, store);
  return store;
}
