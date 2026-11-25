import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  useAppShellSidebar,
  useAppShellSidebarActions,
} from "@/src/features/app-shell/contexts/AppShellSidebarProvider";

/**
 * Desktop-only edge control. Sits on the sidebar's right border and toggles
 * expansion. It stays out of the tab order and paints under portaled menus.
 */
export function SidebarBorderToggle() {
  const isExpanded = useAppShellSidebar((state) => state.isExpanded);
  const { setExpanded } = useAppShellSidebarActions();
  const capture = usePostHogClientCapture();

  return (
    <button
      type="button"
      data-sidebar="rail"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      title="Toggle Sidebar"
      onClick={() => {
        capture("app_shell:sidebar_expansion_toggled", {
          isExpanded: !isExpanded,
          source: "rail",
        });
        setExpanded(!isExpanded);
      }}
      className="hover:after:bg-sidebar-border absolute inset-y-0 right-0 hidden w-4 translate-x-1/2 cursor-pointer border-0 bg-transparent p-0 transition-all ease-linear after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] after:content-[''] md:flex"
    />
  );
}
