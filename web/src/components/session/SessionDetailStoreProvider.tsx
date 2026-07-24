import { createContext, useContext, type ReactNode } from "react";
import { useStore } from "zustand";
import {
  type SessionDetailStore,
  type SessionDetailStoreState,
} from "@/src/components/session/sessionDetailStore";

const SessionDetailStoreContext = createContext<SessionDetailStore | null>(
  null,
);

export function SessionDetailStoreProvider({
  children,
  store,
}: {
  children: ReactNode;
  store: SessionDetailStore;
}) {
  return (
    <SessionDetailStoreContext.Provider value={store}>
      {children}
    </SessionDetailStoreContext.Provider>
  );
}

export function useSessionDetailStore<TValue>(
  selector: (state: SessionDetailStoreState) => TValue,
): TValue {
  const store = useContext(SessionDetailStoreContext);

  if (!store) {
    throw new Error(
      "useSessionDetailStore must be used within SessionDetailStoreProvider",
    );
  }

  return useStore(store, selector);
}

/**
 * Raw store handle for imperative reads/writes inside event handlers
 * (e.g. turn selection retargeting an open inspector) — no subscription.
 */
export function useSessionDetailStoreApi(): SessionDetailStore {
  const store = useContext(SessionDetailStoreContext);

  if (!store) {
    throw new Error(
      "useSessionDetailStoreApi must be used within SessionDetailStoreProvider",
    );
  }

  return store;
}
