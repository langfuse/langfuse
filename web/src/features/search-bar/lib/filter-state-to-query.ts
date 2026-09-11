// Reverse adapter: flat Langfuse `FilterState` (+ full-text searchQuery and
// searchType scopes) → query text.
//
// Drives the bar/sidebar sync: the facet sidebar owns the canonical
// `FilterState`, and whenever it changes the search bar re-seeds its text from
// here. Builds editor AST nodes and reuses the canonical serializer, so the
// produced text always reparses and round-trips through astToFilterState back
// to an equivalent flat filter list + search. Filters that have no grammar
// form (e.g. positionInTrace) are reported in `skipped`, never silently
// dropped.

import { type FilterState, type TracingSearchType } from "@langfuse/shared";

import {
  INVERTED_COMPARISON,
  resolveScoreType,
  type ScoreTypeContext,
} from "./adapter";
import type { ASTNode, FilterNode } from "./ast";
import {
  EVENTS_FIELD_REGISTRY,
  SCORE_COLUMNS,
  type FieldRef,
  type FieldRegistry,
} from "./fields";
import { serialize } from "./langQ";
import { quoteIfNeeded } from "./quoting";

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

function scorePathOf(
  column: string,
  key: string,
  registry: FieldRegistry,
): string | null {
  // A view can own score filters in its sidebar without exposing them in the
  // bar. Emitting the path anyway would render text the parser rejects as an
  // unknown field, so a score space the registry does not expose is left to the
  // sidebar — reported as skipped, and preserved across commits.
  //
  // Quote the score name iff it has grammar chars so it re-lexes as one token
  // (`scores."Rouge Score"`); resolveField unquotes it on the way back.
  if (
    column === SCORE_COLUMNS.observation.numeric ||
    column === SCORE_COLUMNS.observation.categorical ||
    column === SCORE_COLUMNS.observation.boolean
  ) {
    return registry.scores ? `scores.${quoteIfNeeded(key)}` : null;
  }
  if (
    column === SCORE_COLUMNS.trace.numeric ||
    column === SCORE_COLUMNS.trace.categorical ||
    column === SCORE_COLUMNS.trace.boolean
  ) {
    return registry.traceScores ? `traceScores.${quoteIfNeeded(key)}` : null;
  }
  return null;
}

const STRING_OP_SYMBOL: Record<string, FilterNode["op"]> = {
  "=": "exact",
  contains: "~",
  "starts with": "^",
  "ends with": "$",
};

