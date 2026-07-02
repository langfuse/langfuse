import { createStore, type StoreApi } from "zustand/vanilla";

/**
 * Per-mount store for the desktop peek panel's WIDTH. Follows the
 * local-feature-state pattern from `frontend-large-feature-architecture` — one
 * store instance per peek host, mutated only through named `actions`; the drag
 * workflow lives in `../actions/resizePeekPanel.ts`.
 *
 * Whether the peek is *expanded* (max width) is NOT stored here — it lives in
 * the URL (`peekView=expanded`, owned by `usePeekNavigation`) so it is shareable
 * and survives back/forward. This store only owns the widget width and the
 * transient drag state:
 * - **widthFraction** — cross-view persisted widget width (localStorage, a
 *   resolution-independent viewport fraction).
 * - **draftFraction / draftExpanded / isResizing** — high-frequency transient
 *   drag state. On pointer-up the drag either commits a widget width or asks the
 *   caller to flip the URL `expanded` flag (see the resize action).
 *
 * Width and expanded are one continuum: dragging the handle past
 * `PEEK_EXPAND_ENTER_FRACTION` previews the expanded width (`draftExpanded`);
 * dragging back returns to a widget width.
 */

const STORAGE_KEY = "peekViewWidthFraction";

// Widget width bounds, as a fraction of the viewport width.
export const PEEK_MIN_WIDTH_FRACTION = 0.4;
export const PEEK_MAX_WIDGET_WIDTH_FRACTION = 0.9;
export const PEEK_DEFAULT_WIDTH_FRACTION = 0.5;
// Dragging the handle beyond this fraction of the viewport previews "expanded".
export const PEEK_EXPAND_ENTER_FRACTION = 0.95;
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
  /** Live widget width during a drag; null when not dragging or expanded. */
  draftFraction: number | null;
  /** True while a drag is previewing the expanded (max) width. */
  draftExpanded: boolean;
  /** True while the resize handle is being dragged. */
  isResizing: boolean;
  actions: {
    setResizing: (isResizing: boolean) => void;
    /** Abandon an in-flight drag without committing (e.g. peek closed mid-drag). */
    cancelResize: () => void;
    /** Drag below the expand threshold: live widget width. */
    setDraftFraction: (fraction: number) => void;
    /** Drag past the expand threshold: preview the expanded (max) width. */
    setDraftExpanded: () => void;
    /** End a drag on a widget width: persist it and clear the draft. */
    commitWidth: (fraction: number) => void;
    /** Keyboard resize of the persisted widget width. */
    nudgeWidth: (direction: "grow" | "shrink") => void;
  };
}

export type PeekPanelStore = StoreApi<PeekPanelStoreState>;

export function createPeekPanelStore(): PeekPanelStore {
  return createStore<PeekPanelStoreState>((set, get) => ({
    widthFraction: readStoredWidthFraction(),
    draftFraction: null,
    draftExpanded: false,
    isResizing: false,
    actions: {
      setResizing: (isResizing) => set({ isResizing }),
      cancelResize: () =>
        set({ draftFraction: null, draftExpanded: false, isResizing: false }),
      setDraftFraction: (fraction) =>
        set({
          draftFraction: clampWidthFraction(fraction),
          draftExpanded: false,
        }),
      setDraftExpanded: () => set({ draftExpanded: true, draftFraction: null }),
      commitWidth: (fraction) => {
        const clamped = clampWidthFraction(fraction);
        writeStoredWidthFraction(clamped);
        set({
          widthFraction: clamped,
          draftFraction: null,
          draftExpanded: false,
        });
      },
      nudgeWidth: (direction) => {
        const delta =
          direction === "grow" ? KEYBOARD_RESIZE_STEP : -KEYBOARD_RESIZE_STEP;
        const next = clampWidthFraction(get().widthFraction + delta);
        writeStoredWidthFraction(next);
        set({ widthFraction: next, draftFraction: null, draftExpanded: false });
      },
    },
  }));
}

export const selectIsResizing = (state: PeekPanelStoreState) =>
  state.isResizing;
export const selectDraftExpanded = (state: PeekPanelStoreState) =>
  state.draftExpanded;

/**
 * The widget width as a primitive CSS string (`"50vw"`) so the subscription
 * bails out unless the rendered width changes. The expanded (max) width is
 * computed by the hook, since it depends on the live sidebar offset.
 */
export const selectWidgetWidth = (state: PeekPanelStoreState): string =>
  `${clampWidthFraction(state.draftFraction ?? state.widthFraction) * 100}vw`;
