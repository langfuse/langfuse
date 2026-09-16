export const JSON_VIEW_PREFERENCE_STORAGE_KEY = "jsonViewPreference";

export type JsonViewPreference = "pretty" | "json" | "json-beta";

export const DEFAULT_JSON_VIEW_PREFERENCE: JsonViewPreference = "pretty";

const JSON_VIEW_PREFERENCES: readonly string[] = [
  "pretty",
  "json",
  "json-beta",
];

export function normalizeJsonViewPreference(
  value: unknown,
): JsonViewPreference {
  return typeof value === "string" && JSON_VIEW_PREFERENCES.includes(value)
    ? (value as JsonViewPreference)
    : DEFAULT_JSON_VIEW_PREFERENCE;
}

/** Panes rather than one full-width viewer; json-beta fills a pane, so it is not. */
export function isPrettyLikeJsonView(view: JsonViewPreference): boolean {
  return view !== "json" && view !== "json-beta";
}

/** No advanced viewer in these hosts, so json-beta renders as Formatted. */
export function toPrettyOrJsonView(
  view: JsonViewPreference,
): "pretty" | "json" {
  return view === "json" ? "json" : "pretty";
}

/** The toggle has no json-beta segment, so json-beta highlights JSON. */
export function jsonViewToggleTab(
  view: JsonViewPreference,
): Exclude<JsonViewPreference, "json-beta"> {
  return view === "json-beta" ? "json" : view;
}
