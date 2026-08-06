/**
 * Re-encodes a string the way a JSON serializer with `ensure_ascii=True` does (e.g. Python's
 * `json.dumps`, used by the Langfuse Python SDK's EventSerializer / the OpenTelemetry ingestion
 * path): every code point >= U+0080 becomes a `\uXXXX` escape (astral code points become a
 * UTF-16 surrogate pair). ASCII is left untouched.
 *
 * Trace / observation `input` and `output` ingested through that path is persisted in ClickHouse
 * verbatim in this escaped form (e.g. `你好` is stored as the literal `\u4f60\u597d`), so a
 * substring search for the raw, human-readable text would never match it. By also searching for
 * this escaped form we recover full-text search for non-English content. See issues #11538 and #15072.
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
        (0xd800 + (v >> 10)).toString(16).padStart(4, "0") +
        "\\u" +
        (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, "0");
    }
  }
  return out;
};
