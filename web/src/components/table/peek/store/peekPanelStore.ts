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
 * - **splitWidthFraction / observationWidthFraction** — separately persisted
 *   widget widths. Mode transitions subtract/add the measured navigation width.
 * - **widthFraction** — the active mode's committed width.
 * - **draftFraction / draftExpanded / isResizing** — high-frequency transient
 *   drag state. On pointer-up the drag either commits a widget width or asks the
 *   caller to flip the URL `expanded` flag (see the resize action).
 *
 * Width and expanded are one continuum: dragging the handle past
 * `PEEK_EXPAND_ENTER_FRACTION` previews the expanded width (`draftExpanded`);
 * dragging back returns to a widget width.
 */

const STORAGE_KEY = "peekViewWidthFraction";
const OBSERVATION_STORAGE_KEY = "peekObservationViewWidthFraction";

export type PeekPanelWidthMode = "split" | "observation";

// Widget width bounds, as a fraction of the viewport width.
export const PEEK_MIN_WIDTH_FRACTION = 0.4;
export const PEEK_MAX_WIDGET_WIDTH_FRACTION = 0.9;
export const PEEK_DEFAULT_WIDTH_FRACTION = 0.5;
export const PEEK_OBSERVATION_MIN_WIDTH_PX = 360;
// Dragging the handle beyond this fraction of the viewport previews "expanded".
export const PEEK_EXPAND_ENTER_FRACTION = 0.95;
const KEYBOARD_RESIZE_STEP = 0.05;

// Cap the *default* peek width in px so a bigger screen doesn't mean a
// proportionally bigger peek (LFE-10601): at 50vw the peek balloons on large
// monitors, covering the table and — with a share-based inner split — inflating
// the tree. We keep 50vw on normal laptops (where 50vw < this cap) and only trim
// the fraction on very wide screens, giving a comfortable-but-bounded default
// that still leaves the underlying list navigable. The floor is the drag min so
// the default never lands narrower than the user could drag back to.
export const PEEK_MAX_DEFAULT_WIDTH_PX = 1400;

const clampWidthFraction = (fraction: number) =>
  Math.min(
    PEEK_MAX_WIDGET_WIDTH_FRACTION,
    Math.max(PEEK_MIN_WIDTH_FRACTION, fraction),
  );

export function resolveMinWidthFraction(mode: PeekPanelWidthMode) {
  if (mode === "split") return PEEK_MIN_WIDTH_FRACTION;
  const viewportWidth = typeof window === "undefined" ? 0 : window.innerWidth;
  return viewportWidth > 0
    ? Math.min(
        PEEK_MIN_WIDTH_FRACTION,
        PEEK_OBSERVATION_MIN_WIDTH_PX / viewportWidth,
      )
    : PEEK_MIN_WIDTH_FRACTION;
}

const clampObservationWidthFraction = (fraction: number) => {
  const minFraction = resolveMinWidthFraction("observation");
  return Math.min(
    PEEK_MAX_WIDGET_WIDTH_FRACTION,
    Math.max(minFraction, fraction),
  );
};

const clampWidthForMode = (mode: PeekPanelWidthMode, fraction: number) =>
  mode === "observation"
    ? clampObservationWidthFraction(fraction)
    : clampWidthFraction(fraction);

// Default width when the user has no saved preference. Viewport-aware: the plain
// 50vw fraction, but capped so the resulting px never exceeds
// PEEK_MAX_DEFAULT_WIDTH_PX, then floored at the drag minimum. SSR-safe (returns
// the plain fraction when there's no window).
export function resolveDefaultWidthFraction(): number {
  const vw = typeof window === "undefined" ? 0 : window.innerWidth;
  if (vw <= 0) return PEEK_DEFAULT_WIDTH_FRACTION;
  return Math.max(
    PEEK_MIN_WIDTH_FRACTION,
    Math.min(PEEK_DEFAULT_WIDTH_FRACTION, PEEK_MAX_DEFAULT_WIDTH_PX / vw),
  );
}

// The width fraction that will actually be used to open the peek: the saved
// preference (clamped) if present, else the viewport-aware default. SSR-safe
// (returns the plain default when there's no window). Exported so the inner
// tree↔info split can size its default against the real peek width without
// re-measuring the DOM.
export function resolveEffectiveWidthFraction(): number {
  if (typeof window === "undefined") return PEEK_DEFAULT_WIDTH_FRACTION;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "number") return clampWidthFraction(parsed);
    }
  } catch {
    // Fall through to the default on any read/parse failure.
  }
  return resolveDefaultWidthFraction();
}

