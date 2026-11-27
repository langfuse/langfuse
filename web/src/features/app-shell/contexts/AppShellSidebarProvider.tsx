import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/router";
import { useStore } from "zustand";
import {
  createSidebarStore,
  type SidebarStore,
  type SidebarStoreState,
} from "@/src/features/app-shell/stores/sidebarStore";

const AppShellSidebarContext = createContext<SidebarStore | null>(null);
const MOBILE_VIEWPORT_QUERY = "(max-width: 767px)";

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Query-only router transitions (filters, pagination) keep transient navigation open. */
function isPathChange(url: string) {
  return (
    new URL(url, window.location.origin).pathname !== window.location.pathname
  );
}

/** Owns the sidebar store for one mounted app shell. */
export function AppShellSidebarProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [store] = useState(() =>
    createSidebarStore({
      storage: browserStorage(),
      isMobile:
        typeof window !== "undefined" &&
        window.matchMedia(MOBILE_VIEWPORT_QUERY).matches,
    }),
  );

  // Native media-query events own viewport transitions and their menu cleanup.
  useEffect(() => {
    const media = window.matchMedia(MOBILE_VIEWPORT_QUERY);
    const { setViewport } = store.getState().actions;
    const handleChange = (event: MediaQueryListEvent) =>
      setViewport(event.matches);
    media.addEventListener("change", handleChange);
    setViewport(media.matches);
    return () => media.removeEventListener("change", handleChange);
  }, [store]);

  // The Next.js router closes transient navigation when leaving the page.
  useEffect(() => {
    const { close } = store.getState().actions;
    const handleRouteChangeStart = (url: string) => {
      if (!isPathChange(url)) return;
      close();
    };
    router.events.on("routeChangeStart", handleRouteChangeStart);
    return () => {
      router.events.off("routeChangeStart", handleRouteChangeStart);
    };
  }, [router.events, store]);

  return (
    <AppShellSidebarContext.Provider value={store}>
      {children}
    </AppShellSidebarContext.Provider>
  );
}

export function useAppShellSidebarStoreApi(): SidebarStore {
  const store = useContext(AppShellSidebarContext);
  if (!store) {
    throw new Error(
      "App shell sidebar hooks must be used within AppShellSidebarProvider",
    );
  }
  return store;
}

export function useAppShellSidebar<TValue>(
  selector: (state: Omit<SidebarStoreState, "actions">) => TValue,
): TValue {
  return useStore(useAppShellSidebarStoreApi(), selector);
}

/** Stable action references; reading them never re-renders. */
export function useAppShellSidebarActions(): SidebarStoreState["actions"] {
  return useAppShellSidebarStoreApi().getState().actions;
}
