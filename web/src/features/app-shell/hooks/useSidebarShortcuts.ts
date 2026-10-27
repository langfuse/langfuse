import { useEffect } from "react";
import { useAppShellSidebarActions } from "@/src/features/app-shell/contexts/AppShellSidebarProvider";
import { type SidebarLayout } from "@/src/features/app-shell/stores/sidebarStore";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";

export const SIDEBAR_TOGGLE_SHORTCUT_KEY = "b";
export const WORKSPACE_SWITCHER_SHORTCUT_KEY = "o";

/**
 * App-wide shortcuts of the shell: Mod+B shows or hides the sidebar, Mod+O
 * opens the project and organization switcher (revealing the sidebar first if
 * it is hidden).
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
