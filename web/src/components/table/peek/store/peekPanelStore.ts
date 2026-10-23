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
 * - **widthFraction** — persisted widget width (localStorage, a
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

// Cap the *default* peek width in px so a bigger screen doesn't mean a
// proportionally bigger peek (LFE-10601): at 50vw the peek balloons on large
// monitors, covering the table and — with a share-based inner split — inflating
// the tree. We keep 50vw on normal laptops (where 50vw < this cap) and only trim
// the fraction on very wide screens, giving a comfortable-but-bounded default
// that still leaves the underlying list navigable. The floor is the drag min so
// the default never lands narrower than the user could drag back to.
export const PEEK_MAX_DEFAULT_WIDTH_PX = 1400;

const clampWidthFraction = (
  fraction: number,
  minimum = PEEK_MIN_WIDTH_FRACTION,
  maximum = PEEK_MAX_WIDGET_WIDTH_FRACTION,
) => Math.min(maximum, Math.max(minimum, fraction));

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

function readStoredWidthFraction(
  storageKey: string,
  allowLayoutWidths = false,
): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "number" && Number.isFinite(parsed)) {
        if (allowLayoutWidths) return parsed > 0 ? Math.min(1, parsed) : null;
        return clampWidthFraction(parsed);
      }
    }
  } catch {
    // Fall through to the default on any read/parse failure.
  }
  return null;
}

/** Resolve the host's visible width; hosts without sizing use the shared preference. */
export function resolveEffectiveWidthFraction({
  widgetWidthFraction,
  isExpanded = false,
  sidebarOffsetPx = 0,
}: {
  widgetWidthFraction?: number;
  isExpanded?: boolean;
  sidebarOffsetPx?: number;
} = {}): number {
  const viewportWidth = typeof window === "undefined" ? 0 : window.innerWidth;
  const maximumFraction =
    viewportWidth > 0
      ? Math.max(0, (viewportWidth - sidebarOffsetPx) / viewportWidth)
      : 1;
  if (isExpanded) return maximumFraction;
  const widgetFraction =
    widgetWidthFraction ??
    readStoredWidthFraction(STORAGE_KEY) ??
    resolveDefaultWidthFraction();
  return Math.min(widgetFraction, maximumFraction);
}

function writeStoredWidthFraction(storageKey: string, fraction: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(fraction));
  } catch {
    // Ignore write failures (private mode, quota) — width is a best-effort pref.
  }
}

export interface PeekPanelStoreState {
  /** Widget width, as a fraction of the viewport. Explicit resizes are persisted. */
  widthFraction: number;
  /** Resize bounds include a host's layout default and any saved preference. */
  minimumWidthFraction: number;
  maximumWidgetWidthFraction: number;
  /** A saved or explicitly resized width takes precedence over a layout default. */
  hasCustomWidth: boolean;
  /** Live widget width during a drag; null when not dragging or expanded. */
  draftFraction: number | null;
  /** True while a drag is previewing the expanded (max) width. */
  draftExpanded: boolean;
  /** True while the resize handle is being dragged. */
  isResizing: boolean;
  actions: {
    /** Fit a host's layout until the user chooses a width. Never persisted. */
    setDefaultWidth: (fraction: number) => void;
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

export function createPeekPanelStore({
  widthStorageKey = STORAGE_KEY,
  allowLayoutWidths = false,
}: {
  widthStorageKey?: string;
  /** Retain saved widths outside the shared bounds for a host with layout sizing. */
  allowLayoutWidths?: boolean;
} = {}): PeekPanelStore {
  const storedWidth = readStoredWidthFraction(
    widthStorageKey,
    allowLayoutWidths,
  );
  return createStore<PeekPanelStoreState>((set, get) => ({
    widthFraction: storedWidth ?? resolveDefaultWidthFraction(),
    minimumWidthFraction: Math.min(
      PEEK_MIN_WIDTH_FRACTION,
      storedWidth ?? PEEK_MIN_WIDTH_FRACTION,
    ),
    maximumWidgetWidthFraction: Math.max(
      PEEK_MAX_WIDGET_WIDTH_FRACTION,
      storedWidth ?? PEEK_MAX_WIDGET_WIDTH_FRACTION,
    ),
    hasCustomWidth: storedWidth !== null,
    draftFraction: null,
    draftExpanded: false,
    isResizing: false,
    actions: {
      setDefaultWidth: (fraction) => {
        if (get().isResizing || !Number.isFinite(fraction) || fraction <= 0)
          return;
        const width = Math.min(1, fraction);
        const customWidth = get().hasCustomWidth ? get().widthFraction : width;
        set({
          minimumWidthFraction: Math.min(
            PEEK_MIN_WIDTH_FRACTION,
            width,
            customWidth,
          ),
          maximumWidgetWidthFraction: Math.max(
            PEEK_MAX_WIDGET_WIDTH_FRACTION,
            width,
            customWidth,
          ),
          ...(!get().hasCustomWidth ? { widthFraction: width } : {}),
        });
      },
      setResizing: (isResizing) => set({ isResizing }),
      cancelResize: () =>
        set({ draftFraction: null, draftExpanded: false, isResizing: false }),
      setDraftFraction: (fraction) =>
        set({
          draftFraction: clampWidthFraction(
            fraction,
            get().minimumWidthFraction,
            get().maximumWidgetWidthFraction,
          ),
          draftExpanded: false,
        }),
      setDraftExpanded: () => set({ draftExpanded: true, draftFraction: null }),
      commitWidth: (fraction) => {
        const clamped = clampWidthFraction(
          fraction,
          get().minimumWidthFraction,
          get().maximumWidgetWidthFraction,
        );
        writeStoredWidthFraction(widthStorageKey, clamped);
        set({
          widthFraction: clamped,
          hasCustomWidth: true,
          draftFraction: null,
          draftExpanded: false,
        });
      },
      nudgeWidth: (direction) => {
        const delta =
          direction === "grow" ? KEYBOARD_RESIZE_STEP : -KEYBOARD_RESIZE_STEP;
        const next = clampWidthFraction(
          get().widthFraction + delta,
          get().minimumWidthFraction,
          get().maximumWidgetWidthFraction,
        );
        writeStoredWidthFraction(widthStorageKey, next);
        set({
          widthFraction: next,
          hasCustomWidth: true,
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
 * The widget width as a primitive CSS string (`"50vw"`) so the subscription
 * bails out unless the rendered width changes. The expanded (max) width is
 * computed by the hook, since it depends on the live sidebar offset.
 */
export const selectWidgetWidth = (state: PeekPanelStoreState): string =>
  `${(state.draftFraction ?? state.widthFraction) * 100}vw`;
