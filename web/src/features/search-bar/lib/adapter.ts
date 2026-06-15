// Editor AST → flat Langfuse filter contract.
//
//   astToFilterState(ast) -> { filters, searchQuery, searchType, errors }
//
// Today's events table contract is a flat array of single filters joined
// with AND (`eventsTableFilterState`), plus a global full-text
// searchQuery/searchType pair. The grammar can parse more (cross-field OR,
// nested groups); everything the flat contract cannot represent produces an
// explicit error here — never silent dropping. validate.ts runs the same
// checks with source spans as the commit gate, so anything committed is
// guaranteed to lower.
//
// Rules:
// - Top-level AND chain: bare text nodes become searchQuery terms; `in:`
//   nodes become the request searchType (scopes for those terms); everything
//   else lowers into one or more single filters.
// - A top-level OR of same-field `key:v` equalities collapses to one any-of
//   filter (`level:ERROR OR level:WARNING` === `level:(ERROR OR WARNING)`).
//   Any other OR/nested group is not representable.
// - NOT lowers at this boundary (none-of / does-not-contain / inverted
//   comparisons / inverted booleans); gaps error via fields.negationIssue.

import { type FilterState, type TracingSearchType } from "@langfuse/shared";

import type { ASTNode, FilterNode } from "./ast";
import {
  isDanglingDotPrefix,
  negationIssue,
  operatorIssue,
  resolveField,
  SCORE_COLUMNS,
  SEARCH_SCOPES,
  type FieldDef,
} from "./fields";

export type SingleEventsFilter = FilterState[number];

export type AstToFilterStateResult = {
  filters: FilterState;
  searchQuery: string | null;
  /** Scopes from `in:` tokens; null = caller's default. */
  searchType: TracingSearchType[] | null;
  errors: string[];
};

/**
 * Observed score names by type, so `scores.<name>:<value>` lowers to the right
 * column. A categorical score can have numeric-looking labels (1–5 ratings,
 * 0–10 NPS), so we cannot infer the column from value syntax alone — when the
 * name is known categorical it must hit `score_categories`, not `scores_avg`.
 * Absent/unknown names fall back to the value-syntax heuristic.
 */
export type ScoreTypeContext = {
  numericScoreNames?: ReadonlySet<string>;
  categoricalScoreNames?: ReadonlySet<string>;
  traceNumericScoreNames?: ReadonlySet<string>;
  traceCategoricalScoreNames?: ReadonlySet<string>;
};

function resolveScoreType(
  ctx: ScoreTypeContext | undefined,
  level: "observation" | "trace",
  name: string,
): "numeric" | "categorical" | "both" | "unknown" {
  if (ctx === undefined) return "unknown";
  const numeric =
    level === "trace" ? ctx.traceNumericScoreNames : ctx.numericScoreNames;
  const categorical =
    level === "trace"
      ? ctx.traceCategoricalScoreNames
      : ctx.categoricalScoreNames;
  const isNum = numeric?.has(name) ?? false;
  const isCat = categorical?.has(name) ?? false;
  if (isNum && isCat) return "both";
  if (isNum) return "numeric";
  if (isCat) return "categorical";
  return "unknown";
}

function isInFilter(node: ASTNode): node is FilterNode {
  if (node.kind !== "filter") return false;
  const ref = resolveField(node.key);
  return ref !== null && ref.type === "pseudo" && ref.id === "in";
}

/**
 * A top-level OR whose children are all same-field single-value `=` filters
 * collapses to one any-of filter node. Null otherwise.
 */
function collapseSameFieldOr(node: ASTNode): FilterNode | null {
  if (node.kind !== "or") return null;
  const filters = node.children.filter(
    (c): c is FilterNode => c.kind === "filter",
  );
  if (filters.length !== node.children.length || filters.length < 2)
    return null;
  const first = filters[0]!;
  if (first.op !== "=" || first.values.length !== 1) return null;
  for (const f of filters) {
    if (f.key !== first.key || f.op !== "=" || f.values.length !== 1)
      return null;
  }
  return {
    kind: "filter",
    key: first.key,
    op: "=",
    values: filters.flatMap((f) => f.values),
    valueOp: "or",
  };
}

