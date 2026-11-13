import { useEffect, type RefObject } from "react";
import {
  SIDEBAR_EDGE_WIDTH_PX,
  SIDEBAR_TRIGGER_ATTRIBUTE,
} from "@/src/features/app-shell/constants/sidebarDom";
import { useAppShellSidebarActions } from "@/src/features/app-shell/contexts/AppShellSidebarProvider";

/** Tracks the pointer across replacing the docked sidebar with a portaled overlay. */
export function useOverlayHover(panelRef: RefObject<HTMLElement | null>) {
  const { pointerEnterPanel, pointerLeavePanel } = useAppShellSidebarActions();

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    let wasInside: boolean | undefined;
    const updatePointer = (isInside: boolean) => {
      if (isInside === wasInside) return;
      wasInside = isInside;
      if (isInside) pointerEnterPanel();
      else pointerLeavePanel();
    };
    // The pointer may move while the docked DOM is being replaced, before
    // this overlay can receive its first pointer event.
    const frame = requestAnimationFrame(() => {
      if (panel.matches(":hover")) updatePointer(true);
    });
    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      cancelAnimationFrame(frame);
      if (
        event.clientX <= SIDEBAR_EDGE_WIDTH_PX ||
        (event.target instanceof Element &&
          event.target.closest(`[${SIDEBAR_TRIGGER_ATTRIBUTE}]`))
      ) {
        return;
      }
      updatePointer(
        event.target instanceof Node && panel.contains(event.target),
      );
    };
    const handlePointerOut = (event: PointerEvent) => {
      if (event.pointerType === "touch" || event.relatedTarget !== null) return;
      cancelAnimationFrame(frame);
      updatePointer(false);
    };

    document.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    document.addEventListener("pointerout", handlePointerOut, {
      passive: true,
    });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerout", handlePointerOut);
    };
  }, [panelRef, pointerEnterPanel, pointerLeavePanel]);
}
