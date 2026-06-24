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

import { filterStateToQueryText } from "../lib/filter-state-to-query";

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
 * Extract a `FilterState` from the model's completion. Tries the whole string,
 * then the widest bracketed array (greedy, so it survives nested objects), and
 * tolerates a `{ "filters": [...] }` wrapper. Returns the structurally-valid
 * filters plus `rawCount` (how many elements the model actually emitted), so
 * the caller can count the malformed ones as dropped. `rawCount` is 0 when
 * nothing parses.
 */
function parseFilterArray(completion: string): {
  filters: FilterState;
  rawCount: number;
} {
  const arrayMatch = completion.match(/\[[\s\S]*\]/)?.[0];
  const candidates = [completion, arrayMatch].filter((c): c is string =>
    Boolean(c),
  );
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const raw = Array.isArray(parsed) ? parsed : parsed.filters;
      if (!Array.isArray(raw)) continue;
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
      return { filters: kept, rawCount: raw.length };
    } catch {
      // try the next candidate
    }
  }
  return { filters: [], rawCount: 0 };
}

export type GeneratedFilters = {
  /** Filters that round-trip to bar grammar — safe to apply and show as pills. */
  filters: FilterState;
  /** The derived bar query text (for display / telemetry). */
  queryText: string;
  /** How many model filters were dropped — malformed shape, hallucinated, or
   *  non-v4 columns (i.e. emitted by the model but not applied). */
  droppedCount: number;
};

/**
 * Parse the model completion and keep only the filters that round-trip to bar
 * grammar. A hallucinated or non-v4 column lands in `skippedFilters` and is
 * dropped here, so a caller can never apply a filter the bar can't show as an
 * editable pill.
 */
export function parseGeneratedFilters(completion: string): GeneratedFilters {
  // `rawCount` is what the model emitted; `parsed` already excludes elements
  // that failed `singleFilter`, so the drop count is measured against rawCount.
  const { filters: parsed, rawCount } = parseFilterArray(completion);
  // Guardrail 1: drop filters whose type the events contract would reject.
  const compatible = parsed.filter(isEventsContractCompatible);
  // Guardrail 2: drop anything that doesn't round-trip to bar grammar (unknown /
  // non-representable columns land in skippedFilters).
  const { text, skippedFilters } = filterStateToQueryText(compatible);
  const skipped = new Set(skippedFilters);
  const filters = compatible.filter((f) => !skipped.has(f));
  return {
    filters,
    queryText: text,
    droppedCount: rawCount - filters.length,
  };
}
