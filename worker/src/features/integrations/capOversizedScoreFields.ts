import type { AnalyticsScoreEvent } from "@langfuse/shared/src/server";

// PostHog capture JSON-encodes the event a second time into a Kafka message
// capped at 1,000,000 bytes and answers 413 above it; the SDK then retries the
// event forever, stalling the export. Mixpanel caps the once-encoded event at
// 1 MB. The headroom covers properties the transformers add.
const MAX_ENCODED_SCORE_BYTES = 900_000;

type ScoreEncoding = {
  /** How often the destination JSON-encodes the event before its size check. */
  encodings: 1 | 2;
};

export const POSTHOG_SCORE_ENCODING: ScoreEncoding = { encodings: 2 };
export const MIXPANEL_SCORE_ENCODING: ScoreEncoding = { encodings: 1 };

// Worst-case bytes per counted character: a control char becomes `\u0001`
// (6 bytes) after one JSON encoding and `\\u0001` (7) after two.
const MAX_BYTES_PER_CHAR = { 1: 6, 2: 7 } as const;

const FREE_TEXT_FIELDS = [
  "langfuse_score_metadata",
  "langfuse_score_comment",
  "langfuse_score_string_value",
] as const;

type FreeTextField = (typeof FREE_TEXT_FIELDS)[number];

/**
 * Upper bound on the JSON length in characters, counting quotes, separators
 * and brackets as one character each.
 */
const countChars = (value: unknown): number => {
  if (typeof value === "string") return value.length + 2;
  if (value === null || value === undefined) return 4;
  if (value instanceof Date) return 26;
  if (Array.isArray(value)) {
    let total = 2;
    for (const item of value) total += countChars(item) + 1;
    return total;
  }
  if (typeof value === "object") {
    let total = 2;
    for (const [key, v] of Object.entries(value)) {
      total += key.length + 4 + countChars(v);
    }
    return total;
  }
  return String(value).length;
};

const fitsWithoutMeasuring = (
  score: AnalyticsScoreEvent,
  { encodings }: ScoreEncoding,
): boolean =>
  countChars(score) * MAX_BYTES_PER_CHAR[encodings] <= MAX_ENCODED_SCORE_BYTES;

const encodedBytes = (value: unknown, { encodings }: ScoreEncoding): number => {
  let encoded = JSON.stringify(value) ?? "";
  if (encodings === 2) encoded = JSON.stringify(encoded);
  return Buffer.byteLength(encoded);
};

const pickFieldsToOmit = (
  score: AnalyticsScoreEvent,
  encoding: ScoreEncoding,
): FreeTextField[] => {
  let total = encodedBytes(score, encoding);
  const largestFirst = FREE_TEXT_FIELDS.map((field) => ({
    field,
    bytes: encodedBytes(score[field] ?? null, encoding),
  })).sort((a, b) => b.bytes - a.bytes);

  const omitted: FreeTextField[] = [];
  for (const { field, bytes } of largestFirst) {
    if (total <= MAX_ENCODED_SCORE_BYTES) break;
    omitted.push(field);
    total -= bytes;
  }
  return omitted;
};

const withOmittedFields = <T extends AnalyticsScoreEvent>(
  score: T,
  omitted: FreeTextField[],
): T => {
  const capped: T = { ...score, langfuse_score_omitted_fields: omitted };
  for (const field of omitted) capped[field] = null as T[FreeTextField];
  return capped;
};

/**
 * Nulls the largest free-text score fields until the encoded score fits the
 * destination event size limit, and lists the dropped fields in
 * `langfuse_score_omitted_fields`.
 */
export const capOversizedScoreFields = <T extends AnalyticsScoreEvent>(
  score: T,
  encoding: ScoreEncoding,
): T => {
  if (fitsWithoutMeasuring(score, encoding)) return score;
  const omitted = pickFieldsToOmit(score, encoding);
  if (omitted.length === 0) return score;
  return withOmittedFields(score, omitted);
};
