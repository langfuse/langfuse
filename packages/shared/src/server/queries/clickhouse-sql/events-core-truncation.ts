import type { ClickhouseOperator } from "./clickhouse-filter";

// events_core_mv truncates each metadata_values element (and input/output) to
// the first 200 UTF-8 code points via leftUTF8(v, 200). A metadata filter is
// only safe to answer against events_core when 200-char truncation cannot
// change its result.
const EVENTS_CORE_TRUNCATION_LIMIT = 200;

// Metadata operators that can be answered correctly against the truncated
// events_core copy — an allow-list, so any operator not named here defaults to
// events_full. That default is the safe one: routing a decidable filter to
// events_full only costs performance, whereas routing a truncation-sensitive
// filter to events_core silently drops matches past code point 200. When a new
// ClickhouseOperator is added it must be reviewed and added here explicitly
// before it can use events_core.
//   - `=` / `starts with`: string ops, subject to the length guard below.
//   - `>` `<` `>=` `<=`: numeric comparisons — values are inherently short.
//   - `<>`: boolean not-equal — value is inherently short.
//   - `is null` / `is not null`: truncation-invariant (metadata_names is not
//     truncated; emptiness is unaffected).
//   - `is set` / `is not set`: key-presence over metadata_names only, which is
//     not truncated.
// Deliberately excluded (match can live past code point 200): `contains`,
// `does not contain`, `ends with`, and the FTS `matches` operator (which also
// needs the events_full-only index).
const EVENTS_CORE_SAFE_METADATA_OPERATORS = new Set<ClickhouseOperator>([
  "=",
  "starts with",
  ">",
  "<",
  ">=",
  "<=",
  "<>",
  "is null",
  "is not null",
  "is set",
  "is not set",
]);

/**
 * Truncation-safety classifier: can a single metadata filter be answered
 * correctly against the truncated events_core copy, or must it read events_full?
 *
 * events_core keeps only the first {@link EVENTS_CORE_TRUNCATION_LIMIT} code
 * points of each metadata value (metadata_names is not truncated). This is an
 * allow-list: an operator is events_core-safe only if it is named in
 * {@link EVENTS_CORE_SAFE_METADATA_OPERATORS} and, for the two length-sensitive
 * string operators, its value fits within the retained prefix:
 *   - `starts with`, value length <= 200 — the prefix lives within retained chars.
 *   - `=`, value length < 200 — a stored value longer than 200 truncates to 200
 *     code points and can never equal a sub-200 value. Strict `<` avoids the
 *     exact-200 false positive where a >200 value shares the first 200 chars.
 *   - `is null` / `is not null` — truncation invariant (metadata_names is
 *     untruncated; emptiness is unaffected).
 *   - numeric / boolean metadata comparisons — the value is inherently short,
 *     so its truncated copy is complete.
 * Anything else (including any newly added operator) is routed to events_full,
 * because over-routing only costs performance while under-routing silently
 * drops matches past the truncation boundary.
 *
 * Single source of truth for metadata truncation routing. Do not reuse
 * NGRAM_ACCELERATED_METADATA_OPERATORS or FTS_TEXT_OPERATORS: those classify
 * ngram/FTS index eligibility, a different axis (the ngram set includes
 * truncation-unsafe `contains`/`ends with` and excludes truncation-safe `=`).
 */
export const metadataFilterIsEventsCoreSafe = (
  operator: ClickhouseOperator,
  value: unknown,
): boolean => {
  if (!EVENTS_CORE_SAFE_METADATA_OPERATORS.has(operator)) {
    return false;
  }
  if (typeof value === "string") {
    if (operator === "starts with") {
      return codePointLength(value) <= EVENTS_CORE_TRUNCATION_LIMIT;
    }
    if (operator === "=") {
      return codePointLength(value) < EVENTS_CORE_TRUNCATION_LIMIT;
    }
  }
  return true;
};

// Count Unicode code points to mirror ClickHouse leftUTF8, which truncates by
// code point rather than UTF-16 unit or byte.
function codePointLength(value: string): number {
  return Array.from(value).length;
}
