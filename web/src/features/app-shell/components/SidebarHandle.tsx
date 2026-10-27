import { useRef } from "react";
import { PanelLeftOpen } from "@langfuse/icons";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { APP_SIDEBAR_ID } from "@/src/features/app-shell/constants/sidebarDom";
import {
  useAppShellSidebar,
  useAppShellSidebarActions,
} from "@/src/features/app-shell/contexts/AppShellSidebarProvider";

/**
 * Page-header control for the hidden sidebar. Hovering it opens the sidebar
 * like the screen edge does; a tap or the keyboard opens it until dismissed.
 * Pinning happens from inside the sidebar. Hidden while the sidebar is pinned.
 */
export function SidebarHandle() {
  const isPinned = useAppShellSidebar((state) => state.isPinned);
  const isOpen = useAppShellSidebar((state) => state.peek !== "closed");
  const { pointerEnterTrigger, pointerLeaveTrigger, openOverlay } =
    useAppShellSidebarActions();
  const lastPointerType = useRef<string>("mouse");

  return (
    <IconButton
      icon={PanelLeftOpen}
      label="Show sidebar"
      size="sm"
      hidden={isPinned}
      aria-expanded={isOpen}
      aria-controls={APP_SIDEBAR_ID}
      data-sidebar-trigger=""
      onPointerDown={(event) => {
        lastPointerType.current = event.pointerType;
      }}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") pointerEnterTrigger();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") pointerLeaveTrigger();
      }}
      onClick={(event) => {
        // `detail` is 0 for keyboard activation.
        const isSticky =
          event.detail === 0 || lastPointerType.current === "touch";
        openOverlay(isSticky ? "keyboard" : "hover");
      }}
    />
  );
}
