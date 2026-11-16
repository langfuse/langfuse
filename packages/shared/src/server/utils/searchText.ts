/**
 * Search-value helpers shared by the raw-SQL filter builders and the query
 * AST: they decide which index conjuncts a filter emits and which binds it
 * sends, so both builders must compute them the same way.
 */

/**
 * Whether `value` yields at least one ClickHouse `tokens()` token (a letter
 * or digit). A token-less value makes a `hasAllTokens` index prefilter a
 * no-op, so filters leave it out.
 */
export const hasFtsSearchToken = (value: string): boolean =>
  /[\p{L}\p{N}]/u.test(value);

/** `hasAllTokens` accepts at most this many search tokens. */
export const FTS_HAS_ALL_TOKENS_MAX_SEARCH_TOKENS = 64;

/**
 * ASCII-only lowercase, byte-for-byte like ClickHouse `lower()` (which the
 * events_full ngram indexes use): A-Z become a-z, multi-byte UTF-8 is left
 * untouched. `String.toLowerCase()` would diverge on non-ASCII and make a
 * JS-lowered `IN` set miss rows the index keeps.
 */
export const clickhouseAsciiLower = (value: string): string =>
  value.replace(/[A-Z]/g, (c) => c.toLowerCase());

/**
 * Re-encodes a string the way a JSON serializer with `ensure_ascii=True` does (e.g. Python's
 * `json.dumps`, used by the Langfuse Python SDK's EventSerializer / the OpenTelemetry ingestion
 * path): every code point >= U+0080 becomes a `\uXXXX` escape (astral code points become a
 * UTF-16 surrogate pair). ASCII is left untouched.
 *
 * Trace / observation `input` and `output` ingested through that path is persisted in ClickHouse
 * verbatim in this escaped form (e.g. `你好` is stored as the literal `你好`), so a
 * substring search for the raw, human-readable text would never match it. By also searching for
 * this escaped form we recover full-text search for non-English content. See issue #11538.
 */
export const toJsonUnicodeEscaped = (value: string): string => {
  let out = "";
  for (const ch of value) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) {
      out += ch;
    } else if (cp <= 0xffff) {
      out += "\\u" + cp.toString(16).padStart(4, "0");
    } else {
      const v = cp - 0x10000;
      out +=
        "\\u" +
        (0xd800 + Math.floor(v / 0x400)).toString(16).padStart(4, "0") +
        "\\u" +
        (0xdc00 + (v % 0x400)).toString(16).padStart(4, "0");
    }
  }
  return out;
};
