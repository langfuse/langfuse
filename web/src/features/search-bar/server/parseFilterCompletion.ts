// Pure post-processing for the v4 AI filter endpoint: turn a raw LLM completion
// string into the `FilterState` the bar can apply. Kept separate from the tRPC
// procedure (which owns auth, gating, telemetry, and the LLM call) so this — the
// part with real branching logic — is unit-testable without a live model. This
// mirrors the search-bar feature's own lib/ (pure) vs I/O split.

import {
  eventsTableCols,
  type FilterState,
  singleFilter,
} from "@langfuse/shared";

import { SCORE_COLUMNS } from "../lib/fields";
import { filterStateToQueryText } from "../lib/filter-state-to-query";
import type { ObservedScoreNames } from "../lib/observed-options";

// Mirrors COMPATIBLE_FILTER_TYPES in
// packages/shared/src/server/queries/clickhouse-sql/filterTypeCompatibility.ts —
// the column-type → allowed-filter-type map that `events.all` enforces (and
// 500s on mismatch, e.g. a plain `number` filter on the `scores_avg`
// numberObject column). Kept local so this stays free of the heavy server barrel.
const COMPATIBLE_FILTER_TYPES: Record<string, readonly string[]> = {
  string: ["string", "stringOptions"],
  stringOptions: ["string", "stringOptions"],
  arrayOptions: ["arrayOptions", "stringOptions"],
  datetime: ["datetime"],
  number: ["number"],
  boolean: ["boolean"],
  stringObject: ["stringObject"],
  numberObject: ["numberObject"],
  booleanObject: ["booleanObject"],
  categoryOptions: ["categoryOptions", "stringOptions"],
};

/**
 * Guardrail: a filter whose type is incompatible with its column's contract
 * (e.g. `{type:"number", column:"scores_avg"}` — scores need `numberObject`
 * with a key) renders to text but is rejected by `events.all` with a 500. Drop
 * those. Unknown columns return true here and are dropped by the reverse-adapter
 * round-trip instead.
 */
function isEventsContractCompatible(f: FilterState[number]): boolean {
  if (f.type === "null" || f.type === "positionInTrace") return true;
  const col = f.column.toLowerCase();
  const def = eventsTableCols.find(
    (c) => c.id.toLowerCase() === col || c.name.toLowerCase() === col,
  );
  if (!def) return true;
  const allowed = COMPATIBLE_FILTER_TYPES[def.type];
  return allowed === undefined || allowed.includes(f.type);
}

/**
 * Scan `text` for balanced, top-level `[...]` substrings. Tracks bracket depth
 * while treating brackets inside JSON string literals as inert, so a `]` in a
 * value (`"array[0]"`) never closes an array early. Nested arrays (a value
 * array inside a filter object, depth > 1) are part of their enclosing
 * top-level array, not returned on their own. Returned in document order.
 */
