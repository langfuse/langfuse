import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useStore } from "zustand";
import {
  createPeekPanelStore,
  PEEK_EXPAND_ENTER_FRACTION,
  PEEK_MIN_WIDTH_FRACTION,
  selectDraftExpanded,
  selectIsResizing,
  selectWidgetWidth,
} from "@/src/components/table/peek/store/peekPanelStore";
import { beginPeekResize } from "@/src/components/table/peek/actions/resizePeekPanel";

// A burst of keyboard nudges is one resize action — trailing-debounce it into
// a single onResized notification.
const KEYBOARD_RESIZE_NOTIFY_DEBOUNCE_MS = 1000;

export type PeekPanelView = {
  /** Whether the panel is expanded to max width (viewport − sidebar). */
  isExpanded: boolean;
  /** True while the user is dragging the resize handle. */
  isResizing: boolean;
  /** Inline style (width) for the docked panel. */
  panelStyle: CSSProperties;
  /** Toggle the expanded view (writes the URL via `onExpandedChange`). */
  toggleExpanded: () => void;
  /** Props to spread onto the left-edge resize handle. */
  resizeHandleProps: {
    role: "separator";
    "aria-orientation": "vertical";
    "aria-label": string;
    "aria-valuemin": number;
    "aria-valuemax": number;
    "aria-valuenow": number;
    tabIndex: 0;
    onPointerDown: (event: ReactPointerEvent) => void;
    onKeyDown: (event: ReactKeyboardEvent) => void;
  };
};

/** Right edge of the (left-docked) sidebar = its current width, in px. */
function readSidebarOffsetPx(): number {
  if (typeof document === "undefined") return 0;
  const el = document.querySelector('[data-sidebar="sidebar"]');
  if (!el) return 0;
  const rect = el.getBoundingClientRect();
  // Guard against the off-canvas mobile sidebar (rendered in a Sheet): only a
  // left-docked, on-screen sidebar contributes an offset.
  return rect.left < 100 && rect.width > 0 ? Math.round(rect.right) : 0;
}

/**
 * Integration boundary for the peek panel width: owns the per-mount widget-width
 * store, derives the final width (widget vs expanded), and wires drag/keyboard
 * to the store + resize action. Whether the peek is *expanded* is owned by the
 * URL (`isExpanded` in, `onExpandedChange` out) so it is shareable + reloadable.
 *
 * `pendingExpanded` bridges the async gap: when a drag/button commits a new
 * expanded value we hold it locally until the URL (`isExpanded`) catches up, so
 * the panel never flashes the old width for a frame on release.
 */
