import { useEffect, type RefObject } from "react";
import { SIDEBAR_TRIGGER_ATTRIBUTE } from "@/src/features/app-shell/constants/sidebarDom";

/**
 * Dismisses the floating sidebar on Escape and on a press outside it.
 *
 * Both listeners run in the capture phase so they see the sidebar's own menus
 * (the switcher, the account menu) still open: those swallow the first Escape
 * or outside press themselves, and `dismiss` ignores events while they are.
 */
export function useOverlayDismiss(
  panelRef: RefObject<HTMLElement | null>,
  dismiss: () => void,
) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (panelRef.current?.contains(target)) return;
      if (target.closest(`[${SIDEBAR_TRIGGER_ATTRIBUTE}]`)) return;
      dismiss();
    };

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [panelRef, dismiss]);
}
