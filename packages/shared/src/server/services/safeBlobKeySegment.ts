import { createHash } from "crypto";

import { env } from "../../env";

export const HASH_HEX_LENGTH = 16;
const HASH_SUFFIX_OVERHEAD = HASH_HEX_LENGTH + 1; // hex chars + leading "_"

// Characters that must not appear in a single S3 key path segment: "/" and
// "\" break path semantics; NUL and other ASCII control chars are rejected by
// S3/MinIO.
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHAR = /[\x00-\x1f/\\]/;
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHAR_GLOBAL = /[\x00-\x1f/\\]/g;

function sliceUtf8Bytes(input: string, maxBytes: number): string {
  const buf = Buffer.from(input, "utf8");
  if (buf.length <= maxBytes) return input;
  // Walk back from maxBytes to the last UTF-8 codepoint boundary so we never
  // truncate inside a multi-byte sequence.
  let end = maxBytes;
  // skip continuation bytes (0x80–0xBF)
  while (end > 0 && (buf[end] & 0xc0) === 0x80) end--;
  return buf.subarray(0, end).toString("utf8");
}

/**
 * Returns a path segment that is safe to use as one component of an S3 object
 * key built from a user-controlled entity ID (observation/trace/score id).
 *
 * Guarantees:
 *  - Result is ≤ `maxBytes` UTF-8 bytes.
 *  - Result contains no `/`, `\`, NUL, or other ASCII control characters.
 *  - For inputs already within budget and free of forbidden chars, the
 *    output is byte-identical to the input (no-op fast path — keeps
 *    pre-existing S3 keys readable after upgrade).
 *  - For oversized or sanitized inputs, the result is deterministic: the
 *    same `segment` always produces the same output for the same `maxBytes`.
 *  - Distinct inputs map to distinct outputs whenever sanitization fires,
 *    because the appended sha256 prefix is computed over the original bytes
 *    (not the post-replacement string).
 *
 * Producers and consumers MUST resolve `maxBytes` from the same source
 * (`env.LANGFUSE_S3_EVENT_KEY_MAX_SEGMENT_BYTES` in production).
 */
export function safeBlobKeySegment(
  segment: string,
  maxBytes: number = env.LANGFUSE_S3_EVENT_KEY_MAX_SEGMENT_BYTES,
): string {
  const overBudget = Buffer.byteLength(segment, "utf8") > maxBytes;
  const hasForbidden = FORBIDDEN_CHAR.test(segment);
  if (!overBudget && !hasForbidden) return segment;

  // Any sanitization at all → append a hash suffix derived from the original
  // bytes. This keeps the mapping injective: two segments that differ only
  // in forbidden characters (e.g. "a/b" vs "a_b") receive different hashes
  // and therefore different outputs.
  const sanitized = segment.replace(FORBIDDEN_CHAR_GLOBAL, "_");
  const prefixBudget = Math.max(0, maxBytes - HASH_SUFFIX_OVERHEAD);
  const prefix = sliceUtf8Bytes(sanitized, prefixBudget);
  const hash = createHash("sha256")
    .update(segment, "utf8")
    .digest("hex")
    .slice(0, HASH_HEX_LENGTH);
  return `${prefix}_${hash}`;
}

/**
 * Sanitize a stem so that `<stem><filenameSuffix>` fits inside
 * `LANGFUSE_S3_EVENT_KEY_MAX_SEGMENT_BYTES`. Caller appends the suffix.
 *
 * Use when an entity id has to become a single-segment filename
 * (`<id>.json`), where the suffix steals budget away from the stem.
 */
export function safeBlobFilenameStem(
  stem: string,
  filenameSuffix: string,
): string {
  return safeBlobKeySegment(
    stem,
    env.LANGFUSE_S3_EVENT_KEY_MAX_SEGMENT_BYTES - filenameSuffix.length,
  );
}
