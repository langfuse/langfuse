import {
  createContext,
  useContext,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";

import {
  createPageContextStore,
  type PageContextStore,
} from "@/src/features/page-context/pageContextStore";
import type { PageContextSnapshot } from "@/src/features/page-context/types";

const PageContextStoreContext = createContext<PageContextStore | null>(null);

/** Owns the registry pages publish into for the lifetime of the app shell. */
export function PageContextProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createPageContextStore);

  return (
    <PageContextStoreContext.Provider value={store}>
      {children}
    </PageContextStoreContext.Provider>
  );
}

/** Null outside the app shell (public share pages, tests without a shell). */
export function usePageContextStore(): PageContextStore | null {
  return useContext(PageContextStoreContext);
}

/**
 * Publishes what the calling surface shows. Pass a referentially stable
 * snapshot (derive it with `useMemo`), or every render republishes.
 */
export function usePublishPageContext(snapshot: PageContextSnapshot | null) {
  const store = useContext(PageContextStoreContext);
  const publisherId = useId();

  // The registry is an external store: publishing is the subscription and
  // retracting on unmount is its cleanup. Split in two so an update keeps the
  // publisher's mount order instead of re-registering it as the newest one.
  useEffect(() => {
    if (!store) {
      return;
    }
    if (snapshot) {
      store.publish(publisherId, snapshot);
    } else {
      store.retract(publisherId);
    }
  }, [publisherId, snapshot, store]);

  useEffect(() => {
    return () => store?.retract(publisherId);
  }, [publisherId, store]);
}
