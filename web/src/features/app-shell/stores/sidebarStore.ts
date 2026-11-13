import { createStore, type StoreApi } from "zustand/vanilla";

export type SidebarLayout = "desktop" | "mobile";
export type SidebarMenu = "workspace" | "account" | "version";

export type SidebarStoreState = {
  /** Desktop preference: full navigation when true, a persistent icon rail otherwise. */
  isExpanded: boolean;
  /** Current viewport; independent of the saved desktop expansion preference. */
  isMobile: boolean;
  isMobileOpen: boolean;
  activeMenu: SidebarMenu | null;
  actions: {
    setExpanded: (isExpanded: boolean) => void;
    /** A breakpoint transition closes every transient navigation surface atomically. */
    setViewport: (isMobile: boolean) => void;
    /** Mod+B toggles desktop expansion or the mobile navigation menu. */
    toggleFromShortcut: (layout: SidebarLayout) => void;
    setMobileOpen: (isOpen: boolean) => void;
    /** Opens the workspace switcher without changing desktop expansion. */
    openSwitcher: (layout: SidebarLayout) => void;
    setSwitcherOpen: (isOpen: boolean) => void;
    /** The persistent sidebar has at most one open child menu. */
    setActiveMenu: (menu: SidebarMenu | null) => void;
    /** Closes transient navigation while preserving the desktop preference. */
    close: () => void;
  };
};

export type SidebarStore = StoreApi<SidebarStoreState>;

type SidebarStorage = Pick<Storage, "getItem" | "setItem">;

/** Reuses the shell preview preference: pinned becomes expanded, unpinned becomes the rail. */
export const SIDEBAR_EXPANDED_STORAGE_KEY = "langfuse:sidebar:pinned:v1";
/** The classic sidebar's expanded/collapsed preference seeds the first shell visit. */
const LEGACY_SIDEBAR_STATE_STORAGE_KEY = "sidebar:state";

function readExpanded(storage: SidebarStorage | null): boolean {
  if (!storage) return false;
  try {
    const stored =
      storage.getItem(SIDEBAR_EXPANDED_STORAGE_KEY) ??
      storage.getItem(LEGACY_SIDEBAR_STATE_STORAGE_KEY);
    return stored !== null && JSON.parse(stored) === true;
  } catch {
    return false;
  }
}

function writeExpanded(storage: SidebarStorage | null, isExpanded: boolean) {
  try {
    storage?.setItem(SIDEBAR_EXPANDED_STORAGE_KEY, JSON.stringify(isExpanded));
  } catch {
    // Private browsing or a full quota: the preference just does not persist.
  }
}

export function createSidebarStore({
  storage,
  isMobile,
}: {
  storage: SidebarStorage | null;
  isMobile: boolean;
}): SidebarStore {
  return createStore<SidebarStoreState>((set, get) => {
    const setExpanded = (isExpanded: boolean) => {
      if (get().isExpanded === isExpanded) return;
      writeExpanded(storage, isExpanded);
      set({ isExpanded });
    };
    const setMobileOpen = (isMobileOpen: boolean) => {
      set({
        isMobileOpen,
        activeMenu: null,
      });
    };

    const setActiveMenu = (activeMenu: SidebarMenu | null) => {
      if (get().activeMenu !== activeMenu) set({ activeMenu });
    };

    return {
      isExpanded: readExpanded(storage),
      isMobile,
      isMobileOpen: false,
      activeMenu: null,
      actions: {
        setExpanded,
        setViewport: (nextIsMobile) => {
          if (get().isMobile === nextIsMobile) return;
          set({
            isMobile: nextIsMobile,
            isMobileOpen: false,
            activeMenu: null,
          });
        },
        toggleFromShortcut: (layout) => {
          if (layout === "mobile") setMobileOpen(!get().isMobileOpen);
          else setExpanded(!get().isExpanded);
        },
        setMobileOpen,
        openSwitcher: (layout) => {
          set({
            activeMenu: "workspace",
            ...(layout === "mobile" ? { isMobileOpen: true } : {}),
          });
        },
        setActiveMenu,
        setSwitcherOpen: (isOpen) => {
          if (isOpen) setActiveMenu("workspace");
          else if (get().activeMenu === "workspace") setActiveMenu(null);
        },
        close: () => {
          if (get().isMobileOpen || get().activeMenu !== null) {
            set({ isMobileOpen: false, activeMenu: null });
          }
        },
      },
    };
  });
}
