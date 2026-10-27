import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keyboard-opened overlays take focus (the current page's entry, else the
 * first control) and hand it back to where it came from when they close.
 * Pointer-opened overlays leave focus alone so hovering never steals it.
 */
export function useOverlayFocus(
  panelRef: RefObject<HTMLElement | null>,
  shouldTakeFocus: boolean,
) {
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const returnTarget =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    if (shouldTakeFocus) {
      const initial =
        panel.querySelector<HTMLElement>('[aria-current="page"]') ??
        panel.querySelector<HTMLElement>(FOCUSABLE);
      initial?.focus({ preventScroll: true });
    }

    return () => {
      // Only restore focus that the closing panel would otherwise drop on the
      // body; focus the user already moved elsewhere stays where it is.
      const active = document.activeElement;
      const focusWasInPanel =
        active === null || active === document.body || panel.contains(active);
      if (focusWasInPanel && returnTarget?.isConnected) {
        returnTarget.focus({ preventScroll: true });
      }
    };
  }, [panelRef, shouldTakeFocus]);
}