type LowerContext = {
  filters: SingleEventsFilter[];
  searchTerms: string[];
  scopes: TracingSearchType[];
  errors: string[];
  scoreTypes?: ScoreTypeContext;
};

export function astToFilterState(
  ast: ASTNode | null,
  scoreTypes?: ScoreTypeContext,
): AstToFilterStateResult {
  const ctx: LowerContext = {
    filters: [],
    searchTerms: [],
    scopes: [],
    errors: [],
    scoreTypes,
  };

  if (ast !== null) lowerTopLevel(ast, false, ctx);

  return {
    filters: ctx.filters,
    searchQuery: ctx.searchTerms.length > 0 ? ctx.searchTerms.join(" ") : null,
    searchType: ctx.scopes.length > 0 ? ctx.scopes : null,
    errors: ctx.errors,
  };
}

function lowerIn(node: FilterNode, ctx: LowerContext): void {
  for (const v of node.values) {
    const scope = v.toLowerCase();
    if ((SEARCH_SCOPES as readonly string[]).includes(scope)) {
      if (!ctx.scopes.includes(scope as TracingSearchType))
        ctx.scopes.push(scope as TracingSearchType);
    } else {
      ctx.errors.push(`in: expects ${SEARCH_SCOPES.join(", ")} — got "${v}"`);
    }
  }
}

// AND chains (top-level or parenthesized — semantically identical in the
// flat contract) accept free text (-> searchQuery) and `in:` (-> searchType).
function lowerTopLevel(
  node: ASTNode,
  negated: boolean,
  ctx: LowerContext,
): void {
  switch (node.kind) {
    case "text":
      if (negated) {
        ctx.errors.push(
          `Free text "${node.value}" cannot be negated — search text is global`,
        );
        return;
      }
      // A bare dot-prefix (`metadata.`, `scores.`, …) parses as free text, so
      // committing it would silently set searchQuery to the prefix. Reject it
      // here so every commit path (typed Enter and structured pick) is gated.
      // Quoted text is an explicit literal search and is allowed.
      if (!node.quoted && isDanglingDotPrefix(node.value)) {
        ctx.errors.push(
          `Incomplete field "${node.value}" — add a key after the dot (e.g. metadata.region:eu)`,
        );
        return;
      }
      ctx.searchTerms.push(node.value);
      return;
    case "not":
      lowerTopLevel(node.child, !negated, ctx);
      return;
    case "and": {
      if (negated) {
        // NOT(a AND b) would need OR — not representable in the flat contract.
        ctx.errors.push(
          "Negated groups are not supported — negate individual filters instead (e.g. -env:dev)",
        );
        return;
      }
      // Nested parenthesized AND groups flatten into the top-level chain.
      for (const c of node.children) lowerTopLevel(c, false, ctx);
      return;
    }
    case "or": {
      const collapsed = collapseSameFieldOr(node);
      if (collapsed !== null) {
        lowerFilter(
          collapsed,
          negated,
          ctx.filters,
          ctx.errors,
          ctx.scoreTypes,
        );
        return;
      }
      ctx.errors.push(
        "OR between different filters is not supported — filters combine with AND; use field:(a OR b) for any-of values",
      );
      return;
    }
    case "filter":
      if (isInFilter(node)) {
        if (negated) {
          ctx.errors.push(
            "in: cannot be negated — pick the scopes to search instead",
          );
          return;
        }
        lowerIn(node, ctx);
        return;
      }
      lowerFilter(node, negated, ctx.filters, ctx.errors, ctx.scoreTypes);
      return;
  }
}

