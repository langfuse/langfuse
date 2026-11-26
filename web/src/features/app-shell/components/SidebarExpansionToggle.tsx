import { PanelLeft } from "@langfuse/icons";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { APP_SIDEBAR_ID } from "@/src/features/app-shell/constants/sidebarDom";
import {
  useAppShellSidebar,
  useAppShellSidebarActions,
} from "@/src/features/app-shell/contexts/AppShellSidebarProvider";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

/** The page header owns desktop expansion, matching the classic navigation. */
export function SidebarExpansionToggle() {
  const isExpanded = useAppShellSidebar((state) => state.isExpanded);
  const { setExpanded } = useAppShellSidebarActions();
  const capture = usePostHogClientCapture();
  const label = isExpanded ? "Collapse sidebar" : "Expand sidebar";
  return (
    <Tooltip
      label={label}
      shortcut={{ keys: ["Mod", "B"] }}
      placement="right"
      hoverableContent={false}
    >
      {({ getTriggerProps }) => (
        <span {...getTriggerProps()} className="inline-flex">
          <IconButton
            icon={PanelLeft}
            label={label}
            size="sm"
            data-sidebar-expansion-control=""
            aria-expanded={isExpanded}
            aria-controls={APP_SIDEBAR_ID}
            onClick={() => {
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
