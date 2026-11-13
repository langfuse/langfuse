import { useEffect } from "react";
import { useAppShellSidebarActions } from "@/src/features/app-shell/contexts/AppShellSidebarProvider";
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
  const capture = usePostHogClientCapture();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey)
        return;
      const key = event.key.toLowerCase();
      if (key === SIDEBAR_TOGGLE_SHORTCUT_KEY) {
        event.preventDefault();
        if (
          layout === "desktop" &&
          document.activeElement?.closest("[data-sidebar-expanded-only]")
        ) {
          document
            .querySelector<HTMLElement>("[data-sidebar-expansion-control]")
            ?.focus();
        }
        toggleFromShortcut(layout);
      } else if (key === WORKSPACE_SWITCHER_SHORTCUT_KEY) {
        event.preventDefault();
        capture("app_shell:workspace_switcher_opened", { source: "shortcut" });
        openSwitcher(layout);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [layout, toggleFromShortcut, openSwitcher, capture]);
}
