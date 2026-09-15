/**
 * The app-wide Formatted / JSON choice. Persisted under
 * `JSON_VIEW_PREFERENCE_STORAGE_KEY` (JSON-encoded, via useLocalStorage) by
 * every toggle instance, so one switch changes every JSON view in the app.
 */

/** localStorage key of the app-wide view choice (JSON-encoded string). */
export const JSON_VIEW_PREFERENCE_STORAGE_KEY = "jsonViewPreference";

/** Formatted (pretty), raw JSON, or the advanced JSON viewer (json-beta). */
export type JsonViewPreference = "pretty" | "json" | "json-beta";

export const DEFAULT_JSON_VIEW_PREFERENCE: JsonViewPreference = "pretty";

const JSON_VIEW_PREFERENCES: readonly string[] = [
  "pretty",
  "json",
  "json-beta",
];

/** A value read back from storage or a toggle. Unknown values (retired view
    modes included) degrade to Formatted rather than breaking a view. */
export function normalizeJsonViewPreference(
  value: unknown,
): JsonViewPreference {
  return typeof value === "string" && JSON_VIEW_PREFERENCES.includes(value)
    ? (value as JsonViewPreference)
    : DEFAULT_JSON_VIEW_PREFERENCE;
}

/** True for the Formatted view; only the two JSON views differ. */
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
