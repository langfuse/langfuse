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

// Bounds — metadata is user-shaped and unbounded, so every axis is capped:
// sampled rows per fetch, key string length, and keys kept per project (the
// store enforces the same per-project cap on merge; keys beyond it are
// dropped, first-observed wins).
export const METADATA_SAMPLE_ROWS = 30;
export const MAX_PATHS_PER_PROJECT = 200;
const MAX_PATH_LENGTH = 100;
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

/**
 * Record the observed top-level metadata keys of sampled rows (JSON-encoded
 * strings per `MetadataDomainClient`, or already-parsed objects) with their
 * value types, merged across rows (`a:1` + `a:"x"` → `"mixed"`).
 */
export function collectMetadataPathTypes(
  sampleMetadata: readonly unknown[],
): Map<string, StoredPathType> {
  const out = new Map<string, StoredPathType>();
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
      out.set(key, mergePathType(existing, valueType(v)));
    }
  }
  return out;
}

/**
 * Merge the persisted per-project key map into the observed-options map under
 * the `metadata` key the completion planner reads (completions.ts
 * keyPathOptions). Keys are sorted so related dotted keys group together in
 * the dropdown; `"mixed"`/null-only keys carry no type hint. `undefined`
 * observed (filter options still loading) stays `undefined` so the planner's
 * loading semantics are untouched.
 */
export function withMetadataPathOptions(
  observed: ObservedOptions | undefined,
  paths: Record<string, StoredPathType> | undefined,
): ObservedOptions | undefined {
  if (observed === undefined || paths === undefined) return observed;
  const entries = Object.entries(paths);
  if (entries.length === 0) return observed;
  const metadata: ObservedValue[] = entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, type]) =>
      type === "" || type === "mixed" ? { value: path } : { value: path, type },
    );
  return { ...observed, metadata };
}