function lowerSingle(
  filter: FilterState[number],
  registry: FieldRegistry,
): ASTNode | null {
  switch (filter.type) {
    case "stringOptions":
    case "arrayOptions": {
      let id = registry.columnIdOf(filter.column);
      if (id === null || filter.value.length === 0) return null;
      let values = filter.value;
      let ref = registry.resolveField(id);
      const displayValueByFilterValue =
        ref?.type === "field" ? ref.field.displayValueByFilterValue : undefined;
      if (displayValueByFilterValue !== undefined) {
        const displayValues = filter.value.map((value) =>
          displayValueByFilterValue.get(value),
        );
        if (displayValues.every((value) => value !== undefined)) {
          values = displayValues as string[];
        } else {
          // A deleted option has no label mapping. Keep its canonical field and
          // value so the filter remains visible and round-trips losslessly.
          id = filter.column;
          ref = registry.resolveField(id);
        }
      }
      // A stringOptions/arrayOptions filter is EXACT-set semantics. On a
      // `textSearch` field (id/name) the bar reads a bare single value as
      // `contains`, so a single-value any-of/none-of would silently flip
      // exact→substring on the next commit. The single-value forms therefore use
      // the explicit exact operator (`name:=abc` / `-name:=abc`); the grouped
      // multi-value forms already reparse to exact any-of/none-of.
      const isTextSearch =
        ref?.type === "field" && ref.field.syncMode === "textSearch";
      if (filter.operator === "none of") {
        // On a textSearch field a single none-of is exact-inequality: emit the
        // negated exact form (`-name:=abc`), which lowers back to stringOptions
        // none-of — NOT the bare `-name:abc`, which is does-not-contain
        // (substring). The grouped/option forms use the bare `=` any-of shape.
        if (isTextSearch && filter.value.length === 1) {
          return negate(filterNode(id, "exact", values));
        }
        return negate(filterNode(id, "=", values));
      }
      if (filter.operator === "all of") {
        // A single-value all-of has no distinct grammar form — `(a)` reparses
        // as any-of, so emitting it would silently flip the operator shape on
        // the next commit. Skip it (preserved via skippedFilters) rather than
        // rewrite; multi-value all-of serializes to the `(a AND b)` group.
        if (filter.value.length < 2) return null;
        return filterNode(id, "=", values, "and");
      }
      // Single-value any-of on a textSearch field: emit the explicit exact form
      // (`id:=abc`) so it round-trips to `{string,=}` (exact preserved), not the
      // bare `id:abc` that would re-lower to `contains`.
      if (isTextSearch && filter.value.length === 1) {
        return filterNode(id, "exact", values);
      }
      return filterNode(id, "=", values);
    }
    case "string": {
      const directRef = registry.resolveField(filter.column);
      const id =
        directRef?.type === "field"
          ? directRef.field.id
          : registry.columnIdOf(filter.column);
      if (id === null) return null;
      if (filter.operator === "does not contain") {
        // Mirror the positive contains carve-out below: a textSearch field emits
        // the bare `-input:refund`, not the `-input:*refund*` glob, so the
        // negated form round-trips stably (no visible rewrite on commit echo).
        const ref = registry.resolveField(id);
        if (ref?.type === "field" && ref.field.syncMode === "textSearch") {
          return negate(filterNode(id, "=", [filter.value]));
        }
        return negate(filterNode(id, "~", [filter.value]));
      }
      const op = STRING_OP_SYMBOL[filter.operator];
      if (op === undefined) return null;
      // '=' on option-backed fields reads better as the bare any-of form.
      if (op === "exact") {
        const ref = registry.resolveField(id);
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
        const ref = registry.resolveField(id);
        if (ref?.type === "field" && ref.field.syncMode === "textSearch") {
          return filterNode(id, "=", [filter.value]);
        }
      }
      return filterNode(id, op, [filter.value]);
    }
    case "number": {
      const id = registry.columnIdOf(filter.column);
      if (id === null) return null;
      const op = filter.operator === "=" ? "=" : filter.operator;
      return filterNode(id, op, [String(filter.value)]);
    }
    case "datetime": {
      const id = registry.columnIdOf(filter.column);
      if (id === null) return null;
      const value =
        filter.value instanceof Date
          ? filter.value.toISOString()
          : String(filter.value);
      return filterNode(id, filter.operator, [value]);
    }
    case "boolean": {
      const id = registry.columnIdOf(filter.column);
      if (id === null) return null;
      const value = filter.operator === "<>" ? !filter.value : filter.value;
      return filterNode(id, "=", [String(value)]);
    }
    case "stringObject": {
      const id = registry.columnIdOf(filter.column);
      if (id !== "metadata") return null;
      // A key with grammar chars (`:`, space, …) is quoted so it re-lexes as one
      // token (`metadata."my key"`); resolveField unquotes it on the way back.
      const key = `metadata.${quoteIfNeeded(filter.key)}`;
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
      const path = scorePathOf(filter.column, filter.key, registry);
      if (path === null) return null;
      const op = filter.operator === "=" ? "=" : filter.operator;
      return filterNode(path, op, [String(filter.value)]);
    }
    case "booleanObject": {
      const path = scorePathOf(filter.column, filter.key, registry);
      if (path === null) return null;
      const node = filterNode(path, "=", [String(filter.value)]);
      return filter.operator === "<>" ? negate(node) : node;
    }
    case "categoryOptions": {
      const path = scorePathOf(filter.column, filter.key, registry);
      if (path === null || filter.value.length === 0) return null;
      const node = filterNode(path, "=", filter.value);
      return filter.operator === "none of" ? negate(node) : node;
    }
    case "null": {
      const id = registry.columnIdOf(filter.column);
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
  /** Exact backend search lanes, projected through the host's registry. */
  searchType?: TracingSearchType[] | null;
};

function sameSearchTypes(
  a: readonly TracingSearchType[],
  b: readonly TracingSearchType[],
): boolean {
  return (
    new Set(a).size === new Set(b).size && a.every((type) => b.includes(type))
  );
}

export function filterStateToQueryText(
  filters: FilterState,
  options: FilterStateToQueryOptions = {},
  registry: FieldRegistry = EVENTS_FIELD_REGISTRY,
): FilterStateToQueryResult {
  const nodes: ASTNode[] = [];
  const skipped: string[] = [];
  const skippedFilters: FilterState = [];
  for (const filter of filters) {
    const node = lowerSingle(filter, registry);
    if (node === null) {
      skipped.push(`${filter.column} (${filter.type} ${filter.operator})`);
      skippedFilters.push(filter);
      continue;
    }
    nodes.push(node);
  }

  // One backend phrase can target several columns. Preserve the exact scope
  // set: a legacy additive scope cannot become a payload-only column filter.
  const searchQuery = options.searchQuery ?? "";
  if (searchQuery.trim().length > 0) {
    const searchType = options.searchType?.length
      ? options.searchType
      : registry.defaultSearchType;
    const isDefault = sameSearchTypes(searchType, registry.defaultSearchType);
    const scopeField = Object.entries(registry.searchScopes).find(([, scope]) =>
      sameSearchTypes(searchType, scope.searchType),
    )?.[0];
    if (!isDefault && scopeField !== undefined) {
      nodes.push({
        kind: "filter",
        key: scopeField,
        op: "=",
        values: [searchQuery],
      });
    } else {
      if (!isDefault) {
        nodes.push({
          kind: "filter",
          key: "in",
          op: "=",
          values: [...searchType],
        });
      }
      nodes.push({ kind: "text", value: searchQuery });
    }
  }

  const ast: ASTNode | null =
    nodes.length === 0
      ? null
      : nodes.length === 1
        ? nodes[0]!
        : { kind: "and", children: nodes };
  return { text: serialize(ast, registry), skipped, skippedFilters };
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
  registry: FieldRegistry = EVENTS_FIELD_REGISTRY,
): ASTNode | null {
  if (node === null) return null;
  switch (node.kind) {
    case "not": {
      const child =
        foldDerivedNegation(node.child, scoreTypes, registry) ?? node.child;
      if (child.kind === "filter") {
        const folded = foldNegatedFilter(child, registry);
        if (folded !== null) return folded;
      }
      return { ...node, child };
    }
    case "and":
    case "or":
      return {
        ...node,
        children: node.children.map(
          (c) => foldDerivedNegation(c, scoreTypes, registry) ?? c,
        ),
      };
    case "filter":
      return normalizeFilterValues(node, scoreTypes, registry);
    default:
      return node;
  }
}

// Canonicalize a positive filter's op + values the same way the lowering + reverse
// derive do, so the typed form compares equal to the re-derived committed form.
function normalizeFilterValues(
  f: FilterNode,
  scoreTypes?: ScoreTypeContext,
  registry: FieldRegistry = EVENTS_FIELD_REGISTRY,
): FilterNode {
  const ref = registry.resolveField(f.key);
  if (ref === null) return f;
  // `:=` (exact) folds to `:` (=) everywhere the two lower identically.
  let op: FilterNode["op"] =
    f.op === "exact" && exactEqualsBareForm(ref) ? "=" : f.op;
  // On a textSearch text field, the explicit contains glob `*v*` (op `~`) and
  // the bare form `v` (op `=`) lower to the IDENTICAL contains filter, and the
  // reverse adapter emits the bare form — so fold a single-value `~` to `=` too.
  // Otherwise typing/picking `input:*foo*` (or `id:*foo*`, `name:*foo*`) is
  // silently rewritten to `input:foo` on the commit echo. Inverse condition to
  // the `exact` fold above (which excludes textSearch).
  if (
    op === "~" &&
    f.values.length === 1 &&
    ref.type === "field" &&
    ref.field.kind === "text" &&
    ref.field.syncMode === "textSearch"
  ) {
    op = "=";
  }
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
    if (resolveScoreType(scoreTypes, ref.level, ref.key) === "boolean")
      return values.map((v) => v.toLowerCase());
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
function foldNegatedFilter(
  f: FilterNode,
  registry: FieldRegistry,
): FilterNode | null {
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
    const ref = registry.resolveField(f.key);
    if (ref?.type === "field" && ref.field.kind === "boolean") {
      const v = f.values[0]!;
      if (v === "true" || v === "false") {
        return { ...f, op: "=", values: [v === "true" ? "false" : "true"] };
      }
    }
  }
  return null;
}
