import { useEffect } from "react";
import {
  useAppShellSidebarActions,
  useAppShellSidebarStoreApi,
} from "@/src/features/app-shell/contexts/AppShellSidebarProvider";
import { type SidebarLayout } from "@/src/features/app-shell/stores/sidebarStore";

const SIDEBAR_TOGGLE_SHORTCUT_KEY = "b";
/** Mod+B toggles desktop expansion or the mobile menu. */
export function useSidebarShortcuts(layout: SidebarLayout) {
  const { toggleFromShortcut } = useAppShellSidebarActions();
  const store = useAppShellSidebarStoreApi();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey)
        return;
      const key = event.key.toLowerCase();
      if (key === SIDEBAR_TOGGLE_SHORTCUT_KEY) {
        event.preventDefault();
        const { isExpanded, activeMenu } = store.getState();
        if (
          layout === "desktop" &&
          isExpanded &&
          (activeMenu === "organization" ||
            document.activeElement?.closest("[data-sidebar-expanded-only]"))
        ) {
          document
            .querySelector<HTMLElement>("[data-sidebar-expansion-control]")
            ?.focus();
        }
        toggleFromShortcut(layout);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [layout, toggleFromShortcut, store]);
}