function lowerFilter(
  node: FilterNode,
  negated: boolean,
  out: SingleEventsFilter[],
  errors: string[],
  scoreTypes?: ScoreTypeContext,
): void {
  if (node.values.length === 0) {
    errors.push(`Filter "${node.key}" has no value`);
    return;
  }

  const ref = resolveField(node.key);
  if (ref === null) {
    errors.push(`Unknown field "${node.key}"`);
    return;
  }

  const opIssue = operatorIssue(ref, node.op, node.valueOp ?? "or");
  if (opIssue !== null) {
    errors.push(opIssue);
    return;
  }
  if (negated) {
    const negIssue = negationIssue(ref, node.op, node.valueOp ?? "or");
    if (negIssue !== null) {
      errors.push(negIssue);
      return;
    }
  }

  switch (ref.type) {
    case "pseudo":
      if (ref.id === "has") {
        lowerHas(node, negated, out, errors);
        return;
      }
      // `in:` is consumed at the top level; nested it is not representable.
      errors.push(
        "in: applies to the whole search — it cannot be used inside groups or negations",
      );
      return;
    case "metadata":
      lowerMetadata(node, ref.key, negated, out, errors);
      return;
    case "scores":
      lowerScores(node, ref.key, ref.level, negated, out, errors, scoreTypes);
      return;
    case "field":
      switch (ref.field.kind) {
        case "number":
          lowerNumber(node, ref.field, negated, out, errors);
          return;
        case "datetime":
          lowerDatetime(node, ref.field, negated, out, errors);
          return;
        case "boolean":
          lowerBoolean(node, ref.field, negated, out, errors);
          return;
        case "text":
          lowerText(node, ref.field, negated, out, errors);
          return;
      }
  }
}

/** AST string op -> Langfuse string filter operator (positive polarity). */
function stringOperatorOf(
  op: FilterNode["op"],
): "contains" | "=" | "starts with" | "ends with" | null {
  switch (op) {
    case "~":
      return "contains";
    case "exact":
      return "=";
    case "^":
      return "starts with";
    case "$":
      return "ends with";
    default:
      return null;
  }
}

function lowerText(
  node: FilterNode,
  field: FieldDef,
  negated: boolean,
  out: SingleEventsFilter[],
  errors: string[],
): void {
  if (node.op === "~") {
    // Multiple contains on one field would be any-of (OR) — not flat.
    // Negated multi-value IS flat: AND of does-not-contain.
    if (!negated && node.values.length > 1) {
      errors.push(
        `"${field.id}" supports a single ~value — multiple contains terms cannot be combined with OR in the filter contract`,
      );
      return;
    }
    for (const v of node.values) {
      out.push({
        type: "string",
        column: field.id,
        operator: negated ? "does not contain" : "contains",
        value: v,
      });
    }
    return;
  }

  if (node.op === "^" || node.op === "$") {
    // negationIssue blocks negated forms before this point.
    if (node.values.length > 1) {
      errors.push(`"${field.id}" supports a single ${node.op}value`);
      return;
    }
    out.push({
      type: "string",
      column: field.id,
      operator: stringOperatorOf(node.op)!,
      value: node.values[0]!,
    });
    return;
  }

  if (node.op === "exact" && field.syncMode === "textSearch") {
    // negationIssue blocks the negated case before we get here.
    if (node.values.length > 1) {
      // Multiple exact values are any-of: representable via stringOptions.
      out.push({
        type: "stringOptions",
        column: field.id,
        operator: "any of",
        value: node.values,
      });
      return;
    }
    out.push({
      type: "string",
      column: field.id,
      operator: "=",
      value: node.values[0]!,
    });
    return;
  }

  // '=' default and 'exact' on option-backed fields: any-of / none-of.
  if (field.syncMode === "arrayOption") {
    if (node.valueOp === "and") {
      // negationIssue blocks negated all-of groups before this point.
      out.push({
        type: "arrayOptions",
        column: field.id,
        operator: "all of",
        value: node.values,
      });
      return;
    }
    out.push({
      type: "arrayOptions",
      column: field.id,
      operator: negated ? "none of" : "any of",
      value: node.values,
    });
    return;
  }
  if (field.syncMode === "exactOption") {
    out.push({
      type: "stringOptions",
      column: field.id,
      operator: negated ? "none of" : "any of",
      value: node.values,
    });
    return;
  }
  // textSearch fields: bare equality means "contains" (search semantics);
  // `key:=value` above is the explicit exact match. Grouped values lower to
  // stringOptions any-of/none-of (exact semantics — string columns accept
  // stringOptions filters in the contract).
  if (node.values.length > 1) {
    out.push({
      type: "stringOptions",
      column: field.id,
      operator: negated ? "none of" : "any of",
      value: node.values,
    });
    return;
  }
  out.push({
    type: "string",
    column: field.id,
    operator: negated ? "does not contain" : "contains",
    value: node.values[0]!,
  });
}

