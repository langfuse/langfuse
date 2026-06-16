// Reverse adapter: flat Langfuse `FilterState` (+ full-text searchQuery and
// searchType scopes) → query text.
//
// Drives the Datadog-style sync: the facet sidebar owns the canonical
// `FilterState`, and whenever it changes the search bar re-seeds its text from
// here. Builds editor AST nodes and reuses the canonical serializer, so the
// produced text always reparses and round-trips through astToFilterState back
// to an equivalent flat filter list + search. Filters that have no grammar
// form (e.g. positionInTrace) are reported in `skipped`, never silently
// dropped.

import {
  eventsTableCols,
  type FilterState,
  type TracingSearchType,
} from "@langfuse/shared";

import type { ASTNode, FilterNode } from "./ast";
import { resolveField, SCORE_COLUMNS } from "./fields";
import { NEEDS_QUOTES, serialize } from "./langQ";

// Legacy filters address columns by id ("userId") or display name ("User ID").
const COLUMN_ID_BY_KEY = new Map<string, string>();
for (const col of eventsTableCols) {
  COLUMN_ID_BY_KEY.set(col.id.toLowerCase(), col.id);
  COLUMN_ID_BY_KEY.set(col.name.toLowerCase(), col.id);
}

function columnIdOf(column: string): string | null {
  return COLUMN_ID_BY_KEY.get(column.toLowerCase()) ?? null;
}

function filterNode(
  key: string,
  op: FilterNode["op"],
  values: string[],
  valueOp?: "or" | "and",
): FilterNode {
  return { kind: "filter", key, op, values, valueOp };
}

function negate(node: FilterNode): ASTNode {
  return { kind: "not", child: node };
}

function scorePathOf(column: string, key: string): string | null {
  if (
    column === SCORE_COLUMNS.observation.numeric ||
    column === SCORE_COLUMNS.observation.categorical
  ) {
    return `scores.${key}`;
  }
  if (
    column === SCORE_COLUMNS.trace.numeric ||
    column === SCORE_COLUMNS.trace.categorical
  ) {
    return `traceScores.${key}`;
  }
  return null;
}

const STRING_OP_SYMBOL: Record<string, FilterNode["op"]> = {
  "=": "exact",
  contains: "~",
  "starts with": "^",
  "ends with": "$",
};

function lowerSingle(filter: FilterState[number]): ASTNode | null {
  switch (filter.type) {
    case "stringOptions":
    case "arrayOptions": {
      const id = columnIdOf(filter.column);
      if (id === null || filter.value.length === 0) return null;
      if (filter.operator === "none of") {
        return negate(filterNode(id, "=", filter.value));
      }
      if (filter.operator === "all of") {
        // A single-value all-of has no distinct grammar form — `(a)` reparses
        // as any-of, so emitting it would silently flip the operator shape on
        // the next commit. Skip it (preserved via skippedFilters) rather than
        // rewrite; multi-value all-of serializes to the `(a AND b)` group.
        if (filter.value.length < 2) return null;
        return filterNode(id, "=", filter.value, "and");
      }
      return filterNode(id, "=", filter.value);
    }
    case "string": {
      const id = columnIdOf(filter.column);
      if (id === null) return null;
      if (filter.operator === "does not contain") {
        return negate(filterNode(id, "~", [filter.value]));
      }
      const op = STRING_OP_SYMBOL[filter.operator];
      if (op === undefined) return null;
      // '=' on option-backed fields reads better as the bare any-of form.
      if (op === "exact") {
        const ref = resolveField(id);
        if (
          ref?.type === "field" &&
          (ref.field.syncMode === "exactOption" ||
            ref.field.syncMode === "arrayOption")
        ) {
          return filterNode(id, "=", [filter.value]);
        }
      }
      return filterNode(id, op, [filter.value]);
    }
    case "number": {
      const id = columnIdOf(filter.column);
      if (id === null) return null;
      const op = filter.operator === "=" ? "=" : filter.operator;
      return filterNode(id, op, [String(filter.value)]);
    }
    case "datetime": {
      const id = columnIdOf(filter.column);
      if (id === null) return null;
      const value =
        filter.value instanceof Date
          ? filter.value.toISOString()
          : String(filter.value);
      return filterNode(id, filter.operator, [value]);
    }
    case "boolean": {
      const id = columnIdOf(filter.column);
      if (id === null) return null;
      const value = filter.operator === "<>" ? !filter.value : filter.value;
      return filterNode(id, "=", [String(value)]);
    }
    case "stringObject": {
      const id = columnIdOf(filter.column);
      if (id !== "metadata") return null;
      // A key with grammar chars (`:`, space, …) would reparse as a different
      // key/value pair, silently corrupting the filter. Can't be expressed in
      // the grammar — skip so the container preserves it (no silent rewrite).
      if (NEEDS_QUOTES.test(filter.key)) return null;
      const key = `metadata.${filter.key}`;
      if (filter.operator === "does not contain") {
        return negate(filterNode(key, "~", [filter.value]));
      }
      const op = STRING_OP_SYMBOL[filter.operator];
      if (op === undefined) return null;
      // Mirror the `string` carve-out: metadata only supports
      // exact/contains/starts/ends (no contains-default ambiguity), so equality
      // reads as the bare `metadata.key:value` the user typed and the README
      // documents — not the explicit `metadata.key:=value` `exact` would emit.
      if (op === "exact") return filterNode(key, "=", [filter.value]);
      return filterNode(key, op, [filter.value]);
    }
    case "numberObject": {
      if (NEEDS_QUOTES.test(filter.key)) return null;
      const path = scorePathOf(filter.column, filter.key);
      if (path === null) return null;
      const op = filter.operator === "=" ? "=" : filter.operator;
      return filterNode(path, op, [String(filter.value)]);
    }
    case "categoryOptions": {
      if (NEEDS_QUOTES.test(filter.key)) return null;
      const path = scorePathOf(filter.column, filter.key);
      if (path === null || filter.value.length === 0) return null;
      const node = filterNode(path, "=", filter.value);
      return filter.operator === "none of" ? negate(node) : node;
    }
    case "null": {
      const id = columnIdOf(filter.column);
      if (id === null) return null;
      const node = filterNode("has", "=", [id]);
      return filter.operator === "is null" ? negate(node) : node;
    }
    default:
      return null;
  }
}

