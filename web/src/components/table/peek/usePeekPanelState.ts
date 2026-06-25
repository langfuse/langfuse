import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import useLocalStorage from "@/src/components/useLocalStorage";

/**
 * State for the desktop peek panel: how wide it is and whether it is fullscreen.
 *
 * State altitudes follow `frontend-large-feature-architecture`:
 * - **width** is a cross-view preference, so it persists in localStorage as a
 *   viewport fraction (resolution-independent) shared by every peek.
 * - **fullscreen** is ephemeral per open session: it lives in React state and
 *   is reset whenever the peek closes (`isOpen` → false). The peek host stays
 *   mounted across open/close, so this reset is explicit — the panel always
 *   reopens as the persisted widget width, never stuck fullscreen.
 * - the **resize drag** is high-frequency transient state, held locally as a
 *   draft and only committed to localStorage on pointer-up — the store is not
 *   written on every move.
 *
 * Fullscreen and width are a single continuum: dragging the handle past
 * `FULLSCREEN_ENTER_FRACTION` toggles fullscreen on (drag to 100% → fullscreen),
 * and dragging back off it returns to a widget width. The header button is just
 * a shortcut for the same toggle; turning it off restores the persisted width.
 */

const STORAGE_KEY = "peekViewWidthFraction";

// Widget width bounds, as a fraction of the viewport width.
export const PEEK_MIN_WIDTH_FRACTION = 0.3;
export const PEEK_MAX_WIDGET_WIDTH_FRACTION = 0.9;
export const PEEK_DEFAULT_WIDTH_FRACTION = 0.5;
// Dragging the handle beyond this fraction of the viewport snaps to fullscreen.
export const PEEK_FULLSCREEN_ENTER_FRACTION = 0.95;
const KEYBOARD_RESIZE_STEP = 0.05;

const clampFraction = (fraction: number) =>
  Math.min(
    PEEK_MAX_WIDGET_WIDTH_FRACTION,
    Math.max(PEEK_MIN_WIDTH_FRACTION, fraction),
  );

type DragState = { fullscreen: boolean; fraction: number };

export type PeekPanelState = {
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

export function usePeekPanelState({
  isOpen,
}: {
  isOpen: boolean;
}): PeekPanelState {
  const [storedFraction, setStoredFraction] = useLocalStorage<number>(
    STORAGE_KEY,
    PEEK_DEFAULT_WIDTH_FRACTION,
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [draftFraction, setDraftFraction] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);

  // Fullscreen is per open session. The peek host stays mounted across
  // open/close, so reset it explicitly when the peek closes (not on item
  // changes during K/J navigation, which keep `isOpen` true).
  useEffect(() => {
    if (!isOpen) setIsFullscreen(false);
  }, [isOpen]);

  const committedFraction = clampFraction(storedFraction);
  const committedFractionRef = useRef(committedFraction);
  committedFractionRef.current = committedFraction;

  const dragStateRef = useRef<DragState | null>(null);
  // Tears down an in-flight drag (listeners + body styles); also run on unmount
  // so a drag interrupted by the peek closing can't leak listeners/cursor.
  const endDragRef = useRef<(() => void) | null>(null);

  const startResize = useCallback(
    (event: ReactPointerEvent) => {
      // Only primary button drags; let the keyboard path handle the rest.
      if (event.button !== 0) return;
      event.preventDefault();

      const onPointerMove = (move: PointerEvent) => {
        const fraction = 1 - move.clientX / window.innerWidth;
        if (fraction >= PEEK_FULLSCREEN_ENTER_FRACTION) {
          dragStateRef.current = {
            fullscreen: true,
            fraction: committedFractionRef.current,
          };
          setIsFullscreen(true);
          setDraftFraction(null);
        } else {
          const clamped = clampFraction(fraction);
          dragStateRef.current = { fullscreen: false, fraction: clamped };
          setIsFullscreen(false);
          setDraftFraction(clamped);
        }
      };

      const teardown = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
        document.body.style.removeProperty("user-select");
        document.body.style.removeProperty("cursor");
        endDragRef.current = null;
      };

      const onPointerUp = () => {
        teardown();
        const final = dragStateRef.current;
        if (final && !final.fullscreen) {
          setStoredFraction(final.fraction);
        }
        dragStateRef.current = null;
        setDraftFraction(null);
        setIsResizing(false);
      };

      endDragRef.current = teardown;
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "ew-resize";
      setIsResizing(true);
    },
    [setStoredFraction],
  );

  // Safety net: if the component unmounts mid-drag, drop the window listeners
  // and restore the body cursor/selection styles.
  useEffect(() => () => endDragRef.current?.(), []);

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      // Left grows the panel (it is docked right), Right shrinks it. Always base
      // off the persisted widget width — even when exiting fullscreen — so a
      // keypress never clobbers the saved preference with the fullscreen ceiling.
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const delta =
          event.key === "ArrowLeft"
            ? KEYBOARD_RESIZE_STEP
            : -KEYBOARD_RESIZE_STEP;
        setIsFullscreen(false);
        setStoredFraction(clampFraction(committedFractionRef.current + delta));
      }
    },
    [setStoredFraction],
  );

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((value) => !value);
  }, []);

  const effectiveFraction = clampFraction(draftFraction ?? committedFraction);
  const panelStyle: CSSProperties = {
    width: isFullscreen ? "100vw" : `${effectiveFraction * 100}vw`,
  };

  return {
    isFullscreen,
    isResizing,
    panelStyle,
    toggleFullscreen,
    resizeHandleProps: {
      role: "separator",
      "aria-orientation": "vertical",
      "aria-label": "Resize peek view",
      tabIndex: 0,
      onPointerDown: startResize,
      onKeyDown,
    },
  };
}
