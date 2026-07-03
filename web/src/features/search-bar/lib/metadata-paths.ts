// Client-side metadata structure analysis feeding the bar's `metadata.<path>`
// key suggestions. The API does not enumerate metadata keys (see
// observed-options.ts) and backend structure analysis is deferred, so the map
// of observed paths is built OPPORTUNISTICALLY from rows the user has already
// loaded: each fetch samples the visible rows, flattens their metadata into
// dot-paths with the observed JSON leaf type, and unions the result into the
// persisted per-project store (store/observedMetadataStore.ts). Accepted
// caveat: metadata the user has never loaded is never suggested.
//
// The walker mirrors ai-context.ts's `collectMetadataKeys` (depth cap, arrays
// as leaves, JSON-string parse) but captures TYPES instead of prompt example
// values — the two consumers cap and shape differently, so they stay separate.
//
// Types are DISPLAY-ONLY hints: metadata filters always lower to
// `stringObject` (see fields.ts operatorIssue — numeric metadata comparisons
// are rejected), so a path observed with more than one type simply drops its
// hint rather than changing any filter behavior.

import type { ObservedOptions, ObservedValue } from "./observed-options";

export type MetadataLeafType = "string" | "number" | "boolean" | "array";

/**
 * Stored per-path type: one observed leaf type, `"mixed"` once more than one
 * distinct type has been seen, or `""` while only null has been observed
 * (null registers the path but does not count as a type).
 */
export type StoredPathType = MetadataLeafType | "mixed" | "";

// Bounds — metadata is user-shaped and unbounded, so every axis is capped:
// sampled rows per fetch, nesting depth, path string length, and paths kept
// per project (the store enforces the same per-project cap on merge; paths
// beyond it are dropped, first-observed wins).
export const METADATA_SAMPLE_ROWS = 30;
export const MAX_PATHS_PER_PROJECT = 200;
const MAX_ANALYSIS_DEPTH = 3;
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

function leafType(v: unknown): MetadataLeafType | null {
  if (Array.isArray(v)) return "array";
  const t = typeof v;
  return t === "string" || t === "number" || t === "boolean" ? t : null;
}

/**
 * Merge an already-stored path type with a newly observed one. `"mixed"` is
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

function collectPaths(
  md: unknown,
  prefix: string,
  out: Map<string, StoredPathType>,
  depth: number,
): void {
  if (depth > MAX_ANALYSIS_DEPTH) return;
  if (md === null || typeof md !== "object" || Array.isArray(md)) return;
  for (const [k, v] of Object.entries(md as Record<string, unknown>)) {
    // Empty segments produce unfilterable paths; "__proto__" keys would turn
    // the store's plain-object path map into a prototype write.
    if (k.length === 0 || k === "__proto__") continue;
    const path = prefix ? `${prefix}.${k}` : k;
    if (path.length > MAX_PATH_LENGTH) continue;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      collectPaths(v, path, out, depth + 1);
      continue;
    }
    const existing = out.get(path);
    if (existing === undefined && out.size >= MAX_PATHS_PER_PROJECT) continue;
    out.set(path, mergePathType(existing, leafType(v)));
  }
}

/**
 * Flatten sampled row metadata (JSON-encoded strings per
 * `MetadataDomainClient`, or already-parsed objects) into observed dot-paths
 * with their leaf types, merged across rows (`a:1` + `a:"x"` → `"mixed"`).
 */
export function collectMetadataPathTypes(
  sampleMetadata: readonly unknown[],
): Map<string, StoredPathType> {
  const out = new Map<string, StoredPathType>();
  for (const md of sampleMetadata) {
    if (typeof md === "string" && md.length > MAX_METADATA_JSON_LENGTH)
      continue;
    const parsed = typeof md === "string" ? safeJsonParse(md) : md;
    collectPaths(parsed, "", out, 0);
  }
  return out;
}

/**
 * Merge the persisted per-project path map into the observed-options map under
 * the `metadata` key the completion planner reads (completions.ts
 * keyPathOptions). Paths are sorted so nested siblings group together in the
 * dropdown; `"mixed"`/null-only paths carry no type hint. `undefined` observed
 * (filter options still loading) stays `undefined` so the planner's loading
 * semantics are untouched.
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
