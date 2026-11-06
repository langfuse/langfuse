import { createStore, type StoreApi } from "zustand/vanilla";

/**
 * How the unpinned sidebar is currently shown as an overlay:
 * - `hover`: opened by the pointer; closes shortly after the pointer leaves.
 * - `keyboard`: opened by a shortcut or the keyboard; stays until it is
 *   dismissed (Escape, click outside, focus leaving, navigation).
 */
export type SidebarPeek = "closed" | "hover" | "keyboard";

export type SidebarLayout = "desktop" | "mobile";

export type SidebarStoreState = {
  /** Docked next to the content and pushing it, persisted per browser. */
  isPinned: boolean;
  peek: SidebarPeek;
  isMobileOpen: boolean;
  isSwitcherOpen: boolean;
  actions: {
    /** The pointer reached the left edge or the sidebar handle. */
    pointerEnterTrigger: () => void;
    pointerLeaveTrigger: () => void;
    pointerEnterPanel: () => void;
    pointerLeavePanel: () => void;
    /** Opens the overlay without hover intent, e.g. a tap or the keyboard. */
    openOverlay: (peek: Exclude<SidebarPeek, "closed">) => void;
    close: () => void;
    /** Escape, a click outside, or focus leaving: closes unless a menu or the switcher it owns is open. */
    dismiss: () => void;
    /** Keeps the overlay open while a menu it owns is open. Returns the release. */
    hold: () => () => void;
    setPinned: (isPinned: boolean) => void;
    /** Mod+B: hides a pinned sidebar, otherwise toggles the overlay (or the mobile sheet). */
    toggleFromShortcut: (layout: SidebarLayout) => void;
    setMobileOpen: (isOpen: boolean) => void;
    /** Reveals the sidebar wherever it is hidden and opens the workspace switcher in it. */
    openSwitcher: (layout: SidebarLayout) => void;
    setSwitcherOpen: (isOpen: boolean) => void;
    dispose: () => void;
  };
};

export type SidebarStore = StoreApi<SidebarStoreState>;

type PinnedStorage = Pick<Storage, "getItem" | "setItem">;

/** Hover intent on the edge: long enough to ignore a pointer sweeping past it. */
export const SIDEBAR_OPEN_DELAY_MS = 100;
/** Grace period after the pointer leaves, so a slip or a move into a menu does not close it. */
export const SIDEBAR_CLOSE_DELAY_MS = 300;

export const SIDEBAR_PINNED_STORAGE_KEY = "langfuse:sidebar:pinned:v1";
/** The previous sidebar's expanded/collapsed flag; a collapsed sidebar becomes an unpinned one. */
const LEGACY_SIDEBAR_STATE_STORAGE_KEY = "sidebar:state";

function readPinned(storage: PinnedStorage | null): boolean {
  if (!storage) return true;
  try {
    const stored =
      storage.getItem(SIDEBAR_PINNED_STORAGE_KEY) ??
      storage.getItem(LEGACY_SIDEBAR_STATE_STORAGE_KEY);
    return stored === null ? true : JSON.parse(stored) !== false;
  } catch {
    return true;
  }
}

function writePinned(storage: PinnedStorage | null, isPinned: boolean) {
  try {
    storage?.setItem(SIDEBAR_PINNED_STORAGE_KEY, JSON.stringify(isPinned));
  } catch {
    // Private browsing or a full quota: the preference just does not persist.
  }
}

