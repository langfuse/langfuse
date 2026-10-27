import { PanelLeftClose, Pin } from "@langfuse/icons";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import {
  useAppShellSidebar,
  useAppShellSidebarActions,
} from "@/src/features/app-shell/contexts/AppShellSidebarProvider";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";

/** Docks the floating sidebar, or hides a docked one so it only opens on hover. */
export function SidebarPinToggle() {
  const isPinned = useAppShellSidebar((state) => state.isPinned);
  const { setPinned } = useAppShellSidebarActions();
  const capture = usePostHogClientCapture();
  const label = isPinned ? "Hide sidebar" : "Keep sidebar open";

  return (
    <Tooltip
      label={label}
      shortcut={isPinned ? { keys: ["Mod", "B"] } : undefined}
      placement="bottom"
      hoverableContent={false}
    >
      {({ getTriggerProps }) => (
        <span {...getTriggerProps()} className="inline-flex">
          <IconButton
            icon={isPinned ? PanelLeftClose : Pin}
            label={label}
            size="sm"
            aria-pressed={isPinned}
            onClick={() => {
              capture("app_shell:sidebar_pin_toggled", {
                isPinned: !isPinned,
                source: "button",
              });
              setPinned(!isPinned);
            }}
          />
        </span>
      )}
    </Tooltip>
  );
}
