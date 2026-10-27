import { useEffect } from "react";
import { SIDEBAR_EDGE_WIDTH_PX } from "@/src/features/app-shell/constants/sidebarDom";
import { useAppShellSidebarActions } from "@/src/features/app-shell/contexts/AppShellSidebarProvider";

/**
 * Treats the left screen edge as the hidden sidebar's hover trigger. It is a
 * passive document listener rather than an invisible strip, so nothing at the
 * page's left edge loses its clicks. Touch input has no hover and is ignored.
 */
export function useSidebarEdgeHover(isEnabled: boolean) {
  const { pointerEnterTrigger, pointerLeaveTrigger } =
    useAppShellSidebarActions();

  useEffect(() => {
    if (!isEnabled) return;
    let isAtEdge = false;

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const isNowAtEdge = event.clientX <= SIDEBAR_EDGE_WIDTH_PX;
      if (isNowAtEdge === isAtEdge) return;
      isAtEdge = isNowAtEdge;
      if (isAtEdge) pointerEnterTrigger();
      else pointerLeaveTrigger();
    };
    // Leaving the window through the edge must not leave a pending open behind.
    const handlePointerOut = (event: PointerEvent) => {
      if (event.relatedTarget !== null || !isAtEdge) return;
      isAtEdge = false;
      pointerLeaveTrigger();
    };

    document.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    document.addEventListener("pointerout", handlePointerOut, {
      passive: true,
    });
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerout", handlePointerOut);
      if (isAtEdge) pointerLeaveTrigger();
    };
  }, [isEnabled, pointerEnterTrigger, pointerLeaveTrigger]);
}