export type FilterStateToQueryResult = {
  text: string;
  /** Human-readable descriptions of filters that have no grammar form. */
  skipped: string[];
  /** The actual filter objects that have no grammar form. The container
   *  preserves these across a bar commit so they are never silently dropped
   *  (the bar can't display them, but it must not wipe them either). */
  skippedFilters: FilterState;
};

export type FilterStateToQueryOptions = {
  /** Global full-text query — rendered as bare text or a scoped field token. */
  searchQuery?: string | null;
  /** Search scope — rendered as content:/input:/output: when non-default;
   *  the default (`["id"]`/empty) renders as bare free text. */
  searchType?: TracingSearchType[] | null;
};

// The default full-text scope (ids & names), rendered as bare free text.
// astToFilterState returns `null` searchType for a query with no scope field;
// the sync layer maps that back to this default.
const DEFAULT_SEARCH_TYPE = "id";

function isDefaultSearchType(
  searchType: TracingSearchType[] | null | undefined,
): boolean {
  return (
    searchType == null ||
    searchType.length === 0 ||
    (searchType.length === 1 && searchType[0] === DEFAULT_SEARCH_TYPE)
  );
}

// The bar field that expresses a non-default search scope: content (input +
// output, or both selected) → the content: pseudo; input/output alone → their
// real text columns; id / empty → null (the default, rendered as bare text).
function scopedSearchField(
  searchType: TracingSearchType[] | null | undefined,
): "content" | "input" | "output" | null {
  if (isDefaultSearchType(searchType)) return null;
  const set = new Set(searchType ?? []);
  if (set.has("content") || (set.has("input") && set.has("output")))
    return "content";
  if (set.has("input")) return "input";
  if (set.has("output")) return "output";
  return null;
}

export function filterStateToQueryText(
  filters: FilterState,
  options: FilterStateToQueryOptions = {},
): FilterStateToQueryResult {
  const nodes: ASTNode[] = [];
  const skipped: string[] = [];
  const skippedFilters: FilterState = [];
  for (const filter of filters) {
    const node = lowerSingle(filter);
    if (node === null) {
      skipped.push(`${filter.column} (${filter.type} ${filter.operator})`);
      skippedFilters.push(filter);
      continue;
    }
    nodes.push(node);
  }

  // Full-text search. A non-default scope bundles the whole query into one
  // scoped token: `content:"…"` (input + output) reparses to searchType=content;
  // `input:"…"`/`output:"…"` reparse to their real column filters (so a legacy
  // input/output searchType normalizes to a column filter on the next commit —
  // the deliberate (a) canonicalization). The default scope (ids & names) is a
  // single contiguous-substring phrase (ILIKE %query%), so it renders as ONE
  // token — quoted iff it has whitespace via serializeValue. NOT whitespace-
  // split: separate tokens would misleadingly read as independent AND terms,
  // disagree with the scope-rewrite suggestions (which serialize the whole
  // phrase), and strip a user's own quotes on every derive.
  const searchQuery = options.searchQuery?.trim() ?? "";
  if (searchQuery.length > 0) {
    const scopeField = scopedSearchField(options.searchType);
    if (scopeField !== null) {
      nodes.push({
        kind: "filter",
        key: scopeField,
        op: "=",
        values: [searchQuery],
      });
    } else {
      nodes.push({ kind: "text", value: searchQuery });
    }
  }

  const ast: ASTNode | null =
    nodes.length === 0
      ? null
      : nodes.length === 1
        ? nodes[0]!
        : { kind: "and", children: nodes };
  return { text: serialize(ast), skipped, skippedFilters };
}
