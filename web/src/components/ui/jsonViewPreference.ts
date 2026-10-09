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

export function isPrettyLikeJsonView(view: JsonViewPreference): boolean {
  return view !== "json" && view !== "json-beta";
}

export function toPrettyOrJsonView(
  view: JsonViewPreference,
): "pretty" | "json" {
  return view === "json" ? "json" : "pretty";
}

export function jsonViewToggleTab(
  view: JsonViewPreference,
): Exclude<JsonViewPreference, "json-beta"> {
  return view === "json-beta" ? "json" : view;
}
