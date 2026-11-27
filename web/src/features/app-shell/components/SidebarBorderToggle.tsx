import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  useAppShellSidebar,
  useAppShellSidebarActions,
} from "@/src/features/app-shell/contexts/AppShellSidebarProvider";
import { cn } from "@/src/utils/tailwind";
import motion from "./sidebarMotion.module.css";

/**
 * Desktop-only edge control. Sits on the sidebar's right border and toggles
 * expansion. It stays out of the tab order and paints under portaled menus.
 */
export function SidebarBorderToggle() {
  const isExpanded = useAppShellSidebar((state) => state.isExpanded);
  const { setExpanded } = useAppShellSidebarActions();
  const capture = usePostHogClientCapture();
  const label = isExpanded ? "Collapse sidebar" : "Expand sidebar";

  return (
    <button
      type="button"
      data-sidebar="rail"
      aria-label={label}
      tabIndex={-1}
      title={label}
      onClick={() => {
        capture("app_shell:sidebar_expansion_toggled", {
          isExpanded: !isExpanded,
          source: "rail",
        });
        setExpanded(!isExpanded);
      }}
      className={cn(
        motion.rail,
        "hidden md:block",
        isExpanded ? "cursor-w-resize" : "cursor-e-resize",
      )}
    />
  );
}
