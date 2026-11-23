import { useEffect } from "react";
import {
  useAppShellSidebarActions,
  useAppShellSidebarStoreApi,
} from "@/src/features/app-shell/contexts/AppShellSidebarProvider";
import { type SidebarLayout } from "@/src/features/app-shell/stores/sidebarStore";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

const SIDEBAR_TOGGLE_SHORTCUT_KEY = "b";
const WORKSPACE_SWITCHER_SHORTCUT_KEY = "o";

/**
 * Mod+B toggles desktop expansion or the mobile menu. Mod+O opens the
 * workspace switcher without expanding the desktop rail.
 */
export function useSidebarShortcuts(layout: SidebarLayout) {
  const { toggleFromShortcut, openSwitcher } = useAppShellSidebarActions();
  const store = useAppShellSidebarStoreApi();
  const capture = usePostHogClientCapture();

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
      } else if (key === WORKSPACE_SWITCHER_SHORTCUT_KEY) {
        event.preventDefault();
        if (store.getState().activeMenu === "organization") {
          document
            .querySelector<HTMLElement>("[data-sidebar-workspace-control]")
            ?.focus();
        }
        capture("app_shell:workspace_switcher_opened", { source: "shortcut" });
        openSwitcher(layout);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [layout, toggleFromShortcut, openSwitcher, capture, store]);
}
