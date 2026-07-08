import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useStore } from "zustand";

import {
  type SearchBarStore,
  type SearchBarStoreState,
} from "@/src/features/search-bar/store/searchBarStore";

type SearchBarContextValue = {
  store: SearchBarStore;
  /** Apply the current draft to the table's filter state (single source of
   * truth). Returns the canonical committed text on success, or null (and
   * reveals diagnostics) when the draft is invalid. */
  commit: () => string | null;
};

const SearchBarContext = createContext<SearchBarContextValue | null>(null);

export function SearchBarStoreProvider({
  children,
  store,
  commit,
}: {
  children: ReactNode;
  store: SearchBarStore;
  commit: () => string | null;
}) {
  const value = useMemo(() => ({ store, commit }), [store, commit]);
  return (
    <SearchBarContext.Provider value={value}>
      {children}
    </SearchBarContext.Provider>
  );
}

function useSearchBarContext(): SearchBarContextValue {
  const ctx = useContext(SearchBarContext);
  if (!ctx) {
    throw new Error("useSearchBar* must be used within SearchBarStoreProvider");
  }
  return ctx;
}

export function useSearchBarStoreApi(): SearchBarStore {
  return useSearchBarContext().store;
}

export function useSearchBarStore<TValue>(
  selector: (state: SearchBarStoreState) => TValue,
): TValue {
  return useStore(useSearchBarContext().store, selector);
}

export function useSearchBarCommit(): () => string | null {
  return useSearchBarContext().commit;
}
