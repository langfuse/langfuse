import { createStore, type StoreApi } from "zustand/vanilla";

/**
 * Per-mount store for the desktop peek panel: how wide it is and whether it is
 * fullscreen. Follows the local-feature-state pattern from
 * `frontend-large-feature-architecture` — one store instance per peek host,
 * mutated only through named `actions`, the drag workflow lives in
 * `../actions/resizePeekPanel.ts`.
 *
 * State altitudes:
 * - **widthFraction** — cross-view persisted preference. Mirrored to
 *   localStorage (resolution-independent fraction) so every peek shares it.
 * - **isFullscreen** — ephemeral per open session; reset on close via
 *   `resetForVisibility` (the host outlives open/close, so it is explicit).
 * - **draftFraction / isResizing** — high-frequency transient drag state; the
 *   draft is committed to `widthFraction` (and localStorage) only on pointer-up.
 *
 * Width and fullscreen are one continuum: dragging past
 * `PEEK_FULLSCREEN_ENTER_FRACTION` enters fullscreen; dragging back returns to a
 * widget width. The header button is just a shortcut for the same toggle.
 */

const STORAGE_KEY = "peekViewWidthFraction";

// Widget width bounds, as a fraction of the viewport width.
export const PEEK_MIN_WIDTH_FRACTION = 0.3;
export const PEEK_MAX_WIDGET_WIDTH_FRACTION = 0.9;
export const PEEK_DEFAULT_WIDTH_FRACTION = 0.5;
// Dragging the handle beyond this fraction of the viewport snaps to fullscreen.
export const PEEK_FULLSCREEN_ENTER_FRACTION = 0.95;
const KEYBOARD_RESIZE_STEP = 0.05;

export const clampWidthFraction = (fraction: number) =>
  Math.min(
    PEEK_MAX_WIDGET_WIDTH_FRACTION,
    Math.max(PEEK_MIN_WIDTH_FRACTION, fraction),
  );

// Cross-view width preference, persisted as a raw fraction. SSR-safe: reads the
// default on the server and the first client render, the real value after mount.
function readStoredWidthFraction(): number {
  if (typeof window === "undefined") return PEEK_DEFAULT_WIDTH_FRACTION;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return PEEK_DEFAULT_WIDTH_FRACTION;
    const parsed = JSON.parse(raw);
    return typeof parsed === "number"
      ? clampWidthFraction(parsed)
      : PEEK_DEFAULT_WIDTH_FRACTION;
  } catch {
    return PEEK_DEFAULT_WIDTH_FRACTION;
  }
}

function writeStoredWidthFraction(fraction: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fraction));
  } catch {
    // Ignore write failures (private mode, quota) — width is a best-effort pref.
  }
}

export interface PeekPanelStoreState {
  /** Committed widget width (persisted), as a fraction of the viewport. */
  widthFraction: number;
  /** Live width during a drag; null when not dragging. */
  draftFraction: number | null;
  /** Whether the panel fills the viewport. */
  isFullscreen: boolean;
  /** True while the resize handle is being dragged. */
  isResizing: boolean;
  actions: {
    setResizing: (isResizing: boolean) => void;
    /** Abandon an in-flight drag without committing (e.g. peek closed mid-drag). */
    cancelResize: () => void;
    /** Drag below the fullscreen threshold: live widget width. */
    setDraftFraction: (fraction: number) => void;
    /** Drag past the fullscreen threshold. */
    enterFullscreenDraft: () => void;
    /** End a drag on a widget width: persist it and clear the draft. */
    commitWidth: (fraction: number) => void;
    /** Toggle fullscreen; off falls back to the persisted widget width. */
    toggleFullscreen: () => void;
    /** Keyboard resize from the persisted widget width (never the ceiling). */
    nudgeWidth: (direction: "grow" | "shrink") => void;
    /** Reset fullscreen when the peek closes (`isOpen` → false). */
    resetForVisibility: (isOpen: boolean) => void;
  };
}

export type PeekPanelStore = StoreApi<PeekPanelStoreState>;

export function createPeekPanelStore(): PeekPanelStore {
  return createStore<PeekPanelStoreState>((set, get) => ({
    widthFraction: readStoredWidthFraction(),
    draftFraction: null,
    isFullscreen: false,
    isResizing: false,
    actions: {
      setResizing: (isResizing) => set({ isResizing }),
      cancelResize: () => set({ draftFraction: null, isResizing: false }),
      setDraftFraction: (fraction) =>
        set({
          draftFraction: clampWidthFraction(fraction),
          isFullscreen: false,
        }),
      enterFullscreenDraft: () =>
        set({ isFullscreen: true, draftFraction: null }),
      commitWidth: (fraction) => {
        const clamped = clampWidthFraction(fraction);
        writeStoredWidthFraction(clamped);
        set({
          widthFraction: clamped,
          draftFraction: null,
          isFullscreen: false,
        });
      },
      toggleFullscreen: () =>
        set((state) => ({ isFullscreen: !state.isFullscreen })),
      nudgeWidth: (direction) => {
        const delta =
          direction === "grow" ? KEYBOARD_RESIZE_STEP : -KEYBOARD_RESIZE_STEP;
        const next = clampWidthFraction(get().widthFraction + delta);
        writeStoredWidthFraction(next);
        set({ widthFraction: next, draftFraction: null, isFullscreen: false });
      },
      resetForVisibility: (isOpen) => {
        if (!isOpen && get().isFullscreen) set({ isFullscreen: false });
      },
    },
  }));
}

export const selectIsFullscreen = (state: PeekPanelStoreState) =>
  state.isFullscreen;
export const selectIsResizing = (state: PeekPanelStoreState) =>
  state.isResizing;

/**
 * The panel's CSS width as a primitive string (`"50vw"` / `"100vw"`) so the
 * subscription bails out unless the rendered width actually changes.
 */
export const selectWidth = (state: PeekPanelStoreState): string =>
  state.isFullscreen
    ? "100vw"
    : `${clampWidthFraction(state.draftFraction ?? state.widthFraction) * 100}vw`;
