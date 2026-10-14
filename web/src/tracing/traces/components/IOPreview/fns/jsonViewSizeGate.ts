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
 * Row threshold at/above which a field in the JSON Beta view renders through the
 * lazy byte-engine viewer (AdvancedJsonViewer/lazy) instead of the eager tree.
 * Measured in fully-expanded rows (`countJsonRows`), NOT chars — a char limit is
 * the wrong metric: a 20 MB single string (e.g. a base64 data-URI) is one node
 * and renders instantly, while 20 MB of nested JSON is ~1M nodes.
 *
 * This equals the viewer's virtualization threshold on purpose: any field big
 * enough to need windowing goes to the lazy viewer, whose cost is bounded to
 * what's expanded/visible. There is NO safe "eager but virtualized" middle band.
 * The old eager virtualized path (`buildMultiSectionTree` materializes every
 * node, then React renders the whole node set synchronously on mount) froze the
 * tab for minutes at only tens of thousands of nodes — e.g. a 44k-row
 * big-number payload pegged the main thread ~4 min in dev (LFE-10847). So above
 * this threshold we ALWAYS render lazily; below it a field is small enough to
 * render eagerly inline. The raw download stays available as a secondary hatch.
 *
 * Keep in sync with `VIRTUALIZATION_THRESHOLD` in IOPreviewJSON (imported there).
 */
export const JSON_VIEW_RENDER_ROW_LIMIT = 3_333;

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
