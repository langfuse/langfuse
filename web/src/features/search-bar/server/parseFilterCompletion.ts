// Pure post-processing for the v4 AI filter endpoint: turn a raw LLM completion
// string into the `FilterInput` the bar can apply — a flat `FilterState` (plain
// AND) or a nested AND/OR tree (cross-field OR / brackets). Kept separate from
// the tRPC procedure (which owns auth, gating, telemetry, and the LLM call) so
// this — the part with real branching logic — is unit-testable without a live
// model. This mirrors the search-bar feature's own lib/ (pure) vs I/O split.

import {
  eventsTableCols,
  filterExpression,
  type FilterExpression,
  type FilterInput,
  type FilterState,
  getFilterExpressionBoundsIssue,
  getFilterExpressionLeafFilters,
  singleFilter,
} from "@langfuse/shared";

import {
  filterInputToQueryText,
  filterStateToQueryText,
} from "../lib/filter-state-to-query";

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
 * Pull the first JSON value out of the model completion. Tries the whole string,
 * then the widest bracketed array (a flat `FilterState`), then the widest brace
 * object (a `{type:"group",…}` tree or a `{filters:[…]}` wrapper). Greedy so it
 * survives nested objects/groups. Returns the parsed value, or null if nothing
 * parses.
 */
function extractJsonValue(completion: string): unknown {
  const candidates = [
    completion,
    completion.match(/\[[\s\S]*\]/)?.[0],
    completion.match(/\{[\s\S]*\}/)?.[0],
  ].filter((c): c is string => Boolean(c));
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/** A `{type:"group",…}` node — the shape the model emits for OR / bracketed logic. */
function isGroupShape(value: unknown): value is { conditions?: unknown[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { type?: unknown }).type === "group"
  );
}

/** Best-effort count of the leaf (non-group) conditions the model emitted, used
 *  only for the dropped-count telemetry when a tree is rejected wholesale. */
function countRawLeaves(value: unknown): number {
  if (Array.isArray(value))
    return value.reduce<number>((n, v) => n + countRawLeaves(v), 0);
  if (isGroupShape(value))
    return (value.conditions ?? []).reduce<number>(
      (n, c) => n + countRawLeaves(c),
      0,
    );
  return value != null ? 1 : 0;
}

export type GeneratedFilters = {
  /** Filter input that round-trips to bar grammar — a flat `FilterState` or a
   *  nested AND/OR tree — safe to apply and re-render in the bar. */
  filterInput: FilterInput;
  /** The derived bar query text (for display / telemetry). */
  queryText: string;
  /** How many model filters were dropped — malformed shape, hallucinated, or
   *  non-v4 columns (i.e. emitted by the model but not applied). */
  droppedCount: number;
};

const EMPTY: GeneratedFilters = {
  filterInput: [],
  queryText: "",
  droppedCount: 0,
};

/**
 * Flat-array path (the default, and what every model emits for plain AND
 * filters): parse PER ELEMENT, not the whole array. `z.array(singleFilter)` is
 * all-or-nothing, so one off-spec element (wrong operator, missing key,
 * value-as-string — common on weaker models) would discard the valid siblings
 * and surface a misleading "couldn't build filters". Keep the structurally-valid
 * ones; the rejects show up in the dropped count.
 */
function parseFlat(raw: unknown[]): GeneratedFilters {
  const kept: FilterState = [];
  for (const item of raw) {
    const result = singleFilter.safeParse(item);
    if (result.success) kept.push(result.data);
  }
  // Guardrail 1: drop filters whose type the events contract would reject.
  const compatible = kept.filter(isEventsContractCompatible);
  // Guardrail 2: drop anything that doesn't round-trip to bar grammar (unknown /
  // non-representable columns land in skippedFilters).
  const { text, skippedFilters } = filterStateToQueryText(compatible);
  const skipped = new Set(skippedFilters);
  const filters = compatible.filter((f) => !skipped.has(f));
  return {
    filterInput: filters,
    queryText: text,
    droppedCount: raw.length - filters.length,
  };
}

/**
 * Tree path (cross-field OR / bracketed logic). Unlike the flat path, tolerance
 * is ALL-OR-NOTHING: dropping one leaf from an OR changes the boolean meaning of
 * the whole expression, so a tree is applied only if it parses, fits the depth/
 * node bounds, and EVERY leaf is contract-compatible and round-trips to grammar.
 * Otherwise the whole tree is rejected (and the caller shows "couldn't build").
 */
function parseTree(value: unknown): GeneratedFilters {
  const result = filterExpression.safeParse(value);
  if (!result.success) return { ...EMPTY, droppedCount: countRawLeaves(value) };
  const tree: FilterExpression = result.data;
  // Mirror the tRPC boundary's depth/node caps here so an oversized AI tree is
  // rejected as "couldn't build" rather than 400ing when the table applies it.
  if (getFilterExpressionBoundsIssue(tree) !== null)
    return { ...EMPTY, droppedCount: countRawLeaves(value) };
  const leaves = getFilterExpressionLeafFilters(tree);
  const allCompatible = leaves.every(isEventsContractCompatible);
  const { text, skippedFilters } = filterInputToQueryText(tree);
  if (!allCompatible || skippedFilters.length > 0)
    return { ...EMPTY, droppedCount: leaves.length };
  return { filterInput: tree, queryText: text, droppedCount: 0 };
}

/**
 * Parse the model completion into a `FilterInput` and keep only what round-trips
 * to bar grammar, so a caller can never apply a filter the bar can't show as an
 * editable pill. A flat array (plain AND) is filtered per element; a
 * `{type:"group"}` tree (OR / brackets) is accepted all-or-nothing.
 */
export function parseGeneratedFilters(completion: string): GeneratedFilters {
  const parsed = extractJsonValue(completion);
  if (parsed == null) return EMPTY;
  // Unwrap a `{filters:[…]}` / `{filterInput:…}` envelope (some models add one),
  // but never a real group node (which carries `type:"group"`, not these keys).
  const value =
    !isGroupShape(parsed) &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    ("filters" in parsed || "filterInput" in parsed)
      ? ((parsed as Record<string, unknown>).filters ??
        (parsed as Record<string, unknown>).filterInput)
      : parsed;

  if (isGroupShape(value)) return parseTree(value);
  return parseFlat(Array.isArray(value) ? value : []);
}
