// Compact, versioned grammar-text codec for the events search bar's own URL
// param (`fq`) — Search/Filter v2.
//
// The legacy `filter` param encodes a FilterInput as delimited-flat OR JSON-tree
// (filters/lib/filter-query-encoding.ts). That stays the canonical, cross-table,
// saved-view contract and is UNTOUCHED here. This codec is the alternative the
// events bar uses for `fq`: the canonical grammar TEXT, which expresses flat AND
// trees uniformly and is ~3–6× smaller than the JSON tree (a 600-term OR is
// ~7KB of text vs ~45KB of JSON). Read precedence is the caller's job: prefer
// `fq` when it decodes for the current version, else fall back to `filter`.
//
// VERSIONING. The grammar text is now a persisted contract, so it is versioned.
// `GRAMMAR_VERSION` bumps ONLY on a breaking grammar change — a renamed canonical
// column id or a changed operator meaning. Additive changes (new fields/operators)
// still parse old URLs unchanged and need no migration. A value whose stored
// version is below current runs through the migration chain before parsing; a
// value that is too new, unmigratable, or unparseable decodes to null so the
// caller falls back to the legacy param instead of crashing or mis-filtering.

import { type FilterInput, type TracingSearchType } from "@langfuse/shared";

import { astToFilterInput, type ScoreTypeContext } from "./adapter";
import { filterInputToQueryText } from "./filter-state-to-query";
import { validateQuery } from "./validate";

/** Bump ONLY on a breaking grammar change (rename a canonical column id, change
 *  an operator's meaning). Additive changes don't need a bump. */
export const GRAMMAR_VERSION = 1;

// `fq` value shape: "<version>:<grammar text>", e.g.
//   "1:level:ERROR OR name:checkout"
// The version prefix is split on the FIRST ":"; everything after is the verbatim
// grammar text (which itself contains ":" in every `field:value`).
const VERSION_SEP = ":";

type GrammarTextOptions = {
  searchQuery?: string | null;
  searchType?: TracingSearchType[] | null;
};

/**
 * Migration chain: `MIGRATIONS[v]` rewrites grammar text from version `v` to
 * `v+1`. Pure string→string transforms, applied in sequence. Empty today — v1 is
 * the first persisted version, with no breaking change behind it. Example for a
 * future breaking rename (`latency` → `durationMs`):
 *
 *   const MIGRATIONS = {
 *     1: (text) => text.replace(/(^|\s)latency:/g, "$1durationMs:"),
 *   };
 */
const MIGRATIONS: Record<number, (text: string) => string> = {};

/** Apply the migration chain from `fromVersion` up to current. Returns null when
 *  a step is missing (no path) so the caller falls back to the legacy param. */
function migrate(text: string, fromVersion: number): string | null {
  let migrated = text;
  for (let v = fromVersion; v < GRAMMAR_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) return null;
    migrated = step(migrated);
  }
  return migrated;
}

/**
 * Encode a {@link FilterInput} (+ optional free text / scope) as a versioned
 * `fq` value. Returns null when the input has NO lossless grammar form — a leaf
 * the bar can't serialize lands in `skippedFilters`, and an empty result has
 * nothing to store — so the caller keeps using the legacy `filter` param for
 * those (no silent drop).
 */
export function encodeGrammarFilter(
  input: FilterInput | null | undefined,
  options: GrammarTextOptions = {},
): string | null {
  if (input == null) return null;
  const { text, skippedFilters } = filterInputToQueryText(input, options);
  if (skippedFilters.length > 0) return null;
  if (text.trim().length === 0) return null;
  return `${GRAMMAR_VERSION}${VERSION_SEP}${text}`;
}

export type DecodedGrammarFilter = {
  filterInput: FilterInput;
  searchQuery: string | null;
  searchType: TracingSearchType[] | null;
};

/**
 * Decode a versioned `fq` value back to a {@link FilterInput} (+ free text).
 * Returns null on ANY failure — missing/too-new version, no migration path, a
 * parse/validation error, or a leaf the adapter rejects — so the caller falls
 * back to the legacy `filter` param. Never throws.
 */
export function decodeGrammarFilter(
  value: string | null | undefined,
  scoreTypes?: ScoreTypeContext,
): DecodedGrammarFilter | null {
  if (!value) return null;
  const sepIndex = value.indexOf(VERSION_SEP);
  if (sepIndex <= 0) return null;

  const version = Number(value.slice(0, sepIndex));
  // A version we don't recognize (NaN, negative, or newer than this client) is
  // un-migratable here — fall back rather than mis-parse a future format.
  if (!Number.isInteger(version) || version < 1 || version > GRAMMAR_VERSION) {
    return null;
  }

  const rawText = value.slice(sepIndex + 1);
  const text = version < GRAMMAR_VERSION ? migrate(rawText, version) : rawText;
  if (text == null) return null;

  const result = validateQuery(text, scoreTypes);
  if (!result.valid) return null;

  const { filterInput, searchQuery, searchType, errors } = astToFilterInput(
    result.ast,
    scoreTypes,
  );
  if (errors.length > 0) return null;

  // A pure free-text query (e.g. `refund`) lowers to no filters — represent it
  // as an empty flat array so the result is always a FilterInput, never null.
  return { filterInput: filterInput ?? [], searchQuery, searchType };
}