const INVERTED_COMPARISON = {
  ">": "<=",
  "<": ">=",
  ">=": "<",
  "<=": ">",
} as const;

type ComparisonOp = keyof typeof INVERTED_COMPARISON;

function isComparison(op: FilterNode["op"]): op is ComparisonOp {
  return op === ">" || op === "<" || op === ">=" || op === "<=";
}

function parseNumbers(
  node: FilterNode,
  label: string,
  errors: string[],
): number[] | null {
  // Number("") and Number(" ") are both 0 (finite), so guard empty/whitespace
  // explicitly — otherwise `latency:""` would silently filter for latency = 0.
  const bad = node.values.find(
    (v) => v.trim().length === 0 || !Number.isFinite(Number(v)),
  );
  if (bad !== undefined) {
    errors.push(`"${label}" expects a number, got "${bad}"`);
    return null;
  }
  return node.values.map((v) => Number(v));
}

function lowerNumber(
  node: FilterNode,
  field: FieldDef,
  negated: boolean,
  out: SingleEventsFilter[],
  errors: string[],
): void {
  const numbers = parseNumbers(node, field.id, errors);
  if (numbers === null) return;

  if (node.op === "=" || node.op === "exact") {
    // negationIssue blocks negated equality (needs < OR >) before this point.
    if (numbers.length > 1) {
      errors.push(
        `"${field.id}" expects a single value — any-of number lists are not supported`,
      );
      return;
    }
    out.push({
      type: "number",
      column: field.id,
      operator: "=",
      value: numbers[0]!,
    });
    return;
  }

  if (!isComparison(node.op)) {
    errors.push(`"${field.id}" does not support ${node.op}`);
    return;
  }
  out.push({
    type: "number",
    column: field.id,
    operator: negated ? INVERTED_COMPARISON[node.op] : node.op,
    value: numbers[0]!,
  });
}

function lowerDatetime(
  node: FilterNode,
  field: FieldDef,
  negated: boolean,
  out: SingleEventsFilter[],
  errors: string[],
): void {
  if (!isComparison(node.op)) {
    errors.push(
      `"${field.id}" is a datetime field — use a comparison (e.g. ${field.id}:>2026-06-01)`,
    );
    return;
  }
  const raw = node.values[0]!;
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) {
    errors.push(`"${field.id}" expects an ISO date, got "${raw}"`);
    return;
  }
  out.push({
    type: "datetime",
    column: field.id,
    operator: negated ? INVERTED_COMPARISON[node.op] : node.op,
    value: new Date(ms),
  });
}

function lowerBoolean(
  node: FilterNode,
  field: FieldDef,
  negated: boolean,
  out: SingleEventsFilter[],
  errors: string[],
): void {
  if ((node.op !== "=" && node.op !== "exact") || node.values.length !== 1) {
    errors.push(`"${field.id}" expects exactly one of true/false`);
    return;
  }
  const raw = node.values[0]!.toLowerCase();
  if (raw !== "true" && raw !== "false") {
    errors.push(`"${field.id}" expects true or false, got "${node.values[0]}"`);
    return;
  }
  const value = raw === "true";
  out.push({
    type: "boolean",
    column: field.id,
    operator: "=",
    value: negated ? !value : value,
  });
}

/**
 * Metadata dot-paths lower to stringObject filters (the only metadata filter
 * shape in the contract): single value, string ops, FTS matches.
 */
function lowerMetadata(
  node: FilterNode,
  key: string,
  negated: boolean,
  out: SingleEventsFilter[],
  errors: string[],
): void {
  if (node.values.length > 1) {
    errors.push(
      `metadata.${key} supports a single value — any-of metadata groups are not supported`,
    );
    return;
  }
  const value = node.values[0]!;

  if (node.op === "~") {
    out.push({
      type: "stringObject",
      column: "metadata",
      key,
      operator: negated ? "does not contain" : "contains",
      value,
    });
    return;
  }
  if (node.op === "^" || node.op === "$") {
    // negationIssue blocks negated forms before this point.
    out.push({
      type: "stringObject",
      column: "metadata",
      key,
      operator: stringOperatorOf(node.op)!,
      value,
    });
    return;
  }
  // '=' default and 'exact': exact match. Negated equality is blocked by
  // negationIssue for 'exact'; for '=' there is no "does not equal" either —
  // surface the same suggestion.
  if (negated) {
    errors.push(
      `negated equality on metadata is not representable — use -metadata.${key}:~value (does not contain)`,
    );
    return;
  }
  out.push({
    type: "stringObject",
    column: "metadata",
    key,
    operator: "=",
    value,
  });
}

