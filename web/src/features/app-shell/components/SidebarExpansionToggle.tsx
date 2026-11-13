import { PanelLeft, X } from "@langfuse/icons";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { APP_SIDEBAR_ID } from "@/src/features/app-shell/constants/sidebarDom";
import {
  useAppShellSidebar,
  useAppShellSidebarActions,
} from "@/src/features/app-shell/contexts/AppShellSidebarProvider";
import { useSidebarSurface } from "@/src/features/app-shell/contexts/SidebarSurfaceProvider";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

/** The expansion control stays in the sidebar header in both desktop layouts. */
export function SidebarExpansionToggle() {
  const isExpanded = useAppShellSidebar((state) => state.isExpanded);
  const { setExpanded, setMobileOpen } = useAppShellSidebarActions();
  const isMobile = useSidebarSurface() === "mobile";
  const capture = usePostHogClientCapture();
  const desktopLabel = isExpanded ? "Collapse sidebar" : "Expand sidebar";
  const label = isMobile ? "Close menu" : desktopLabel;
  return (
    <Tooltip
      label={label}
      shortcut={isMobile ? undefined : { keys: ["Mod", "B"] }}
      placement="right"
      hoverableContent={false}
    >
      {({ getTriggerProps }) => (
        <span {...getTriggerProps()} className="inline-flex">
          <IconButton
            icon={isMobile ? X : PanelLeft}
            label={label}
            size="sm"
            data-sidebar-expansion-control=""
            aria-expanded={isMobile ? true : isExpanded}
            aria-controls={APP_SIDEBAR_ID}
            onClick={() => {
              if (isMobile) {
                setMobileOpen(false);
                return;
              }
              capture("app_shell:sidebar_expansion_toggled", {
                isExpanded: !isExpanded,
                source: "button",
              });
              setExpanded(!isExpanded);
            }}
          />
        </span>
      )}
    </Tooltip>
  );
}
