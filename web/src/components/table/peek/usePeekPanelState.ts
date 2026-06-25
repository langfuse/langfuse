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
  selectDraftExpanded,
  selectIsResizing,
  selectWidgetWidth,
} from "@/src/components/table/peek/store/peekPanelStore";
import { beginPeekResize } from "@/src/components/table/peek/actions/resizePeekPanel";

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
  return rect.left < 100 && rect.width > 0 ? Math.round(rect.right) : 0;
}

/**
 * Integration boundary for the peek panel width: owns the per-mount widget-width
 * store, derives the final width (widget vs expanded), and wires drag/keyboard to
 * the store + resize action. Whether the peek is *expanded* is owned by the URL
 * (`isExpanded` in, `onExpandedChange` out) so it is shareable and back-able.
 */
export function usePeekPanelState({
  isOpen,
  isExpanded,
  onExpandedChange,
}: {
  isOpen: boolean;
  isExpanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}): PeekPanelView {
  const [store] = useState(() => createPeekPanelStore());

  const isResizing = useStore(store, selectIsResizing);
  const draftExpanded = useStore(store, selectDraftExpanded);
  const widgetWidth = useStore(store, selectWidgetWidth);

  // During a drag the live draft wins; otherwise the URL flag does.
  const effectiveExpanded = isResizing ? draftExpanded : isExpanded;

  // While expanded, keep the panel at viewport − sidebar (sidebar stays visible).
  // The peek portals into the `modal` layer, outside the sidebar's CSS-var scope,
  // so the offset is measured live (and re-measured on viewport / sidebar resize).
  const [sidebarOffset, setSidebarOffset] = useState(0);
  useEffect(() => {
    if (!effectiveExpanded) return;
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
  }, [effectiveExpanded]);

  const panelStyle: CSSProperties = {
    width: effectiveExpanded ? `calc(100vw - ${sidebarOffset}px)` : widgetWidth,
  };

  // End an in-flight drag (drop listeners, restore body styles, clear drag state)
  // on unmount and whenever the peek closes — the host outlives open/close.
  const dragTeardownRef = useRef<(() => void) | null>(null);
  const endActiveDrag = useCallback(() => {
    dragTeardownRef.current?.();
    dragTeardownRef.current = null;
    store.getState().actions.cancelResize();
  }, [store]);
  useEffect(() => {
    if (!isOpen) endActiveDrag();
  }, [isOpen, endActiveDrag]);
  useEffect(() => endActiveDrag, [endActiveDrag]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      dragTeardownRef.current = beginPeekResize(store, event, onExpandedChange);
    },
    [store, onExpandedChange],
  );

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      // Left grows the panel (it is docked right), Right shrinks it; either
      // collapses out of the expanded view onto a widget width.
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        onExpandedChange(false);
        store
          .getState()
          .actions.nudgeWidth(event.key === "ArrowLeft" ? "grow" : "shrink");
      }
    },
    [store, onExpandedChange],
  );

  const toggleExpanded = useCallback(
    () => onExpandedChange(!isExpanded),
    [isExpanded, onExpandedChange],
  );

  return {
    isExpanded,
    isResizing,
    panelStyle,
    toggleExpanded,
    resizeHandleProps: {
      role: "separator",
      "aria-orientation": "vertical",
      "aria-label": "Resize peek view",
      tabIndex: 0,
      onPointerDown,
      onKeyDown,
    },
  };
}
