import { createContext, useContext, type ReactNode } from "react";
import { useStore } from "zustand";
import {
  type ObservationsTableStore,
  type ObservationsTableStoreState,
} from "@/src/features/tracing-tables/observations/observationsTableStore";

const ObservationsTableStoreContext =
  createContext<ObservationsTableStore | null>(null);

export function ObservationsTableStoreProvider({
  children,
  store,
}: {
  children: ReactNode;
  store: ObservationsTableStore;
}) {
  return (
    <ObservationsTableStoreContext.Provider value={store}>
      {children}
    </ObservationsTableStoreContext.Provider>
  );
}

export function useObservationsTableStore<TValue>(
  selector: (state: ObservationsTableStoreState) => TValue,
) {
  const store = useContext(ObservationsTableStoreContext);

  if (!store) {
    throw new Error(
      "useObservationsTableStore must be used within ObservationsTableStoreProvider",
    );
  }

  return useStore(store, selector);
}