export function usePeekPanelState({
  isOpen,
  isExpanded,
  onExpandedChange,
  onResized,
}: {
  isOpen: boolean;
  isExpanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /**
   * Notified once per user resize gesture that lands on a widget width — a
   * completed drag, or a burst of keyboard nudges (debounced). The host's
   * analytics seam; expand-commits and cancelled drags don't notify.
   */
  onResized?: (widthFraction: number, trigger: "drag" | "keyboard") => void;
}): PeekPanelView {
  const [store] = useState(() => createPeekPanelStore());

  const isResizing = useStore(store, selectIsResizing);
  const draftExpanded = useStore(store, selectDraftExpanded);
  const widgetWidth = useStore(store, selectWidgetWidth);

  // Keep the latest callback in a ref so drag/keyboard closures never go
  // stale and the memoized handlers don't churn on a new callback identity.
  const onResizedRef = useRef(onResized);
  useEffect(() => {
    onResizedRef.current = onResized;
  }, [onResized]);
  const keyboardResizeNotifyTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  // Cancelled whenever another gesture takes over (a drag starts) or the peek
  // closes — a pending keyboard notification must not fire with the new
  // gesture's width (mislabeled trigger) or after dismissal.
  const cancelKeyboardResizeNotify = useCallback(() => {
    if (keyboardResizeNotifyTimeoutRef.current) {
      clearTimeout(keyboardResizeNotifyTimeoutRef.current);
      keyboardResizeNotifyTimeoutRef.current = null;
    }
  }, []);
  useEffect(() => cancelKeyboardResizeNotify, [cancelKeyboardResizeNotify]);

  // Locally-committed expanded value, held until the URL reflects it.
  const [pendingExpanded, setPendingExpanded] = useState<boolean | null>(null);
  useEffect(() => setPendingExpanded(null), [isExpanded]);

  // During a drag the live draft wins; otherwise the just-committed value, then
  // the URL flag.
  const effectiveExpanded = isResizing
    ? draftExpanded
    : (pendingExpanded ?? isExpanded);

  const commitExpanded = useCallback(
    (expanded: boolean) => {
      setPendingExpanded(expanded);
      onExpandedChange(expanded);
    },
    [onExpandedChange],
  );

  // While expanded the panel width is `calc(100vw - sidebarOffset)` so the
  // sidebar stays visible. The peek portals into the `modal` layer, outside the
  // sidebar's CSS-var scope, so the offset is measured from the DOM. Seeded
  // synchronously on mount (lazy initializer, SSR-safe via the guard in
  // readSidebarOffsetPx) so the first expanded paint already uses the real
  // offset rather than calc(100vw - 0px) = full width for one frame.
  const [sidebarOffset, setSidebarOffset] = useState(() =>
    readSidebarOffsetPx(),
  );
  // Track the sidebar continuously — NOT only while expanded — so a sidebar
  // toggle/resize that happens while the peek is collapsed is still reflected
  // by the next expand (no stale-offset flash). The observer is idle unless the
  // sidebar actually resizes, and setSidebarOffset bails on an unchanged value.
  useEffect(() => {
    const measure = () => setSidebarOffset(readSidebarOffsetPx());
    measure();
    window.addEventListener("resize", measure);
    const sidebar = document.querySelector('[data-sidebar="sidebar"]');
    const observer =
      sidebar && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measure)
        : null;
    if (sidebar) observer?.observe(sidebar);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, []);

  // Both expanded and widget widths are capped at the sidebar edge
  // (`viewport − sidebar`). Capping the widget too means dragging to the max
  // lands on the exact same width as expanded — no snap-back jump — and the
  // panel never paints over the sidebar even if a stored fraction is large.
  const maxWidth = `calc(100vw - ${sidebarOffset}px)`;
  const panelStyle: CSSProperties = {
    width: effectiveExpanded ? maxWidth : `min(${widgetWidth}, ${maxWidth})`,
  };

  // End an in-flight drag (drop listeners, restore body styles, clear drag
  // state) on unmount and whenever the peek closes — the host outlives
  // open/close.
  const dragTeardownRef = useRef<(() => void) | null>(null);
  const endActiveDrag = useCallback(() => {
    dragTeardownRef.current?.();
    dragTeardownRef.current = null;
    store.getState().actions.cancelResize();
  }, [store]);
  useEffect(() => {
    if (!isOpen) {
      endActiveDrag();
      cancelKeyboardResizeNotify();
    }
  }, [isOpen, endActiveDrag, cancelKeyboardResizeNotify]);
  useEffect(() => endActiveDrag, [endActiveDrag]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      cancelKeyboardResizeNotify();
      // The drag flips to expanded at the sidebar edge (viewport − sidebar),
      // clamped to the widget bounds, so it can't overshoot onto the sidebar.
      const vw = typeof window === "undefined" ? 0 : window.innerWidth;
      const expandAtFraction =
        vw > 0
          ? Math.min(
              PEEK_EXPAND_ENTER_FRACTION,
              Math.max(PEEK_MIN_WIDTH_FRACTION, (vw - sidebarOffset) / vw),
            )
          : PEEK_EXPAND_ENTER_FRACTION;
      dragTeardownRef.current = beginPeekResize(
        store,
        event,
        commitExpanded,
        expandAtFraction,
        effectiveExpanded,
        (fraction) => onResizedRef.current?.(fraction, "drag"),
      );
    },
    [
      store,
      commitExpanded,
      sidebarOffset,
      effectiveExpanded,
      cancelKeyboardResizeNotify,
    ],
  );

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      // Left grows the panel (it is docked right), Right shrinks it; either
      // collapses out of the expanded view onto a widget width.
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        commitExpanded(false);
        const before = store.getState().widthFraction;
        store
          .getState()
          .actions.nudgeWidth(event.key === "ArrowLeft" ? "grow" : "shrink");
        // Nudging against the min/max clamp changes nothing — notify nothing.
        if (store.getState().widthFraction === before) return;
        cancelKeyboardResizeNotify();
        keyboardResizeNotifyTimeoutRef.current = setTimeout(() => {
          keyboardResizeNotifyTimeoutRef.current = null;
          onResizedRef.current?.(store.getState().widthFraction, "keyboard");
        }, KEYBOARD_RESIZE_NOTIFY_DEBOUNCE_MS);
      }
    },
    [store, commitExpanded, cancelKeyboardResizeNotify],
  );

  // Toggle relative to what the button currently SHOWS (effectiveExpanded),
  // not the URL-derived isExpanded — during the pending window after a commit
  // the two differ for a render, and reading isExpanded there would make a
  // rapid second click re-commit the same value (a no-op) instead of toggling.
  const toggleExpanded = useCallback(
    () => commitExpanded(!effectiveExpanded),
    [effectiveExpanded, commitExpanded],
  );

  const widthPercent = effectiveExpanded
    ? 100
    : Math.round(parseFloat(widgetWidth));

  return {
    isExpanded: effectiveExpanded,
    isResizing,
    panelStyle,
    toggleExpanded,
    resizeHandleProps: {
      role: "separator",
      "aria-orientation": "vertical",
      "aria-label": "Resize peek view",
      "aria-valuemin": Math.round(PEEK_MIN_WIDTH_FRACTION * 100),
      "aria-valuemax": 100,
      "aria-valuenow": widthPercent,
      tabIndex: 0,
      onPointerDown,
      onKeyDown,
    },
  };
}
