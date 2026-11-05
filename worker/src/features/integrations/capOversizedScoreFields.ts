import type { AnalyticsScoreEvent } from "@langfuse/shared/src/server";

// PostHog capture JSON-encodes the event a second time into a Kafka message
// capped at 1,000,000 bytes and answers 413 above it; the SDK then retries the
// event forever, stalling the export. Mixpanel caps events at 1 MB too.
const MAX_ENCODED_FREE_TEXT_BYTES = 900_000;

// A UTF-16 code unit grows to at most 7 bytes after two JSON encodings
// (control char -> `\\u0001`), so anything under this many characters fits.
const FAST_PATH_MAX_CHARS = Math.floor(MAX_ENCODED_FREE_TEXT_BYTES / 7);

const FREE_TEXT_FIELDS = [
  "langfuse_score_metadata",
  "langfuse_score_comment",
  "langfuse_score_string_value",
] as const;

const charLength = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "string") return value.length;
  if (typeof value === "object" && !Array.isArray(value)) {
    let total = 0;
    for (const [key, v] of Object.entries(value)) {
      if (typeof v !== "string") return Infinity;
      total += key.length + v.length;
    }
    return total;
  }
  return Infinity;
};

const doubleEncodedBytes = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  return Buffer.byteLength(JSON.stringify(JSON.stringify(value)));
};

/**
 * Nulls the largest free-text score fields until the rest fits the destination
 * event size limit, and lists the dropped fields in
 * `langfuse_score_omitted_fields`.
 */
export const capOversizedScoreFields = <T extends AnalyticsScoreEvent>(
  score: T,
): T => {
  let chars = 0;
  for (const field of FREE_TEXT_FIELDS) chars += charLength(score[field]);
  if (chars <= FAST_PATH_MAX_CHARS) return score;

  const sizes = FREE_TEXT_FIELDS.map((field) => ({
    field,
    bytes: doubleEncodedBytes(score[field]),
  })).sort((a, b) => b.bytes - a.bytes);
  let total = sizes.reduce((sum, s) => sum + s.bytes, 0);

  const omitted: string[] = [];
  for (const { field, bytes } of sizes) {
    if (total <= MAX_ENCODED_FREE_TEXT_BYTES) break;
    omitted.push(field);
    total -= bytes;
  }
  if (omitted.length === 0) return score;

  const capped: T = { ...score, langfuse_score_omitted_fields: omitted };
  for (const field of omitted) capped[field as keyof T] = null as T[keyof T];
  return capped;
};