export function createSidebarStore({
  storage,
}: {
  storage: PinnedStorage | null;
}): SidebarStore {
  let openTimer: ReturnType<typeof setTimeout> | undefined;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let isPointerInPanel = false;
  let holdCount = 0;
  // Closing unmounts every menu the overlay owns, so their holds end with it;
  // a late release from a previous opening must not count against a new one.
  let holdGeneration = 0;
  // Set when the overlay was opened only to show the switcher, so closing the
  // switcher also closes the overlay instead of leaving it behind.
  let isPeekOwnedBySwitcher = false;

  const cancelOpen = () => {
    clearTimeout(openTimer);
    openTimer = undefined;
  };
  const cancelClose = () => {
    clearTimeout(closeTimer);
    closeTimer = undefined;
  };

  return createStore<SidebarStoreState>((set, get) => {
    const close = () => {
      cancelOpen();
      cancelClose();
      isPeekOwnedBySwitcher = false;
      holdCount = 0;
      holdGeneration += 1;
      if (get().peek === "closed" && !get().isSwitcherOpen) return;
      set({ peek: "closed", isSwitcherOpen: false });
    };

    const scheduleClose = () => {
      const { peek, isSwitcherOpen } = get();
      if (peek !== "hover" || isSwitcherOpen || holdCount > 0) return;
      if (isPointerInPanel) return;
      cancelClose();
      closeTimer = setTimeout(close, SIDEBAR_CLOSE_DELAY_MS);
    };

    const openOverlay = (peek: Exclude<SidebarPeek, "closed">) => {
      cancelOpen();
      cancelClose();
      if (get().isPinned || get().peek === peek) return;
      set({ peek });
    };

    return {
      isPinned: readPinned(storage),
      peek: "closed",
      isMobileOpen: false,
      isSwitcherOpen: false,
      actions: {
        pointerEnterTrigger: () => {
          if (get().isPinned) return;
          cancelClose();
          if (get().peek !== "closed" || openTimer !== undefined) return;
          openTimer = setTimeout(() => {
            openTimer = undefined;
            openOverlay("hover");
          }, SIDEBAR_OPEN_DELAY_MS);
        },
        pointerLeaveTrigger: () => {
          cancelOpen();
          scheduleClose();
        },
        pointerEnterPanel: () => {
          isPointerInPanel = true;
          cancelClose();
        },
        pointerLeavePanel: () => {
          isPointerInPanel = false;
          scheduleClose();
        },
        openOverlay,
        close,
        dismiss: () => {
          if (get().isSwitcherOpen || holdCount > 0) return;
          close();
        },
        hold: () => {
          holdCount += 1;
          cancelClose();
          const generation = holdGeneration;
          let isReleased = false;
          return () => {
            if (isReleased || generation !== holdGeneration) return;
            isReleased = true;
            holdCount -= 1;
            scheduleClose();
          };
        },
        setPinned: (isPinned) => {
          if (get().isPinned === isPinned) return;
          cancelOpen();
          cancelClose();
          isPeekOwnedBySwitcher = false;
          writePinned(storage, isPinned);
          // Unpinning is done from the sidebar itself, so it stays visible as
          // a hover overlay under the pointer and leaves with the pointer.
          isPointerInPanel = !isPinned;
          set({ isPinned, peek: isPinned ? "closed" : "hover" });
        },
        toggleFromShortcut: (layout) => {
          if (layout === "mobile") {
            set({ isMobileOpen: !get().isMobileOpen });
            return;
          }
          if (get().isPinned) {
            writePinned(storage, false);
            set({ isPinned: false, peek: "closed", isSwitcherOpen: false });
            return;
          }
          if (get().peek === "closed") openOverlay("keyboard");
          else close();
        },
        setMobileOpen: (isMobileOpen) => {
          if (get().isMobileOpen === isMobileOpen) return;
          set({
            isMobileOpen,
            isSwitcherOpen: isMobileOpen && get().isSwitcherOpen,
          });
        },
        openSwitcher: (layout) => {
          if (layout === "mobile") {
            set({ isMobileOpen: true, isSwitcherOpen: true });
            return;
          }
          if (!get().isPinned && get().peek === "closed") {
            openOverlay("keyboard");
            isPeekOwnedBySwitcher = true;
          }
          set({ isSwitcherOpen: true });
        },
        setSwitcherOpen: (isSwitcherOpen) => {
          if (get().isSwitcherOpen === isSwitcherOpen) return;
          set({ isSwitcherOpen });
          if (isSwitcherOpen) {
            cancelClose();
          } else if (isPeekOwnedBySwitcher) {
            close();
          } else {
            scheduleClose();
          }
        },
        dispose: () => {
          cancelOpen();
          cancelClose();
        },
      },
    };
  });
}