function resolveObservationWidthFraction(fallback: number): number {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(OBSERVATION_STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "number") {
        return clampObservationWidthFraction(parsed);
      }
    }
  } catch {
    // Fall through to the split-width fallback on any read/parse failure.
  }
  return clampObservationWidthFraction(fallback);
}

function writeStoredWidthFraction(
  mode: PeekPanelWidthMode,
  fraction: number,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      mode === "observation" ? OBSERVATION_STORAGE_KEY : STORAGE_KEY,
      JSON.stringify(fraction),
    );
  } catch {
    // Ignore write failures (private mode, quota) — width is a best-effort pref.
  }
}

export interface PeekPanelStoreState {
  widthMode: PeekPanelWidthMode;
  /** Committed widget width (persisted), as a fraction of the viewport. */
  widthFraction: number;
  splitWidthFraction: number;
  observationWidthFraction: number;
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
    /** Resize by the measured navigation width when the content mode changes. */
    setWidthMode: (
      mode: PeekPanelWidthMode,
      navigationWidthFraction: number,
      displayedWidthFraction: number,
    ) => void;
    /** Drag past the expand threshold: preview the expanded (max) width. */
    setDraftExpanded: () => void;
    /** End a drag on a widget width: persist it and clear the draft. */
    commitWidth: (fraction: number) => void;
    /** Keyboard resize of the persisted widget width. */
    nudgeWidth: (direction: "grow" | "shrink") => void;
  };
}

export type PeekPanelStore = StoreApi<PeekPanelStoreState>;

export function createPeekPanelStore(
  initialWidthMode: PeekPanelWidthMode = "split",
): PeekPanelStore {
  const splitWidthFraction = resolveEffectiveWidthFraction();
  const observationWidthFraction =
    resolveObservationWidthFraction(splitWidthFraction);
  return createStore<PeekPanelStoreState>((set, get) => ({
    widthMode: initialWidthMode,
    widthFraction:
      initialWidthMode === "observation"
        ? observationWidthFraction
        : splitWidthFraction,
    splitWidthFraction,
    observationWidthFraction,
    draftFraction: null,
    draftExpanded: false,
    isResizing: false,
    actions: {
      setResizing: (isResizing) => set({ isResizing }),
      cancelResize: () =>
        set({ draftFraction: null, draftExpanded: false, isResizing: false }),
      setDraftFraction: (fraction) =>
        set({
          draftFraction: clampWidthForMode(get().widthMode, fraction),
          draftExpanded: false,
        }),
      setWidthMode: (mode, navigationWidthFraction, displayedWidthFraction) => {
        const state = get();
        if (state.widthMode === mode) return;
        const target = clampWidthForMode(
          mode,
          mode === "observation"
            ? displayedWidthFraction - navigationWidthFraction
            : displayedWidthFraction + navigationWidthFraction,
        );
        writeStoredWidthFraction(mode, target);
        set({
          widthMode: mode,
          widthFraction: target,
          ...(mode === "observation"
            ? { observationWidthFraction: target }
            : { splitWidthFraction: target }),
          draftFraction: null,
          draftExpanded: false,
        });
      },
      setDraftExpanded: () => set({ draftExpanded: true, draftFraction: null }),
      commitWidth: (fraction) => {
        const mode = get().widthMode;
        const clamped = clampWidthForMode(mode, fraction);
        writeStoredWidthFraction(mode, clamped);
        set({
          widthFraction: clamped,
          ...(mode === "observation"
            ? { observationWidthFraction: clamped }
            : { splitWidthFraction: clamped }),
          draftFraction: null,
          draftExpanded: false,
        });
      },
      nudgeWidth: (direction) => {
        const delta =
          direction === "grow" ? KEYBOARD_RESIZE_STEP : -KEYBOARD_RESIZE_STEP;
        const mode = get().widthMode;
        const next = clampWidthForMode(mode, get().widthFraction + delta);
        writeStoredWidthFraction(mode, next);
        set({
          widthFraction: next,
          ...(mode === "observation"
            ? { observationWidthFraction: next }
            : { splitWidthFraction: next }),
          draftFraction: null,
          draftExpanded: false,
        });
      },
    },
  }));
}

export const selectIsResizing = (state: PeekPanelStoreState) =>
  state.isResizing;
export const selectDraftExpanded = (state: PeekPanelStoreState) =>
  state.draftExpanded;

/**
 * The active mode's widget width as a primitive CSS string (`"50vw"`) so the
 * subscription bails out unless the rendered width changes. Expanded width is
 * computed by the hook because it depends on live sidebar/navigation offsets.
 */
export const selectWidgetWidth = (state: PeekPanelStoreState): string =>
  `${clampWidthForMode(state.widthMode, state.draftFraction ?? state.widthFraction) * 100}vw`;
