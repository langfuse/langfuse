/**
 * Size gate for the unvirtualized "JSON" IO view (LFE-10989, part of the
 * LFE-10152 large-traces work).
 *
 * The plain "JSON" view renders the whole payload through react18-json-view,
 * which is NOT virtualized: every node becomes DOM. Multi-megabyte I/O both
 * blocks the main thread while parsing (`parsePreservingPrecision`) and builds
 * enough nodes to crash the renderer. Measured on the `lfe10152-json-trace`
 * seed: ~20 MB I/O deterministically crashes the tab, with multi-second parse
 * freezes.
 *
 * This helper decides, from a single serialized probe, whether a field is too
 * large to render in that unvirtualized viewer. Above the limit the caller
 * shows a bounded fallback (preview head + download) and skips both the
 * main-thread parse and the full render. Normal I/O (KB-scale) is untouched.
 *
 * `probeJsonField` serializes an object field exactly once and returns that
 * string alongside its length, so the size check, the preview head, and the
 * download all share one `JSON.stringify` — never re-serializing the payload
 * (which would partly defeat the gate). String fields are never serialized.
 */

/**
 * Character ceiling for rendering a single field in the unvirtualized JSON
 * view. This measures UTF-16 string length (`.length`), i.e. chars, not bytes.
 * 2M chars is chosen deliberately:
 * - The codebase's own safe main-thread parse bounds are 300–500 KB
 *   (`PrettyJsonView` / worker `maxSize`); 2M is ~4–6× above those, so it stays
 *   well inside "the main thread can survive this once" territory.
 * - Still 100–1000× larger than typical trace I/O (KB-scale), so real traces
 *   are never gated and keep rendering instantly.
 * - Below the size where the unvirtualized clone + re-parse + DOM render
 *   becomes a perceptible (~1s+) freeze, and far below the measured ~20 MB
 *   deterministic-crash point.
 * Users keep full access to large payloads via the Formatted view (lazy
 * table), the JSON Beta view (virtualized), and the raw download.
 */
export const JSON_VIEW_RENDER_CHAR_LIMIT = 2_000_000;

/**
 * Node ceiling for rendering a field in the *virtualized* JSON Beta viewer
 * (AdvancedJsonViewer). Measured in fully-expanded rows (`countJsonRows`), NOT
 * chars — the Beta viewer virtualizes the DOM, so its cost is the O(N)
 * tree-build (`buildMultiSectionTree` materializes every node) + row-count, not
 * the visible DOM. A char limit is the wrong metric here: a 20 MB single string
 * (e.g. a base64 data-URI) is one node and renders instantly as a media chip,
 * while 20 MB of nested JSON is ~1M nodes and freezes the tab building the tree
 * (LFE-10847 — matches the "freezes switching to JSON view on large
 * conversations" report). Above this limit the field renders the same bounded
 * preview + download fallback the plain JSON view uses.
 *
 * 50k is chosen deliberately:
 * - 15× the viewer's own `VIRTUALIZATION_THRESHOLD` (3333), so ordinary large
 *   traces (a few thousand rows) are never gated and keep rendering.
 * - Far below the measured ~1M-node freeze; a 50k-node tree builds in tens of
 *   ms and virtualizes fine.
 * Users keep full access via the Formatted (lazy) view and the raw download.
 */
export const JSON_VIEW_RENDER_ROW_LIMIT = 50_000;

export interface JsonFieldProbe {
  /** Serialized length in UTF-16 chars; drives the gating decision. */
  size: number;
  /** The value as text — the raw string for string fields, compact JSON for
   *  objects/arrays, "" for null/undefined or on serialization failure. Reused
   *  for the fallback's preview slice and download so nothing re-serializes. */
  serialized: string;
  /** Whether the source value was already a string (raw text, no JSON quotes). */
  isString: boolean;
}

/**
 * Serialize a field once and report its size. Strings pass through as-is
 * (instant, no JSON quoting); objects/arrays are `JSON.stringify`-d a single
 * time. Null/undefined and unserializable values (e.g. circular) report size 0,
 * so they are never gated and never produce an empty download.
 */
export function probeJsonField(value: unknown): JsonFieldProbe {
  if (value === null || value === undefined) {
    return { size: 0, serialized: "", isString: false };
  }
  if (typeof value === "string") {
    return { size: value.length, serialized: value, isString: true };
  }
  try {
    const serialized = JSON.stringify(value) ?? "";
    return { size: serialized.length, serialized, isString: false };
  } catch {
    return { size: 0, serialized: "", isString: false };
  }
}
