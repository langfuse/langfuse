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
 * This helper decides, from a cheap serialized-length probe, whether a field is
 * too large to render in that unvirtualized viewer. Above the limit the caller
 * shows a bounded fallback (preview head + download) and skips both the
 * main-thread parse and the full render. Normal I/O (KB-scale) is untouched.
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
 * Cheap serialized-length probe used only to decide gating. Strings measure by
 * length (instant); objects/arrays via `JSON.stringify`. Returns 0 for
 * null/undefined and on serialization failure (a value we cannot serialize is
 * not something the JSON viewer can render either).
 */
export function getJsonStringSize(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "string") return value.length;
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}
