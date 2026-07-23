// Client-side metadata structure analysis feeding the bar's `metadata.<key>`
// key suggestions. The API does not enumerate metadata keys (see
// observed-options.ts) and backend structure analysis is deferred, so the map
// of observed keys is built OPPORTUNISTICALLY from rows the user has already
// loaded: each fetch samples the visible rows, records their TOP-LEVEL
// metadata keys with the observed JSON value type, and unions the result into
// the persisted per-project store (store/observedMetadataStore.ts). Accepted
// caveat: metadata the user has never loaded is never suggested.
//
// Top-level keys ONLY — deliberately not flattened into nested dot-paths.
// Metadata is stored as a flat Map(String, String): nested object values are
// JSON-encoded strings under their top-level key, and the stringObject filter
// matches the LITERAL top-level key ("we can only filter on the first level",
// StringObjectFilter in clickhouse-filter.ts; the metadata view's filter
// shortcut resolves the top-level key for the same reason — ValueCell.tsx).
// A flattened `metadata.scope.name` suggestion would lower to key
// "scope.name" and match nothing. Dot-paths still appear whenever producers
// use dotted top-level keys (the OTel-attribute shape, e.g.
// `gen_ai.request.model`) — those ARE literal keys and filter correctly.
// Object-valued keys are suggested with type "object"; their nested content
// is matched as a substring of the JSON-encoded branch (`metadata.scope:*v*`).
//
// Types are DISPLAY-ONLY hints: metadata filters always lower to
// `stringObject` (see fields.ts operatorIssue — numeric metadata comparisons
// are rejected), so a key observed with more than one type simply drops its
// hint rather than changing any filter behavior.

import type { ObservedOptions, ObservedValue } from "./observed-options";

export type MetadataLeafType =
  | "string"
  | "number"
  | "boolean"
  | "array"
  | "object";

/**
 * Stored per-key type: one observed value type, `"mixed"` once more than one
 * distinct type has been seen, or `""` while only null has been observed
 * (null registers the key but does not count as a type).
 */
export type StoredPathType = MetadataLeafType | "mixed" | "";

/** Persisted per-key record: display type + a few observed scalar values. */
export type StoredKeyInfo = {
  type: StoredPathType;
  /**
   * First-observed distinct SCALAR values (string/number/boolean, stringified)
   * feeding the value-stage dropdown. Object/array/null values and values
   * longer than MAX_VALUE_LENGTH are never collected — their stored form
   * could not round-trip into a matching `=` filter. Absent when none.
   */
  values?: string[];
};

// Bounds — metadata is user-shaped and unbounded, so every axis is capped:
// sampled rows per fetch, key string length, keys kept per project, values
// kept per key, and values kept per project in total (the store enforces the
// per-project caps on merge; entries beyond a cap are dropped, first-observed
// wins).
export const METADATA_SAMPLE_ROWS = 30;
export const MAX_PATHS_PER_PROJECT = 200;
export const MAX_VALUES_PER_KEY = 5;
// Hard per-project total. With today's caps the effective bound is the
// product 200 × 5 = 1000; this backstop binds only against drifted persisted
// state (older schema, tampered localStorage) or a future per-key cap raise.
export const MAX_VALUES_PER_PROJECT = 1024;
const MAX_PATH_LENGTH = 100;
// Values longer than this are SKIPPED, never truncated — a truncated value
// would insert a filter that confidently matches nothing.
const MAX_VALUE_LENGTH = 60;
// Skip parsing giant metadata blobs so the per-fetch analysis stays cheap.
const MAX_METADATA_JSON_LENGTH = 200_000;

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

function valueType(v: unknown): MetadataLeafType | null {
  if (Array.isArray(v)) return "array";
  const t = typeof v;
  if (t === "string" || t === "number" || t === "boolean") return t;
  if (t === "object" && v !== null) return "object";
  return null;
}

/**
 * Merge an already-stored key type with a newly observed one. `"mixed"` is
 * absorbing; null-only observations (`""`) never demote a known type.
 */
export function mergePathType(
  prev: StoredPathType | undefined,
  next: StoredPathType | null,
): StoredPathType {
  const observed = next ?? "";
  if (prev === undefined || prev === "") return observed;
  if (observed === "" || observed === prev) return prev;
  return "mixed";
}

/** Suggestible scalar value, stringified — or null when not suggestible. */
function scalarValue(v: unknown): string | null {
  const t = typeof v;
  if (t !== "string" && t !== "number" && t !== "boolean") return null;
  const s = String(v);
  return s.length > 0 && s.length <= MAX_VALUE_LENGTH ? s : null;
}

/**
 * Record the observed top-level metadata keys of sampled rows (JSON-encoded
 * strings per `MetadataDomainClient`, or already-parsed objects) with their
 * value types, merged across rows (`a:1` + `a:"x"` → `"mixed"`), plus the
 * first few distinct scalar values per key for the value-stage dropdown.
 */
export function collectMetadataPathTypes(
  sampleMetadata: readonly unknown[],
): Map<string, StoredKeyInfo> {
  const out = new Map<string, StoredKeyInfo>();
  for (const md of sampleMetadata) {
    if (typeof md === "string" && md.length > MAX_METADATA_JSON_LENGTH)
      continue;
    const parsed = typeof md === "string" ? safeJsonParse(md) : md;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
      continue;
    for (const [key, v] of Object.entries(parsed as Record<string, unknown>)) {
      // Empty keys are unfilterable; "__proto__" keys would turn the store's
      // plain-object key map into a prototype write.
      if (key.length === 0 || key === "__proto__") continue;
      if (key.length > MAX_PATH_LENGTH) continue;
      const existing = out.get(key);
      if (existing === undefined && out.size >= MAX_PATHS_PER_PROJECT) continue;
      const type = mergePathType(existing?.type, valueType(v));
      const value = scalarValue(v);
      let values = existing?.values;
      if (
        value !== null &&
        (values?.length ?? 0) < MAX_VALUES_PER_KEY &&
        !values?.includes(value)
      ) {
        values = [...(values ?? []), value];
      }
      out.set(key, values === undefined ? { type } : { type, values });
    }
  }
  return out;
}

/**
 * Merge the persisted per-project key map into the observed-options map where
 * the completion planner reads it: keys under `metadata` (keyPathOptions) and
 * each key's observed values under `metadata.<key>` (the value stage). Keys
 * are sorted so related dotted keys group together in the dropdown;
 * `"mixed"`/null-only keys carry no type hint. `undefined` observed (filter
 * options still loading) stays `undefined` so the planner's loading semantics
 * are untouched.
 */
export function withMetadataPathOptions(
  observed: ObservedOptions | undefined,
  paths: Record<string, StoredKeyInfo> | undefined,
): ObservedOptions | undefined {
  if (observed === undefined || paths === undefined) return observed;
  const entries = Object.entries(paths);
  if (entries.length === 0) return observed;
  const out: ObservedOptions = { ...observed };
  out.metadata = entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([path, { type }]): ObservedValue =>
        type === "" || type === "mixed"
          ? { value: path }
          : { value: path, type },
    );
  for (const [path, { values }] of entries) {
    if (values !== undefined && values.length > 0) {
      out[`metadata.${path}`] = values.map((v) => ({ value: v }));
    }
  }
  return out;
}
