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

import {
  INVERTED_COMPARISON,
  resolveScoreType,
  type ScoreTypeContext,
} from "./adapter";
import type { ASTNode, FilterNode } from "./ast";
import { resolveField, SCORE_COLUMNS, type FieldRef } from "./fields";
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
        // Mirror the positive contains carve-out below: a textSearch field emits
        // the bare `-input:refund`, not the `-input:*refund*` glob, so the
        // negated form round-trips stably (no visible rewrite on commit echo).
        const ref = resolveField(id);
        if (ref?.type === "field" && ref.field.syncMode === "textSearch") {
          return negate(filterNode(id, "=", [filter.value]));
        }
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
      // Bare `field:value` is the documented contains-default for textSearch
      // fields, so emit it bare rather than the `*value*` glob — otherwise the
      // commit echo visibly rewrites the user's typed `input:refund` to
      // `input:*refund*` (op `=` vs `~` aren't astEqual, so resetTo re-seeds).
      // Symmetric inverse of the metadata-equality carve-out.
      if (op === "~") {
        const ref = resolveField(id);
        if (ref?.type === "field" && ref.field.syncMode === "textSearch") {
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

// Normalize an editor AST so a typed draft compares equal (via astEquals) to the
// canonical text the reverse adapter above re-derives, letting the typed form
// stand instead of being clobbered on the commit echo. Three equivalences the
// adapter introduces by lowering + re-deriving are reconciled here:
//
//   - VALUE FORMAT (positive or negated): the lowering canonicalizes boolean
//     case (`TRUE`→`true`), numeric format (`2.0`→`2`, `.5`→`0.5`, `2.5e1`→`25`),
//     and datetime to full ISO — so the derived text differs from what was typed.
//   - EXACT-OP (`:=` ↔ `:`): for every field except textSearch, `key:=value`
//     and `key:value` lower to the IDENTICAL filter and the reverse adapter emits
//     the bare `=` form — so a typed `level:=ERROR` must fold to match it.
//   - NEGATION FOLD: `-` is folded into the value/operator (`-num:>2`→`num:<=2`,
//     `-bool:true`→`bool:false`), leaving no NOT in FilterState to re-derive.
//
// The store's `resetTo` gate runs this on BOTH sides before astEquals, so typed
// forms like `latency:2.0` / `isRootObservation:TRUE` / `level:=ERROR` /
// `-latency:>2` stand — the same "no silent rewrite" carve-out already made for
// aliases/metadata. It preserves structure and order, so free-text
// canonicalization and alias casing are untouched. Negations WITHOUT a value/op
// fold (none-of, does-not-contain, is-null) keep their dash on re-derive, so
// they already round-trip and stay NOT.
export function foldDerivedNegation(
  node: ASTNode | null,
  scoreTypes?: ScoreTypeContext,
): ASTNode | null {
  if (node === null) return null;
  switch (node.kind) {
    case "not": {
      const child = foldDerivedNegation(node.child, scoreTypes) ?? node.child;
      if (child.kind === "filter") {
        const folded = foldNegatedFilter(child);
        if (folded !== null) return folded;
      }
      return { ...node, child };
    }
    case "and":
    case "or":
      return {
        ...node,
        children: node.children.map(
          (c) => foldDerivedNegation(c, scoreTypes) ?? c,
        ),
      };
    case "filter":
      return normalizeFilterValues(node, scoreTypes);
    default:
      return node;
  }
}

// Canonicalize a positive filter's op + values the same way the lowering + reverse
// derive do, so the typed form compares equal to the re-derived committed form.
function normalizeFilterValues(
  f: FilterNode,
  scoreTypes?: ScoreTypeContext,
): FilterNode {
  const ref = resolveField(f.key);
  if (ref === null) return f;
  // `:=` (exact) folds to `:` (=) everywhere the two lower identically.
  const op: FilterNode["op"] =
    f.op === "exact" && exactEqualsBareForm(ref) ? "=" : f.op;
  const values = normalizeValuesFor(ref, f.values, scoreTypes);
  return { ...f, op, values };
}

// Fields where `key:=value` and `key:value` lower to the identical filter (so
// the reverse adapter always emits the bare `=`). textSearch is excluded — there
// `:` is contains and `:=` is exact, two different ops — as is datetime, which
// has only comparison forms.
function exactEqualsBareForm(ref: FieldRef): boolean {
  if (ref.type === "metadata" || ref.type === "scores") return true;
  if (ref.type === "field") {
    const k = ref.field.kind;
    return (
      k === "number" ||
      k === "boolean" ||
      (k === "text" && ref.field.syncMode !== "textSearch")
    );
  }
  return false;
}

function normalizeValuesFor(
  ref: FieldRef,
  values: string[],
  scoreTypes?: ScoreTypeContext,
): string[] {
  if (ref.type === "field") {
    const k = ref.field.kind;
    if (k === "boolean") return values.map((v) => v.toLowerCase());
    if (k === "number") return values.map(normalizeNumberString);
    if (k === "datetime") return values.map(normalizeIsoString);
    return values; // text — verbatim
  }
  if (ref.type === "scores") {
    // Numeric / unknown scores get Number-canonicalized by lowerNumeric; a
    // known-CATEGORICAL score keeps its label verbatim (a numeric-looking label
    // like "2.0" must NOT be rewritten to "2"). normalizeNumberString only
    // touches finite-number strings, but gate on type so a decimal category is
    // never folded.
    if (resolveScoreType(scoreTypes, ref.level, ref.key) === "categorical")
      return values;
    return values.map(normalizeNumberString);
  }
  return values; // metadata text / pseudo — verbatim
}

function normalizeNumberString(v: string): string {
  const n = Number(v);
  return v.trim().length > 0 && Number.isFinite(n) ? String(n) : v;
}

function normalizeIsoString(v: string): string {
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? v : new Date(ms).toISOString();
}

// `f` arrives value-normalized (foldDerivedNegation normalizes the NOT's child
// before this runs), so only the op/boolean is inverted here.
function foldNegatedFilter(f: FilterNode): FilterNode | null {
  // Comparison: NOT (key op v) === key INVERT(op) v. Comparisons only validly
  // appear on numeric/datetime fields, so no field-kind check is needed.
  if (f.op in INVERTED_COMPARISON) {
    return {
      ...f,
      op: INVERTED_COMPARISON[f.op as keyof typeof INVERTED_COMPARISON],
    };
  }
  // Boolean equality: NOT (key = true) === key = false — but ONLY for a boolean
  // field. On an option field a "true" value lowers to a none-of, not a flip,
  // so it must keep its NOT (which round-trips with the dash anyway).
  if ((f.op === "=" || f.op === "exact") && f.values.length === 1) {
    const ref = resolveField(f.key);
    if (ref?.type === "field" && ref.field.kind === "boolean") {
      const v = f.values[0]!;
      if (v === "true" || v === "false") {
        return { ...f, op: "=", values: [v === "true" ? "false" : "true"] };
      }
    }
  }
  return null;
}
