import { useSyncExternalStore } from "react";
import {
  type JsonTableStyleVariant,
  JSON_TABLE_STYLES,
} from "@/src/components/ui/jsonTableStyleVariants";

/**
 * The app-wide Formatted / JSON choice. Persisted under
 * `JSON_VIEW_PREFERENCE_STORAGE_KEY` (JSON-encoded, via useLocalStorage) by
 * every toggle instance, so one switch changes every JSON view in the app.
 *
 * Review-only: three extra options render the Formatted view with one table
 * style direction pinned (`PINNED_STYLE_JSON_VIEWS`), so the finalists can be
 * compared in context. They are removed before merge.
 */

/** localStorage key of the app-wide view choice (JSON-encoded string). */
export const JSON_VIEW_PREFERENCE_STORAGE_KEY = "jsonViewPreference";

/** View options that pin a table style direction; each value is the style
    variant it pins. Toggle order. */
export const PINNED_STYLE_JSON_VIEWS = [
  "dense-dotbreak",
  "tree-plus",
  "tree",
] as const satisfies readonly JsonTableStyleVariant[];

export type PinnedStyleJsonView = (typeof PINNED_STYLE_JSON_VIEWS)[number];

/** Formatted (pretty), raw JSON, the advanced JSON viewer (json-beta), or
    Formatted with a table style pinned. */
export type JsonViewPreference =
  | "pretty"
  | "json"
  | "json-beta"
  | PinnedStyleJsonView;

export const DEFAULT_JSON_VIEW_PREFERENCE: JsonViewPreference = "pretty";

const JSON_VIEW_PREFERENCES: readonly string[] = [
  "pretty",
  "json",
  "json-beta",
  ...PINNED_STYLE_JSON_VIEWS,
];

function isPinnedStyleJsonView(view: string): view is PinnedStyleJsonView {
  return (PINNED_STYLE_JSON_VIEWS as readonly string[]).includes(view);
}

/** A value read back from storage or a toggle. Unknown values (the retired
    "pretty-beta" included) degrade to Formatted rather than breaking a view. */
export function normalizeJsonViewPreference(
  value: unknown,
): JsonViewPreference {
  return typeof value === "string" && JSON_VIEW_PREFERENCES.includes(value)
    ? (value as JsonViewPreference)
    : DEFAULT_JSON_VIEW_PREFERENCE;
}

/** Formatted and the pinned-style views all render the pretty layout; only
    the two JSON views differ. */
export function isPrettyLikeJsonView(view: JsonViewPreference): boolean {
  return view !== "json" && view !== "json-beta";
}

/** The two-state view that PrettyJsonView, MarkdownJsonView and the chat
    renderer distinguish. */
export function toPrettyOrJsonView(
  view: JsonViewPreference,
): "pretty" | "json" {
  return isPrettyLikeJsonView(view) ? "pretty" : "json";
}

/** Segment of the Formatted / JSON toggle that `view` selects (both JSON
    views share the JSON segment; the Beta switch picks between them). */
export function jsonViewToggleTab(
  view: JsonViewPreference,
): Exclude<JsonViewPreference, "json-beta"> {
  return view === "json-beta" ? "json" : view;
}

/** Short segment label of a pinned-style view. */
export function pinnedStyleJsonViewLabel(view: PinnedStyleJsonView): string {
  return JSON_TABLE_STYLES[view].label;
}

function readStoredJsonViewPreference(): JsonViewPreference {
  if (typeof window === "undefined") return DEFAULT_JSON_VIEW_PREFERENCE;
  try {
    const stored = window.localStorage.getItem(
      JSON_VIEW_PREFERENCE_STORAGE_KEY,
    );
    return normalizeJsonViewPreference(
      stored === null ? null : JSON.parse(stored),
    );
  } catch {
    return DEFAULT_JSON_VIEW_PREFERENCE;
  }
}

function getServerJsonViewPreference(): JsonViewPreference {
  return DEFAULT_JSON_VIEW_PREFERENCE;
}

/** useLocalStorage announces same-tab writes as `localStorageChange`; other
    tabs arrive as native `storage` events. */
function subscribe(onChange: () => void) {
  window.addEventListener("localStorageChange", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("localStorageChange", onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The table style pinned by the stored app-wide view, or null while a
    Formatted / JSON view is selected. Read-only; the toggles own the writes. */
export function usePinnedJsonTableStyleVariant(): JsonTableStyleVariant | null {
  const view = useSyncExternalStore(
    subscribe,
    readStoredJsonViewPreference,
    getServerJsonViewPreference,
  );
  return isPinnedStyleJsonView(view) ? view : null;
}
