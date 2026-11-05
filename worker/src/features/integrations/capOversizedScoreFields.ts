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

const TRUNCATION_SUFFIX = "…[truncated]";
// Leaves room for the `langfuse_score_truncated_fields` marker.
const TRUNCATION_TARGET_BYTES = MAX_ENCODED_SCORE_BYTES - 10_000;

type TextSlot = { label: string; value: string; set: (value: string) => void };

/** Truncatable strings: comment, string value and each metadata value. */
const collectTextSlots = (copy: AnalyticsScoreEvent): TextSlot[] => {
  const slots: TextSlot[] = [];
  for (const field of [
    "langfuse_score_comment",
    "langfuse_score_string_value",
  ] as const) {
    const value = copy[field];
    if (typeof value === "string") {
      slots.push({ label: field, value, set: (v) => (copy[field] = v) });
    }
  }
  const metadata = copy.langfuse_score_metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const metadataCopy: Record<string, unknown> = { ...metadata };
    copy.langfuse_score_metadata = metadataCopy;
    for (const [key, value] of Object.entries(metadataCopy)) {
      if (typeof value === "string") {
        slots.push({
          label: `langfuse_score_metadata.${key}`,
          value,
          set: (v) => (metadataCopy[key] = v),
        });
      }
    }
  }
  return slots;
};

const cutAt = (value: string, keepChars: number): string => {
  let end = keepChars;
  const last = value.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1; // keep surrogate pairs whole
  return value.slice(0, end) + TRUNCATION_SUFFIX;
};

/**
 * Shortens the largest strings until the score fits, re-measuring after each
 * cut because escaping makes bytes per character uneven.
 */
const truncateLargestValues = <T extends AnalyticsScoreEvent>(
  score: T,
  encoding: ScoreEncoding,
): T => {
  let total = encodedBytes(score, encoding);
  if (total <= MAX_ENCODED_SCORE_BYTES) return score;

  const copy: T = { ...score };
  const largestFirst = collectTextSlots(copy)
    .filter((slot) => slot.value.length > TRUNCATION_SUFFIX.length)
    .map((slot) => ({ ...slot, bytes: encodedBytes(slot.value, encoding) }))
    .sort((a, b) => b.bytes - a.bytes);

  const truncated: string[] = [];
  for (const slot of largestFirst) {
    if (total <= TRUNCATION_TARGET_BYTES) break;
    let { bytes } = slot;
    let kept = slot.value.length;
    let cut = slot.value;
    while (total > TRUNCATION_TARGET_BYTES && kept > 0) {
      const keepRatio = Math.max(
        0,
        1 - (total - TRUNCATION_TARGET_BYTES) / bytes,
      );
      kept = Math.max(
        0,
        Math.floor(kept * keepRatio) - TRUNCATION_SUFFIX.length,
      );
      cut = cutAt(slot.value, kept);
      const cutBytes = encodedBytes(cut, encoding);
      total += cutBytes - bytes;
      bytes = cutBytes;
    }
    slot.set(cut);
    truncated.push(slot.label);
  }
  if (truncated.length === 0) return score;
  copy.langfuse_score_truncated_fields = truncated;
  return copy;
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
 * Truncates the largest free-text strings (comment, string value, metadata
 * values) until the encoded score fits the destination event size limit,
 * listing them in `langfuse_score_truncated_fields`. If the score still does
 * not fit, e.g. because of the metadata keys alone, the free-text fields are
 * nulled and listed in `langfuse_score_omitted_fields`.
 */
export const capOversizedScoreFields = <T extends AnalyticsScoreEvent>(
  score: T,
  encoding: ScoreEncoding,
): T => {
  if (fitsWithoutMeasuring(score, encoding)) return score;
  const truncated = truncateLargestValues(score, encoding);
  const omitted = pickFieldsToOmit(truncated, encoding);
  if (omitted.length === 0) return truncated;
  return withOmittedFields(truncated, omitted);
};
