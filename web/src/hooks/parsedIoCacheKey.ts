/**
 * Cheap, stable React Query cache signatures for parsed-I/O hooks
 * (`useParsedTrace`, `useParsedObservation`) — LFE-10992, part of the
 * LFE-10152 large-traces epic.
 *
 * Both hooks previously embedded the raw `input`/`output`/`metadata` values
 * directly in the queryKey, which forces React Query's `hashKey` to
 * `JSON.stringify` the whole — potentially multi-MB — payload into the query
 * hash on EVERY render (`defaultQueryOptions` recomputes the hash on each
 * `useQuery` call, and its replacer even sorts object keys). That is an
 * O(payload) main-thread serialization done purely for cache bookkeeping —
 * precisely the kind of whole-payload stringify the large-traces work exists
 * to remove.
 *
 * The replacement keys by the (unique) trace/observation id plus a per-field
 * signature from `cheapHash`, which is content-sensitive (so a same-length
 * refetch such as `"pending"` → `"running"` still invalidates the parse) but
 * never `JSON.stringify`s the payload. Callers memoize the hash on the raw
 * reference, so the O(n) pass runs only when a field actually changes — the
 * exact moment a re-parse is wanted — and is O(1) amortized per render.
 */

/**
 * cyrb53 — a fast, well-distributed non-cryptographic 53-bit string hash
 * (public-domain, by bryc). Used only to detect content changes for cache
 * keying, never for security. A single O(n) pass over char codes with
 * `Math.imul`, no allocation.
 */
function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * Content-sensitive, allocation-free cache signature for one parse-input field.
 *
 * Returns a compact descriptor that changes whenever the field's content
 * changes — never the payload itself: `s<len>:<hash>` for strings (length +
 * cyrb53, so same-length-different-content still differs — no cache collision
 * when a refetch swaps e.g. `"pending"` → `"running"`), `a<len>` for arrays,
 * `o<keys>` for objects, the literal for primitives, `∅` for null/undefined.
 * The type-tag prefix keeps namespaces distinct (a 5-char string never
 * collides with a 5-element array).
 *
 * Arrays/objects fall back to a shape-only signature because the trace and
 * observation I/O fields that flow through here are `string | null` in
 * practice; the string branch is the operative one and is exact-content-safe.
 */
export function cheapHash(value: unknown): string {
  if (value === null || value === undefined) return "∅";
  if (typeof value === "string") return `s${value.length}:${cyrb53(value)}`;
  if (Array.isArray(value)) return `a${value.length}`;
  if (typeof value === "object") return `o${Object.keys(value).length}`;
  return `p${String(value)}`;
}
