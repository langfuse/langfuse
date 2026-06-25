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
  selectIsFullscreen,
  selectIsResizing,
  selectWidth,
} from "@/src/components/table/peek/store/peekPanelStore";
import { beginPeekResize } from "@/src/components/table/peek/actions/resizePeekPanel";

export type PeekPanelView = {
  /** Whether the panel currently fills the viewport. */
  isFullscreen: boolean;
  /** True while the user is dragging the resize handle. */
  isResizing: boolean;
  /** Inline style (width) for the docked panel. */
  panelStyle: CSSProperties;
  /** Toggle fullscreen on/off; off restores the persisted widget width. */
  toggleFullscreen: () => void;
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

/**
 * Integration boundary for the peek panel: owns the per-mount store (created
 * once via lazy `useState`), subscribes to the slices the chrome needs, and
 * exposes thin callbacks that delegate to store actions / the resize workflow.
 * All state and logic live in the store and `actions/*` — this hook only wires
 * them to the view and to lifecycle effects.
 */
export function usePeekPanelState({
  isOpen,
}: {
  isOpen: boolean;
}): PeekPanelView {
  const [store] = useState(() => createPeekPanelStore());

  const isFullscreen = useStore(store, selectIsFullscreen);
  const isResizing = useStore(store, selectIsResizing);
  const width = useStore(store, selectWidth);
  const toggleFullscreen = useStore(
    store,
    (state) => state.actions.toggleFullscreen,
  );

  // Fullscreen is per open session; the host outlives open/close, so reset it
  // explicitly when the peek closes (not on item changes during K/J nav).
  useEffect(() => {
    store.getState().actions.resetForVisibility(isOpen);
  }, [store, isOpen]);

  // End an in-flight drag if the component unmounts mid-drag (drops window
  // listeners, restores body cursor/selection styles).
  const dragTeardownRef = useRef<(() => void) | null>(null);
  useEffect(() => () => dragTeardownRef.current?.(), []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      dragTeardownRef.current = beginPeekResize(store, event);
    },
    [store],
  );

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      // Left grows the panel (it is docked right), Right shrinks it.
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        store.getState().actions.nudgeWidth("grow");
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        store.getState().actions.nudgeWidth("shrink");
      }
    },
    [store],
  );

  return {
    isFullscreen,
    isResizing,
    panelStyle: { width },
    toggleFullscreen,
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