/**
 * Score dot-paths: comparisons and numeric values target the numeric score
 * column (numberObject keyed by score name); non-numeric values target the
 * categorical column (categoryOptions any-of/none-of).
 */
function lowerScores(
  node: FilterNode,
  key: string,
  level: "observation" | "trace",
  negated: boolean,
  out: SingleEventsFilter[],
  errors: string[],
  scoreTypes?: ScoreTypeContext,
): void {
  const columns = SCORE_COLUMNS[level];
  const path = level === "trace" ? `traceScores.${key}` : `scores.${key}`;

  const lowerNumeric = (): void => {
    const numbers = parseNumbers(node, path, errors);
    if (numbers === null) return;
    if (node.op === "=" || node.op === "exact") {
      if (negated) {
        errors.push(
          `negated numeric score equality is not representable — use comparisons (${path}:<n or ${path}:>n)`,
        );
        return;
      }
      if (numbers.length > 1) {
        errors.push(
          `${path} expects a single numeric value — any-of number lists are not supported`,
        );
        return;
      }
      out.push({
        type: "numberObject",
        column: columns.numeric,
        key,
        operator: "=",
        value: numbers[0]!,
      });
      return;
    }
    out.push({
      type: "numberObject",
      column: columns.numeric,
      key,
      operator: negated
        ? INVERTED_COMPARISON[node.op as ComparisonOp]
        : (node.op as ComparisonOp),
      value: numbers[0]!,
    });
  };

  const pushCategory = (): void => {
    out.push({
      type: "categoryOptions",
      column: columns.categorical,
      key,
      operator: negated ? "none of" : "any of",
      value: node.values,
    });
  };

  // Route by observed score TYPE when we know it — a categorical score with
  // numeric labels (e.g. a 1–5 rating) must hit the categorical column, not
  // scores_avg, or it silently targets a column with no data.
  const scoreType = resolveScoreType(scoreTypes, level, key);
  if (scoreType === "categorical") {
    // Comparisons (> < >= <=) are meaningless on a category. But exact (`:=x`)
    // and the bare `=` form are both just an exact category match, so they
    // lower to categoryOptions exactly like `scores.<name>:x`.
    if (isComparison(node.op)) {
      errors.push(
        `${path} is categorical — comparison operators only apply to numeric scores`,
      );
      return;
    }
    pushCategory();
    return;
  }

  // Numeric / unknown: comparisons and exact target the numeric column.
  if (isComparison(node.op) || node.op === "exact") {
    lowerNumeric();
    return;
  }

  // '=' default: numeric when known-numeric, else value-syntax fallback
  // (all-numeric → numeric) for unknown/both.
  const allNumeric = node.values.every((v) => Number.isFinite(Number(v)));
  if (scoreType === "numeric" || allNumeric) {
    lowerNumeric();
    return;
  }
  pushCategory();
}

/** `has:field` -> is-not-null; `-has:field` -> is-null. */
function lowerHas(
  node: FilterNode,
  negated: boolean,
  out: SingleEventsFilter[],
  errors: string[],
): void {
  if (node.values.length > 1 && !negated) {
    // has:(a OR b) would be an OR of null checks — not flat. The negated
    // form De-Morgans to an AND of is-null, which IS flat.
    errors.push(
      "has: accepts a single field — combine multiple has: filters with AND instead",
    );
    return;
  }
  for (const v of node.values) {
    const target = resolveField(v);
    if (target === null || target.type !== "field") {
      errors.push(`has: expects a field name, got "${v}"`);
      continue;
    }
    out.push({
      type: "null",
      column: target.field.id,
      operator: negated ? "is null" : "is not null",
      value: "",
    });
  }
}