function extractTopLevelArrays(text: string): string[] {
  const arrays: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      // Inside a string literal only `\` (escape) and an unescaped `"` (close)
      // are meaningful; brackets here must not move the depth.
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "[") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "]" && depth > 0) {
      depth--;
      if (depth === 0 && start !== -1) {
        arrays.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return arrays;
}

/**
 * Extract a `FilterState` from the model's completion. Tries the whole string
 * (a bare array or a `{ "filters": [...] }` wrapper) first, then every balanced
 * top-level `[...]` in the prose, LAST-FIRST. Returns the structurally-valid
 * filters plus `rawCount` (how many elements the model actually emitted), so
 * the caller can count the malformed ones as dropped. `rawCount` is 0 when
 * nothing parses.
 *
 * Last-first matters: the model sometimes emits a DRAFT array, some prose, then
 * a corrected SECOND array (self-correction). A single greedy `\[[\s\S]*\]`
 * match spans from the first `[` to the last `]` — swallowing both arrays plus
 * the prose between them, so `JSON.parse` fails and a correct answer is lost.
 * Scanning balanced candidates and trying the LAST one first applies the
 * model's self-correction instead of discarding it.
 */
function parseFilterArray(completion: string): {
  filters: FilterState;
  rawCount: number;
} {
  const candidates = [
    completion,
    ...extractTopLevelArrays(completion).reverse(),
  ];
  // A candidate that parses to a NON-EMPTY array but holds no structurally-valid
  // filter (e.g. an all-malformed array, or a stray bracketed list in the prose)
  // is remembered so `rawCount` still reflects what the model emitted, but it
  // does NOT win over a later candidate that DOES contain a valid filter. This
  // keeps a trailing non-filter array (`... use the [ERROR] level`) from
  // shadowing the real filter array that preceded it.
  let fallback: { filters: FilterState; rawCount: number } | null = null;
  for (const candidate of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    const raw = Array.isArray(parsed)
      ? parsed
      : (parsed as { filters?: unknown } | null)?.filters;
    if (!Array.isArray(raw)) continue;
    // An explicitly EMPTY array is the model's "no filter applies" answer (the
    // prompt asks for `[]` in exactly that case). Honor it as a real answer that
    // WINS: return immediately rather than falling through to an earlier draft
    // the model reconsidered — otherwise we'd silently apply a filter it
    // retracted. Distinct from a non-empty array that yields no VALID filter
    // (below): that stays a fallback so a stray prose list can't shadow a real
    // earlier filter array. Last-first order means a trailing `[]` is the
    // model's FINAL word, so this is safe to treat as the intended retraction.
    if (raw.length === 0) return { filters: [], rawCount: 0 };
    // Parse PER ELEMENT, not the whole array: `z.array(singleFilter).parse`
    // is all-or-nothing, so one off-spec element (wrong operator, missing
    // key, value-as-string, unknown type — common on weaker models) would
    // discard the valid siblings and surface a misleading "couldn't build
    // filters". Keep the structurally-valid ones; the rejects show up in the
    // dropped count below, mirroring the per-element keep/drop the two
    // downstream guardrails already use.
    const kept: FilterState = [];
    for (const item of raw) {
      const result = singleFilter.safeParse(item);
      if (result.success) kept.push(result.data);
    }
    if (kept.length > 0) return { filters: kept, rawCount: raw.length };
    // Had elements, none valid. Remember the LARGEST such array as the fallback:
    // when nothing validates, `droppedCount` should reflect the biggest array
    // the model emitted (the one it most plausibly intended as the answer), not
    // whichever candidate happened to be visited first. Reversed iteration
    // visits the last text array first, which might be a stray 2-element prose
    // list while the intended (all-malformed) array had more elements.
    if (fallback === null || raw.length > fallback.rawCount) {
      fallback = { filters: [], rawCount: raw.length };
    }
  }
  return fallback ?? { filters: [], rawCount: 0 };
}

// Which ObservedScoreNames set holds the real names for each score column —
// column implies both level (observation/trace) and type (numeric/categorical).
const SCORE_NAME_SET_BY_COLUMN: Record<
  string,
  keyof ObservedScoreNames | undefined
> = {
  [SCORE_COLUMNS.observation.numeric]: "numeric",
  [SCORE_COLUMNS.observation.categorical]: "categorical",
  [SCORE_COLUMNS.observation.boolean]: "booleans",
  [SCORE_COLUMNS.trace.numeric]: "traceNumeric",
  [SCORE_COLUMNS.trace.categorical]: "traceCategorical",
  [SCORE_COLUMNS.trace.boolean]: "traceBooleans",
};

// Case/separator-insensitive form for the confident-correction match:
// `my_score`, `My Score`, and `my-score` all normalize to `myscore`.
function normalizeScoreName(name: string): string {
  return name.toLowerCase().replace(/[\s_-]+/g, "");
}

/** The single real name whose normalized form matches `key`; null when none
 *  matches or more than one does (ambiguous — not a confident correction). */
function uniqueNormalizedMatch(
  names: readonly string[],
  key: string,
): string | null {
  const target = normalizeScoreName(key);
  let match: string | null = null;
  for (const name of names) {
    if (normalizeScoreName(name) !== target) continue;
    if (match !== null && match !== name) return null;
    match = name;
  }
  return match;
}

/**
 * Guardrail: score filters address a score by NAME (`key`), and a misspelled
 * name (`my_score` for the real `my-score`) passes every other check — Zod
 * (`key` is any string), the contract map (column→type only), and the grammar
 * round-trip (any key renders on a score column) — then applies as a dead
 * filter that silently matches nothing. So check each score filter's key
 * against the observed names for ITS column (which fixes both level and type):
 * exact match keeps, a unique normalized match corrects the key in place, and
 * anything else is dropped and reported in `unknownScoreNames`. A set the
 * client did not send (column not loaded) is not enforced. No cross-type or
 * cross-level rescue: the operator/value shape belongs to the column.
 */
function validateScoreNames(
  filters: FilterState,
  scoreNames: ObservedScoreNames | undefined,
): { filters: FilterState; unknownScoreNames: string[] } {
  if (scoreNames === undefined) return { filters, unknownScoreNames: [] };
  const kept: FilterState = [];
  const unknown: string[] = [];
  for (const filter of filters) {
    if (
      filter.type !== "numberObject" &&
      filter.type !== "categoryOptions" &&
      filter.type !== "booleanObject"
    ) {
      kept.push(filter);
      continue;
    }
    const setKey = SCORE_NAME_SET_BY_COLUMN[filter.column];
    const names = setKey === undefined ? undefined : scoreNames[setKey];
    if (names === undefined || names.includes(filter.key)) {
      kept.push(filter);
      continue;
    }
    const corrected = uniqueNormalizedMatch(names, filter.key);
    if (corrected !== null) {
      kept.push({ ...filter, key: corrected });
      continue;
    }
    unknown.push(filter.key);
  }
  return { filters: kept, unknownScoreNames: [...new Set(unknown)] };
}

export type GeneratedFilters = {
  /** Filters that round-trip to bar grammar — safe to apply and show as pills. */
  filters: FilterState;
  /** The derived bar query text (for display / telemetry). */
  queryText: string;
  /** How many model filters were dropped — malformed shape, hallucinated
   *  columns/score names, or non-v4 columns (emitted but not applied). */
  droppedCount: number;
  /** Score names the model emitted that match no observed score of that
   *  column's type, exactly or via `_`/`-`/space/case normalization. Their
   *  clauses were dropped; surface these so the drop is never silent. */
  unknownScoreNames: string[];
};

/**
 * Parse the model completion and keep only the filters that round-trip to bar
 * grammar. A hallucinated or non-v4 column lands in `skippedFilters` and is
 * dropped here, so a caller can never apply a filter the bar can't show as an
 * editable pill.
 */
export function parseGeneratedFilters(
  completion: string,
  scoreNames?: ObservedScoreNames,
): GeneratedFilters {
  // `rawCount` is what the model emitted; `parsed` already excludes elements
  // that failed `singleFilter`, so the drop count is measured against rawCount.
  const { filters: parsed, rawCount } = parseFilterArray(completion);
  // Guardrail 1: drop filters whose type the events contract would reject.
  const compatible = parsed.filter(isEventsContractCompatible);
  // Guardrail 2: correct or drop score filters whose key names no real score —
  // the one hallucination the round-trip below cannot catch (any key renders
  // on a score column), yet it applies as a dead filter matching nothing.
  const { filters: scoreChecked, unknownScoreNames } = validateScoreNames(
    compatible,
    scoreNames,
  );
  // Guardrail 3: drop anything that doesn't round-trip to bar grammar (unknown /
  // non-representable columns land in skippedFilters).
  const { text, skippedFilters } = filterStateToQueryText(scoreChecked);
  const skipped = new Set(skippedFilters);
  const filters = scoreChecked.filter((f) => !skipped.has(f));
  return {
    filters,
    queryText: text,
    droppedCount: rawCount - filters.length,
    unknownScoreNames,
  };
}
