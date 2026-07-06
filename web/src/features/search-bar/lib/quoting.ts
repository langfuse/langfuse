// Quoting primitives — the single source of truth for how the grammar quotes
// and unquotes a token (a value, or a dot-path key segment like the score name
// in `scores."Rouge Score"`). Kept in a dependency-free leaf module so both the
// lexer/serializer (langQ.ts) and the field registry (fields.ts) can share it
// without a circular import. The escape and the unquote are exact inverses.

/** Chars that force a token to be quoted so the lexer keeps it as one piece. */
export const NEEDS_QUOTES = /[\s:,()"\\]/;

/** Escape a string for inside double quotes (inverse of {@link unquote}). */
function escapeQuoted(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Quote `value` iff it contains grammar chars, so it re-lexes as a single
 * token. Used for dot-path key segments (`scores."Rouge Score"`) and is the
 * same quoting `serializeValue` applies to values.
 */
export function quoteIfNeeded(value: string): string {
  return NEEDS_QUOTES.test(value) ? `"${escapeQuoted(value)}"` : value;
}

/**
 * Strip a surrounding pair of double quotes and unescape `\"`/`\\`. Returns
 * `quoted` so callers can tell an explicitly-quoted token from a bare one.
 */
export function unquote(s: string): { value: string; quoted: boolean } {
  const t = s.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return { value: t.slice(1, -1).replace(/\\(["\\])/g, "$1"), quoted: true };
  }
  return { value: t, quoted: false };
}
