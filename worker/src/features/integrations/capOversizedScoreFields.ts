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

/** A truncatable string: the comment, the string value or a metadata value. */
type TextSlot = {
  label: string;
  field: FreeTextField;
  metadataKey?: string;
  value: string;
};

type Cut = { slot: TextSlot; value: string };

const collectTextSlots = (score: AnalyticsScoreEvent): TextSlot[] => {
  const slots: TextSlot[] = [];
  for (const field of [
    "langfuse_score_comment",
    "langfuse_score_string_value",
  ] as const) {
    const value = score[field];
    if (typeof value === "string") slots.push({ label: field, field, value });
  }
  const metadata = score.langfuse_score_metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    for (const [metadataKey, value] of Object.entries(metadata)) {
      if (typeof value === "string") {
        slots.push({
          label: `langfuse_score_metadata.${metadataKey}`,
          field: "langfuse_score_metadata",
          metadataKey,
          value,
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
 * Keeps the longest prefix that brings `total` to the target. Binary search,
 * because escaping makes bytes per character uneven along the string.
 */
const cutSlot = (
  slot: TextSlot,
  total: number,
  encoding: ScoreEncoding,
): { value: string; total: number } => {
  const rest = total - encodedBytes(slot.value, encoding);
  const fits = (kept: number) =>
    rest + encodedBytes(cutAt(slot.value, kept), encoding) <=
    TRUNCATION_TARGET_BYTES;
  let lo = 0;
  let hi = slot.value.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(mid)) lo = mid;
    else hi = mid - 1;
  }
  const value = cutAt(slot.value, lo);
  return { value, total: rest + encodedBytes(value, encoding) };
};

const pickCuts = (
  score: AnalyticsScoreEvent,
  total: number,
  encoding: ScoreEncoding,
): Cut[] => {
  const largestFirst = collectTextSlots(score)
    .filter((slot) => slot.value.length > TRUNCATION_SUFFIX.length)
    .map((slot) => ({ slot, bytes: encodedBytes(slot.value, encoding) }))
    .sort((a, b) => b.bytes - a.bytes);

  const cuts: Cut[] = [];
  for (const { slot } of largestFirst) {
    if (total <= TRUNCATION_TARGET_BYTES) break;
    // Budget the label `withCuts` lists for this cut, or many cuts overflow.
    total += encodedBytes(slot.label, encoding) + 1;
    const result = cutSlot(slot, total, encoding);
    cuts.push({ slot, value: result.value });
    total = result.total;
  }
  return cuts;
};

const withCuts = <T extends AnalyticsScoreEvent>(score: T, cuts: Cut[]): T => {
  const fieldCuts = cuts.filter((c) => c.slot.metadataKey === undefined);
  const metadataCuts = cuts.filter((c) => c.slot.metadataKey !== undefined);
  return {
    ...score,
    ...Object.fromEntries(fieldCuts.map((c) => [c.slot.field, c.value])),
    ...(metadataCuts.length > 0 && {
      langfuse_score_metadata: {
        ...(score.langfuse_score_metadata as Record<string, unknown>),
        ...Object.fromEntries(
          metadataCuts.map((c) => [c.slot.metadataKey, c.value]),
        ),
      },
    }),
    langfuse_score_truncated_fields: cuts.map((c) => c.slot.label),
  };
};

const truncateLargestValues = <T extends AnalyticsScoreEvent>(
  score: T,
  encoding: ScoreEncoding,
): T => {
  const total = encodedBytes(score, encoding);
  if (total <= MAX_ENCODED_SCORE_BYTES) return score;
  const cuts = pickCuts(score, total, encoding);
  return cuts.length === 0 ? score : withCuts(score, cuts);
};

const truncationLabels = (score: AnalyticsScoreEvent): string[] =>
  Array.isArray(score.langfuse_score_truncated_fields)
    ? (score.langfuse_score_truncated_fields as string[])
    : [];

const labelBelongsTo = (label: string, field: FreeTextField): boolean =>
  label === field || label.startsWith(`${field}.`);

/**
 * Picks fields to null, largest first. A field's size includes its truncation
 * labels, which are dropped with it.
 */
const pickFieldsToOmit = (
  score: AnalyticsScoreEvent,
  encoding: ScoreEncoding,
): FreeTextField[] => {
  let total = encodedBytes(score, encoding);
  const labels = truncationLabels(score);
  const largestFirst = FREE_TEXT_FIELDS.map((field) => ({
    field,
    bytes:
      encodedBytes(score[field] ?? null, encoding) +
      encodedBytes(
        labels.filter((label) => labelBelongsTo(label, field)),
        encoding,
      ),
  })).sort((a, b) => b.bytes - a.bytes);

  const omitted: FreeTextField[] = [];
  for (const { field, bytes } of largestFirst) {
    if (total <= MAX_ENCODED_SCORE_BYTES) break;
    omitted.push(field);
    total -= bytes;
  }
  return omitted;
};

/** Nulls the fields and drops their truncation labels, which no longer apply. */
const withOmittedFields = <T extends AnalyticsScoreEvent>(
  score: T,
  omitted: FreeTextField[],
): T => ({
  ...score,
  ...Object.fromEntries(omitted.map((field) => [field, null])),
  langfuse_score_omitted_fields: omitted,
});

/**
 * Truncates the largest free-text strings (comment, string value, metadata
 * values) until the encoded score fits the destination event size limit,
 * listing them in `langfuse_score_truncated_fields`. If the score still does
 * not fit, e.g. because of the metadata keys alone, those fields are nulled
 * (listed in `langfuse_score_omitted_fields`). Truncation then restarts from
 * the original values, so the other fields keep what the freed room allows.
 */
export const capOversizedScoreFields = <T extends AnalyticsScoreEvent>(
  score: T,
  encoding: ScoreEncoding,
): T => {
  if (fitsWithoutMeasuring(score, encoding)) return score;
  const truncated = truncateLargestValues(score, encoding);
  const omitted = pickFieldsToOmit(truncated, encoding);
  if (omitted.length === 0) return truncated;
  return truncateLargestValues(withOmittedFields(score, omitted), encoding);
};
