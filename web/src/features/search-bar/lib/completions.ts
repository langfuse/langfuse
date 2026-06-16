// Completion planning — pure functions, zero React/DOM.
//
// Given the active input text + caret, produce a CompletionPlan the popover
// renders and the composer applies. Token boundaries come from the shared
// lexer (termAt / splitOutsideQuotes), so quoted phrases with spaces stay one
// token and colons/commas inside quotes never split stages.
//
// Every filter type gets a guided value stage — numbers/datetimes offer their
// operators with unit-aware examples, text fields offer the positional `*` glob
// match refinements (*v* contains, v* starts, *v ends, =v exact), metadata/
// scores suggest observed keys and values, has: enumerates its domain, and free
// text (plus content:/input:/output:) offers scoped full-text search rewrites.

import {
  indexOfOutsideQuotes,
  lexTokens,
  NEEDS_QUOTES,
  parseGlob,
  serializeValue,
  splitOutsideQuotes,
  termAt,
} from "./langQ";
import {
  FIELDS,
  nullableFields,
  resolveField,
  type FieldDef,
  type FieldRef,
} from "./fields";
import type { ObservedOptions } from "./observed-options";

export type CompletionStage =
  | "empty"
  | "field"
  | "value"
  | "operator"
  | "recent";

export type CompletionOption =
  | {
      id: string;
      kind: "field";
      label: string;
      detail?: string;
      fieldId: string;
    }
  | {
      id: string;
      kind: "value";
      label: string;
      detail?: string;
      value: string;
      active?: boolean;
    }
  | {
      id: string;
      kind: "operator";
      label: string;
      detail?: string;
      insert: string;
    }
  | {
      id: string;
      kind: "pattern";
      label: string;
      detail?: string;
      insert: string;
      /** When set, the pick replaces THIS span instead of the plan's — used by
       *  scope rewrites that wrap the whole coalesced free-text run, not just
       *  the token under the caret. */
      replaceSpan?: { from: number; to: number };
    }
  | { id: string; kind: "recent"; label: string; query: string };

export type CompletionSection = { title: string; options: CompletionOption[] };

export type CompletionPlan = {
  stage: CompletionStage;
  /** Span in the active INPUT text that an accepted option replaces. */
  from: number;
  to: number;
  sections: CompletionSection[];
  /** Value stage waiting on observed values (popover shows a loading row). */
  loading: boolean;
  /** Defaults to false; useful for incomplete grouped value entry. */
  keepOpenOnPick?: boolean;
  /**
   * Highlight the first option on open. True only when the user TYPED a
   * partial token that the options complete — then Enter picks the match.
   * Empty terms and exact-complete tokens highlight nothing, so Enter falls
   * through to committing the query (defaults to false).
   */
  autoHighlight?: boolean;
};

export const SECTION_SUGGESTIONS = "Suggestions";
export const SECTION_FIELDS = "Fields";
export const SECTION_VALUES = "Observed values";
export const SECTION_OPERATORS = "Operators";
export const SECTION_PATTERNS = "Patterns";
export const SECTION_RECENT = "Recent searches";
export const SECTION_MATCH_OPS = "Match operators";
export const SECTION_COMPARE_OPS = "Comparisons";
export const SECTION_KEYS = "Observed keys";
export const SECTION_SCORE_NAMES = "Score names";
export const SECTION_SEARCH_IN = "Full-text search";

const MAX_RECENTS_SHOWN = 5;

// Operators insert with a trailing space so they tokenize out of the input
// immediately; patterns are complete expressions and merge on accept.
// No OR here: the flat filter contract has no cross-field OR — any-of values
// go through `field:(a OR b)` (see PATTERN_OPTIONS).
const OPERATOR_OPTIONS: CompletionOption[] = [
  { id: "op:AND", kind: "operator", label: "AND", insert: "AND " },
  { id: "op:NOT", kind: "operator", label: "NOT", insert: "NOT " },
];

const PATTERN_OPTIONS: CompletionOption[] = [
  {
    id: "pat:contains",
    kind: "pattern",
    label: "field:*value*",
    detail: "contains",
    insert: "name:*chat*",
  },
  {
    id: "pat:anyof",
    kind: "pattern",
    label: "field:(a OR b)",
    detail: "any of",
    insert: "level:(ERROR OR WARNING)",
  },
  {
    id: "pat:negation",
    kind: "pattern",
    label: "-field:value",
    detail: "negation (none of)",
    insert: "-environment:",
  },
  {
    id: "pat:comparison",
    kind: "pattern",
    label: "latency:>2",
    detail: "numeric comparison (seconds)",
    insert: "latency:>2",
  },
  {
    id: "pat:has",
    kind: "pattern",
    label: "has:field",
    detail: "field has a value (-has: for missing)",
    insert: "has:",
  },
  {
    id: "pat:allof",
    kind: "pattern",
    label: "tags:(a AND b)",
    detail: "array all-of",
    insert: "tags:(",
  },
];

/** Case-insensitive match; prefix matches rank before substring matches. */
function filterRank(label: string, query: string): number | null {
  if (query.length === 0) return 0;
  const l = label.toLowerCase();
  const q = query.toLowerCase();
  if (l.startsWith(q)) return 0;
  if (l.includes(q)) return 1;
  return null;
}

function rankFilter<T extends { label: string }>(
  options: T[],
  query: string,
): T[] {
  return options
    .map((o) => ({ o, rank: filterRank(o.label, query) }))
    .filter((x): x is { o: T; rank: number } => x.rank !== null)
    .sort((a, b) => a.rank - b.rank)
    .map((x) => x.o);
}

function fieldOptions(includeVirtual = true): CompletionOption[] {
  const opts: CompletionOption[] = FIELDS.map((f: FieldDef) => ({
    id: `field:${f.id}`,
    kind: "field",
    label: f.id,
    detail: f.description,
    fieldId: f.id,
  }));
  if (includeVirtual) {
    opts.push(
      {
        id: "field:metadata.",
        kind: "field",
        label: "metadata.",
        detail: "metadata key path, e.g. metadata.region:eu",
        fieldId: "metadata.",
      },
      {
        id: "field:scores.",
        kind: "field",
        label: "scores.",
        detail:
          "score by name, e.g. scores.accuracy:>0.8 or scores.feedback:positive",
        fieldId: "scores.",
      },
      {
        id: "field:traceScores.",
        kind: "field",
        label: "traceScores.",
        detail: "trace-level score by name, e.g. traceScores.nps:>8",
        fieldId: "traceScores.",
      },
      {
        id: "field:has",
        kind: "field",
        label: "has",
        detail: "field has a value, e.g. has:endTime (-has: for missing)",
        fieldId: "has",
      },
      {
        id: "field:content",
        kind: "field",
        label: "content",
        detail: "full-text search in input + output, e.g. content:refund",
        fieldId: "content",
      },
    );
  }
  return opts;
}

// Ready-to-run query suggestions for the empty state: the top observed value
// of a few showcase fields, inserted as complete filters.
const SUGGESTION_FIELDS = ["level", "type", "environment", "name"];

function querySuggestionOptions(
  observed: ObservedOptions | undefined,
): CompletionOption[] {
  if (observed === undefined) return [];
  const out: CompletionOption[] = [];
  for (const fieldId of SUGGESTION_FIELDS) {
    const top = observed[fieldId]?.[0];
    if (top === undefined) continue;
    const insert = `${fieldId}:${serializeValue(top.value)}`;
    out.push({
      id: `suggest:${insert}`,
      kind: "pattern",
      label: insert,
      detail: top.count !== undefined ? String(top.count) : undefined,
      insert,
    });
  }
  return out;
}

/**
 * Value-stage option list. An empty or exactly-matching typed value means the
 * caret sits on a COMPLETE value (click-to-edit): offer the full list with
 * the current value marked active and ranked first, so Enter re-picks it and
 * the dropdown reads as a switcher. A partial value means the user is typing:
 * prefix-filter.
 */
function valueOptions(
  all: CompletionOption[],
  typed: string,
): CompletionOption[] {
  if (typed.length === 0) return all;
  const exactIndex = all.findIndex(
    (o) => o.kind === "value" && o.value === typed,
  );
  if (exactIndex !== -1) {
    const exact = { ...all[exactIndex]!, active: true };
    return [exact, ...all.slice(0, exactIndex), ...all.slice(exactIndex + 1)];
  }
  return rankFilter(all, typed);
}

function recentOptions(
  recents: string[],
  currentQueryText: string,
): CompletionOption[] {
  return recents
    .filter((q) => q !== currentQueryText.trim())
    .slice(0, MAX_RECENTS_SHOWN)
    .map((q, i) => ({
      id: `recent:${i}:${q}`,
      kind: "recent" as const,
      label: q,
      query: q,
    }));
}

function section(
  title: string,
  options: CompletionOption[],
): CompletionSection[] {
  return options.length > 0 ? [{ title, options }] : [];
}

// ---- per-kind operator menus ----

/** Realistic threshold examples for numeric operator hints, by field id. */
const NUMERIC_EXAMPLE: Record<string, string> = {
  latency: "2",
  timeToFirstToken: "0.5",
  tokensPerSecond: "50",
  inputTokens: "1000",
  outputTokens: "500",
  totalTokens: "1500",
  inputCost: "0.001",
  outputCost: "0.001",
  totalCost: "0.01",
  promptVersion: "3",
  toolDefinitions: "3",
  toolCalls: "1",
  commentCount: "0",
};

const COMPARISON_LABELS: Array<{ symbol: string; name: string }> = [
  { symbol: ">", name: "greater than" },
  { symbol: ">=", name: "at least" },
  { symbol: "<", name: "less than" },
  { symbol: "<=", name: "at most" },
];

function numberOperatorOptions(
  fieldId: string,
  unit: string | undefined,
  example: string,
): CompletionOption[] {
  const unitNote = unit !== undefined ? ` (${unit})` : "";
  const ops: CompletionOption[] = COMPARISON_LABELS.map(({ symbol, name }) => ({
    id: `vop:${symbol}`,
    kind: "operator",
    label: symbol,
    detail: `${name} — e.g. ${fieldId}:${symbol}${example}${unitNote}`,
    insert: symbol,
  }));
  ops.push({
    id: "vop:=",
    kind: "operator",
    label: "=",
    detail: `exactly — e.g. ${fieldId}:${example}${unitNote}`,
    insert: "",
  });
  return ops;
}

function datetimeOperatorOptions(fieldId: string): CompletionOption[] {
  return COMPARISON_LABELS.map(({ symbol, name }) => ({
    id: `vop:${symbol}`,
    kind: "operator",
    label: symbol,
    detail: `${name} — e.g. ${fieldId}:${symbol}2026-06-01`,
    insert: symbol,
  }));
}

// Glob/exact refinements for a value the user has already typed. Match ops are
// positional `*` wildcards, so they WRAP the typed value rather than prefix it
// (you type the value first, then anchor it). Caller only invokes this when
// `typed` is non-empty.
function matchOperatorOptions(
  typed: string,
  negated = false,
): CompletionOption[] {
  // Quote the value through the serializer so a value with whitespace/grammar
  // chars (`My Test`) becomes `*"My Test"*` — one lexer token — instead of a
  // raw `*My Test*` the lexer would tear in half.
  const v = serializeValue(typed);
  const contains: CompletionOption = {
    id: "vop:contains",
    kind: "pattern",
    label: `*${v}*`,
    detail: "contains (same as the bare value)",
    insert: `*${v}*`,
  };
  // Under negation only "contains" is representable (-> "does not contain").
  // Negated starts/ends/exact have no inverse operator, so the validator would
  // reject them on the next derive — don't offer drafts that can't commit.
  if (negated) return [contains];
  return [
    contains,
    {
      id: "vop:starts",
      kind: "pattern",
      label: `${v}*`,
      detail: "starts with",
      insert: `${v}*`,
    },
    {
      id: "vop:ends",
      kind: "pattern",
      label: `*${v}`,
      detail: "ends with",
      insert: `*${v}`,
    },
    {
      id: "vop:exact",
      kind: "pattern",
      label: `=${v}`,
      detail: "exact match",
      insert: `=${v}`,
    },
  ];
}

// ---- key-path suggestions (metadata.*, scores.*, traceScores.*) ----

type PathKind = {
  prefix: string;
  canonical: string;
  level?: "observation" | "trace";
};

// Must mirror fields.ts TRACE_SCORE_PREFIXES / resolveField — every alias the
// parser resolves needs a suggestion entry, or that spelling parses but offers
// no score-name dropdown. (`tracescore.` singular matches the `score.`/`scores.`
// observation-level pair.)
const PATH_PREFIXES: PathKind[] = [
  { prefix: "metadata.", canonical: "metadata." },
  { prefix: "tracescores.", canonical: "traceScores.", level: "trace" },
  { prefix: "trace_scores.", canonical: "traceScores.", level: "trace" },
  { prefix: "tracescore.", canonical: "traceScores.", level: "trace" },
  { prefix: "scores.", canonical: "scores.", level: "observation" },
  { prefix: "score.", canonical: "scores.", level: "observation" },
];

function pathKindOf(
  keyPart: string,
): { kind: PathKind; typedKey: string } | null {
  const lower = keyPart.toLowerCase();
  for (const kind of PATH_PREFIXES) {
    if (lower.startsWith(kind.prefix)) {
      return { kind, typedKey: keyPart.slice(kind.prefix.length) };
    }
  }
  return null;
}

function observedValues(observed: ObservedOptions | undefined, column: string) {
  return observed?.[column] ?? [];
}

function keyPathOptions(
  kind: PathKind,
  typedKey: string,
  observed: ObservedOptions | undefined,
): { title: string; options: CompletionOption[] } {
  // Observed names with grammar chars (a colon, space, …) can't be suggested:
  // picking `scores.foo:bar` would reparse with the key split at the FIRST
  // colon and silently commit a filter on a different/non-existent key. The
  // reverse adapter already drops these (filter-state-to-query NEEDS_QUOTES
  // guards); mirror that here so they're never offered.
  const suggestable = (name: string) => !NEEDS_QUOTES.test(name);
  if (kind.canonical === "metadata.") {
    const options = observedValues(observed, "metadata")
      .filter((o) => suggestable(o.value))
      .map((o) => ({
        id: `key:metadata.${o.value}`,
        kind: "field" as const,
        label: `metadata.${o.value}`,
        detail: o.count !== undefined ? String(o.count) : undefined,
        fieldId: `metadata.${o.value}`,
      }));
    return {
      title: SECTION_KEYS,
      options: rankFilter(options, `metadata.${typedKey}`),
    };
  }
  const numericColumn =
    kind.level === "trace" ? "trace_scores_avg" : "scores_avg";
  const categoricalColumn =
    kind.level === "trace" ? "trace_score_categories" : "score_categories";
  const seen = new Map<string, string>();
  for (const o of observedValues(observed, numericColumn))
    if (suggestable(o.value)) seen.set(o.value, "numeric score");
  for (const o of observedValues(observed, categoricalColumn)) {
    if (!suggestable(o.value)) continue;
    seen.set(
      o.value,
      seen.has(o.value) ? "numeric + categorical score" : "categorical score",
    );
  }
  const options = [...seen.entries()].map(([name, detail]) => ({
    id: `key:${kind.canonical}${name}`,
    kind: "field" as const,
    label: `${kind.canonical}${name}`,
    detail,
    fieldId: `${kind.canonical}${name}`,
  }));
  return {
    title: SECTION_SCORE_NAMES,
    options: rankFilter(options, `${kind.canonical}${typedKey}`),
  };
}

// ---- value-stage planning per resolved field kind ----

type ValueStageInput = {
  ref: FieldRef;
  typed: string;
  valuePrefix: string;
  observed: ObservedOptions | undefined;
  /** Whole-token span, for rewrites that replace the entire `key:value`. */
  tokenSpan: { from: number; to: number };
  /** The token carries a leading `-` (a negated filter). Scope rewrites must be
   *  suppressed: tokenSpan covers the `-`, so a rewrite would splice it away and
   *  silently flip `does not contain` → `contains` (the complement). */
  negated: boolean;
};

/** Sections for the caret-in-value context, or null when free-form entry. */
function valueStageSections(
  input: ValueStageInput,
): { sections: CompletionSection[]; loading: boolean } | null {
  const { ref, typed, valuePrefix, observed, tokenSpan, negated } = input;

  // An operator prefix was already typed: the rest is free-form entry.
  if (valuePrefix.length > 0) return null;

  switch (ref.type) {
    case "pseudo": {
      if (ref.id === "has") {
        const all = nullableFields().map((f) => ({
          id: `value:${f.id}`,
          kind: "value" as const,
          label: f.id,
          detail: f.description,
          value: f.id,
        }));
        return {
          sections: section(SECTION_VALUES, valueOptions(all, typed)),
          loading: false,
        };
      }
      // content: is free-form text (no enumerated values), but the caret being
      // in its value is the moment to offer moving the WHOLE block to another
      // scope — the reverse of the free-text → content: rewrite. Each switch
      // carries the value and replaces the entire `content:…` token. Suppress
      // when negated, so the rewrite can't splice away the leading `-`.
      if (typed.length === 0 || negated) return null;
      return {
        sections: section(
          SECTION_SEARCH_IN,
          scopeSwitchOptions("content", typed, tokenSpan),
        ),
        loading: false,
      };
    }

    case "metadata": {
      if (observed === undefined) return { sections: [], loading: true };
      const all = observedValues(observed, `metadata.${ref.key}`).map((o) => ({
        id: `value:${o.value}`,
        kind: "value" as const,
        label: o.value,
        detail: o.count !== undefined ? String(o.count) : undefined,
        value: o.value,
      }));
      const values = valueOptions(all, typed);
      const ops = typed.length > 0 ? matchOperatorOptions(typed, negated) : [];
      if (values.length + ops.length === 0) return null;
      return {
        sections: [
          ...section(SECTION_VALUES, values),
          ...section(SECTION_MATCH_OPS, ops),
        ],
        loading: false,
      };
    }

    case "scores": {
      if (observed === undefined) return { sections: [], loading: true };
      const numericColumn =
        ref.level === "trace" ? "trace_scores_avg" : "scores_avg";
      const categoricalColumn =
        ref.level === "trace" ? "trace_score_categories" : "score_categories";
      const path =
        ref.level === "trace" ? `traceScores.${ref.key}` : `scores.${ref.key}`;
      const isNumeric = observedValues(observed, numericColumn).some(
        (o) => o.value === ref.key,
      );
      const categories = observedValues(
        observed,
        `${categoricalColumn}.${ref.key}`,
      );
      const sections: CompletionSection[] = [];
      if (categories.length > 0) {
        const all = categories.map((o) => ({
          id: `value:${o.value}`,
          kind: "value" as const,
          label: o.value,
          detail: o.count !== undefined ? String(o.count) : undefined,
          value: o.value,
        }));
        sections.push(...section(SECTION_VALUES, valueOptions(all, typed)));
      }
      if ((isNumeric || categories.length === 0) && typed.length === 0) {
        sections.push(
          ...section(
            SECTION_COMPARE_OPS,
            numberOperatorOptions(path, undefined, "0.8"),
          ),
        );
      }
      if (sections.length === 0) return null;
      return { sections, loading: false };
    }

    case "field": {
      const f = ref.field;
      if (f.kind === "boolean") {
        const all = [
          {
            id: "value:true",
            kind: "value" as const,
            label: "true",
            value: "true",
          },
          {
            id: "value:false",
            kind: "value" as const,
            label: "false",
            value: "false",
          },
        ];
        return {
          sections: section(SECTION_VALUES, valueOptions(all, typed)),
          loading: false,
        };
      }
      if (f.kind === "number") {
        if (typed.length > 0) return null; // free numeric entry
        const example = NUMERIC_EXAMPLE[f.id] ?? "10";
        return {
          sections: section(
            SECTION_COMPARE_OPS,
            numberOperatorOptions(f.id, f.unit, example),
          ),
          loading: false,
        };
      }
      if (f.kind === "datetime") {
        if (typed.length > 0) return null;
        return {
          sections: section(SECTION_COMPARE_OPS, datetimeOperatorOptions(f.id)),
          loading: false,
        };
      }
      // text
      if (f.syncMode === "textSearch") {
        // No enumerable values. Once a value is typed, offer glob/exact
        // refinements that wrap it (bare value already means contains).
        if (typed.length === 0) return null;
        // input:/output: are full-text scopes too, so also offer switching the
        // whole token to the other scopes (mirrors content: and free text). NOT
        // when negated: tokenSpan covers the leading `-`, so the rewrite would
        // drop it and flip the filter to its complement (mirrors the free-text →
        // scope path, which is likewise gated on !negated).
        const scopeSwitches =
          !negated && (f.id === "input" || f.id === "output")
            ? scopeSwitchOptions(f.id, typed, tokenSpan)
            : [];
        return {
          sections: [
            ...section(SECTION_MATCH_OPS, matchOperatorOptions(typed, negated)),
            ...section(SECTION_SEARCH_IN, scopeSwitches),
          ],
          loading: false,
        };
      }
      if (observed === undefined) return { sections: [], loading: true };
      const all = observedValues(observed, f.id).map((o) => ({
        id: `value:${o.value}`,
        kind: "value" as const,
        label: o.value,
        detail: o.count !== undefined ? String(o.count) : undefined,
        value: o.value,
      }));
      const values = valueOptions(all, typed);
      // Array fields reject match operators — operatorIssue routes them to
      // value/any-of/all-of groups — so don't suggest them. For other option
      // fields, once a value is typed offer glob/exact refinements that wrap it.
      const ops =
        typed.length > 0 && f.syncMode !== "arrayOption"
          ? matchOperatorOptions(typed)
          : [];
      if (values.length + ops.length === 0) return null;
      return {
        sections: [
          ...section(SECTION_VALUES, values),
          ...section(SECTION_MATCH_OPS, ops),
        ],
        loading: false,
      };
    }
  }
}

/**
 * Strip surrounding quotes from a value token so it matches observed values.
 * A closed pair (`"My Tag"`) unescapes `\"`/`\\` like the parser's unquote; a
 * lone leading quote (mid-typing, no closing quote yet) is just stripped.
 * Stripping only the leading quote left a stray trailing one, so quoted values
 * matched nothing and the value-stage popover vanished on switch.
 */
function stripValueQuotes(raw: string): string {
  return raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')
    ? raw.slice(1, -1).replace(/\\(["\\])/g, "$1")
    : raw.replace(/^"/, "");
}

function groupedValueSegment(
  valuePart: string,
  relValuePos: number,
  valueStart: number,
): { from: number; to: number; typed: string; completeGroup: boolean } | null {
  if (!valuePart.startsWith("(") || relValuePos <= 0) return null;
  const close = indexOfOutsideQuotes(valuePart, ")");
  const groupEnd = close === -1 ? valuePart.length : close;
  if (relValuePos > groupEnd) return null;

  const inner = valuePart.slice(1, groupEnd);
  const innerCaret = Math.max(0, Math.min(relValuePos - 1, inner.length));
  let fromInner = 0;
  let toInner = inner.length;

  for (const token of lexTokens(inner)) {
    if (token.type !== "term" || (token.raw !== "OR" && token.raw !== "AND"))
      continue;
    if (token.span.to <= innerCaret) {
      fromInner = token.span.to;
      continue;
    }
    if (token.span.from >= innerCaret) {
      toInner = token.span.from;
      break;
    }
  }

  while (fromInner < toInner && /\s/.test(inner[fromInner]!)) fromInner++;
  while (toInner > fromInner && /\s/.test(inner[toInner - 1]!)) toInner--;

  return {
    from: valueStart + 1 + fromInner,
    to: valueStart + 1 + toInner,
    typed: stripValueQuotes(inner.slice(fromInner, toInner)),
    completeGroup: close !== -1,
  };
}

export type InputCompletionContext = {
  /** Active input text (the token(s) being typed). */
  input: string;
  /** Caret offset within `input`. */
  caret: number;
  /** Observed facet values; undefined = still loading. */
  observed: ObservedOptions | undefined;
  recents: string[];
  /** Full committed/draft query text (recents identical to it are hidden). */
  currentQueryText: string;
};

// The contiguous free-text run containing `caret` — the same block the composer
// coalesces visually. A scope rewrite (content:/input:/output:) wraps this WHOLE
// run, not just the token under the caret, so picking it on a multi-word block
// produces `content:"abc abc abc"` rather than a `content:abc` that strands the
// rest as free text (which the content-scope guard then rejects). Returns null
// when the caret isn't on a bare free-text word.
function freeTextRun(
  input: string,
  caret: number,
): { from: number; to: number; text: string } | null {
  const isFreeText = (raw: string) =>
    !raw.startsWith("-") &&
    indexOfOutsideQuotes(raw, ":") === -1 &&
    !["AND", "OR", "NOT"].includes(raw) &&
    resolveField(raw) === null;
  const terms = lexTokens(input).filter((t) => t.type === "term");
  const idx = terms.findIndex(
    (t) => caret >= t.span.from && caret <= t.span.to,
  );
  if (idx === -1 || !isFreeText(terms[idx]!.raw)) return null;
  // Expand over adjacent free-text terms separated only by whitespace (a paren
  // or any other token between two words breaks the run).
  let lo = idx;
  let hi = idx;
  const gapIsBlank = (a: number, b: number) => input.slice(a, b).trim() === "";
  while (
    lo > 0 &&
    isFreeText(terms[lo - 1]!.raw) &&
    gapIsBlank(terms[lo - 1]!.span.to, terms[lo]!.span.from)
  )
    lo--;
  while (
    hi < terms.length - 1 &&
    isFreeText(terms[hi + 1]!.raw) &&
    gapIsBlank(terms[hi]!.span.to, terms[hi + 1]!.span.from)
  )
    hi++;
  const from = terms[lo]!.span.from;
  const to = terms[hi]!.span.to;
  // `text` is the LOGICAL phrase: each term unquoted and joined by single
  // spaces — NOT the raw slice. So a run that already mixes a quoted phrase with
  // bare words (`"abc abc" abc`) reconstructs to `abc abc abc`, and the scope
  // rewrite re-serializes it as ONE clean `"abc abc abc"` instead of compounding
  // escaped quotes (`"abc abc\" abc"`). `from`/`to` stay the raw span so the
  // pick replaces the whole run, original quotes and all.
  const text = terms
    .slice(lo, hi + 1)
    .map((t) => stripValueQuotes(t.raw))
    .join(" ");
  return { from, to, text };
}

// The four full-text scopes the bar can switch a value between. `default` is
// bare free text (ids & names); content:/input:/output: are the scoped forms.
type FullTextScope = "default" | "content" | "input" | "output";

// Switch options that move a full-text value between scopes, carrying the value
// and replacing the WHOLE token/run (replaceSpan). Used in both directions:
// forward (bare text → content:/input:/output:) and back/between
// (content:/input:/output: → each other or default). `value` is the raw
// (unquoted) text; it's serialized so a multi-word phrase stays one token.
//
// `keepCurrentFirst` keeps the current scope in the list, listed first, instead
// of excluding it: for bare free text it surfaces the typed text itself as an
// explicit "this is the default-scope search" option (the anchor) ahead of the
// content:/input:/output: rewrites. Value-stage switches leave it off, so a
// `content:` value never offers a no-op switch back to `content:`.
function scopeSwitchOptions(
  current: FullTextScope,
  value: string,
  span: { from: number; to: number },
  opts?: { keepCurrentFirst?: boolean },
): CompletionOption[] {
  const v = serializeValue(value);
  const defs: { scope: FullTextScope; insert: string; detail: string }[] = [
    {
      scope: "content",
      insert: `content:${v}`,
      detail: "full-text search in input + output",
    },
    {
      scope: "input",
      insert: `input:${v}`,
      detail: "search the input payload",
    },
    {
      scope: "output",
      insert: `output:${v}`,
      detail: "search the output payload",
    },
    {
      scope: "default",
      insert: v,
      detail: "search ids & names (default scope)",
    },
  ];
  const ordered = opts?.keepCurrentFirst
    ? [
        ...defs.filter((d) => d.scope === current),
        ...defs.filter((d) => d.scope !== current),
      ]
    : defs.filter((d) => d.scope !== current);
  return ordered.map((d) => ({
    id: `scope:${d.scope}`,
    kind: "pattern" as const,
    label: d.insert,
    detail: d.detail,
    insert: d.insert,
    replaceSpan: span,
  }));
}

/**
 * The completion plan for the caret context, or null when nothing matches.
 * The plan is a pure function of (text, caret, data) — never of HOW the
 * popover was opened. An empty term (empty bar, trailing blank, after an
 * operator, after delete-to-empty) always plans the empty stage; a key
 * position plans fields; a value position plans values.
 */
export function planInputCompletions(
  ctx: InputCompletionContext,
): CompletionPlan | null {
  const { input, caret } = ctx;

  const term = termAt(input, caret);
  const start = term?.from ?? caret;
  const token = term?.raw ?? "";

  const negated = token.startsWith("-");
  const tokenBody = negated ? token.slice(1) : token;
  const bodyStart = start + (negated ? 1 : 0);
  const colon = indexOfOutsideQuotes(tokenBody, ":");
  const relPos = caret - bodyStart;

  if (colon === -1 || relPos <= colon) {
    // Key / keyword stage (also the key part of an existing filter).
    const to = colon === -1 ? (term?.to ?? caret) : bodyStart + colon;

    if (token.length === 0) {
      // Empty-term state: ready-to-run query suggestions first, then fields,
      // recents last — operators and patterns are noise here.
      return {
        stage: "empty",
        from: bodyStart,
        to,
        loading: false,
        sections: [
          ...section(SECTION_SUGGESTIONS, querySuggestionOptions(ctx.observed)),
          ...section(SECTION_FIELDS, fieldOptions()),
          ...section(
            SECTION_RECENT,
            recentOptions(ctx.recents, ctx.currentQueryText),
          ),
        ],
      };
    }

    // Inside an existing filter, rank against the key part only — the caret
    // is in the key, so "level:ERROR" suggests fields matching "level".
    const keyPart = colon === -1 ? tokenBody : tokenBody.slice(0, colon);

    // Dot paths (metadata./scores./traceScores.) suggest observed keys.
    const path = pathKindOf(keyPart);
    if (path !== null) {
      const { title, options } = keyPathOptions(
        path.kind,
        path.typedKey,
        ctx.observed,
      );
      if (options.length === 0 && ctx.observed === undefined) {
        return {
          stage: "field",
          from: bodyStart,
          to,
          loading: true,
          sections: [],
        };
      }
      if (options.length === 0) return null;
      return {
        stage: "field",
        from: bodyStart,
        to,
        loading: false,
        autoHighlight: path.typedKey.length > 0,
        sections: [{ title, options }],
      };
    }

    const resolvedKey = colon === -1 ? null : resolveField(keyPart);
    // The COMPLETE key of an existing filter is a switcher (like a complete
    // value): offer every field, current one first, and leave Enter unarmed.
    // A partial key prefix-filters and arms Enter-to-complete.
    const allFields = fieldOptions();
    const fields =
      resolvedKey !== null
        ? (() => {
            const currentId =
              resolvedKey.type === "field" ? resolvedKey.field.id : keyPart;
            const index = allFields.findIndex(
              (o) => o.kind === "field" && o.fieldId === currentId,
            );
            return index === -1
              ? allFields
              : [
                  allFields[index]!,
                  ...allFields.slice(0, index),
                  ...allFields.slice(index + 1),
                ];
          })()
        : rankFilter(allFields, keyPart);
    const operators =
      colon === -1 ? rankFilter(OPERATOR_OPTIONS, tokenBody) : [];
    const patterns =
      colon === -1
        ? rankFilter(PATTERN_OPTIONS, tokenBody).filter(
            // The term already starts with `-`; the negation pattern carries
            // its own `-`, so suggesting it would splice `--environment:`.
            (p) => !(negated && p.id === "pat:negation"),
          )
        : [];
    // Free-text guidance: a bare word (or a coalesced multi-word run) can become
    // a scoped full-text search. The rewrite wraps the WHOLE run — so it scopes
    // the block the user sees, not one word — and quotes via serializeValue so a
    // multi-word phrase stays one token. Strip any quotes the user already typed
    // (`"hello world"`) first, mirroring the value-stage path, so serializeValue
    // re-quotes once instead of emitting a doubly-quoted `content:"\"…\""`.
    const run =
      colon === -1 && !negated
        ? freeTextRun(ctx.currentQueryText, caret)
        : null;
    const searchScopes: CompletionOption[] =
      run !== null
        ? scopeSwitchOptions(
            "default",
            // run.text is already the logical (unquoted) phrase; serializeValue
            // re-quotes it once.
            run.text,
            { from: run.from, to: run.to },
            // Surface the typed text itself (default scope) as the first option,
            // ahead of the content:/input:/output: rewrites.
            { keepCurrentFirst: true },
          )
        : [];
    if (
      fields.length +
        operators.length +
        patterns.length +
        searchScopes.length ===
      0
    )
      return null;
    return {
      stage: "field",
      from: bodyStart,
      to,
      loading: false,
      autoHighlight: resolvedKey === null && fields.length > 0,
      sections: [
        ...section(SECTION_FIELDS, fields),
        ...section(SECTION_OPERATORS, operators),
        ...section(SECTION_PATTERNS, patterns),
        ...section(SECTION_SEARCH_IN, searchScopes),
      ],
    };
  }

  // Value stage: complete the comma segment under the caret.
  const keyRaw = tokenBody.slice(0, colon);
  const ref = resolveField(keyRaw);
  if (ref === null) return null;

  const valuePart = tokenBody.slice(colon + 1);
  const relValuePos = relPos - colon - 1;
  const valueStart = bodyStart + colon + 1;
  const grouped = groupedValueSegment(valuePart, relValuePos, valueStart);
  const segments = grouped === null ? splitOutsideQuotes(valuePart, ",") : [];
  const seg =
    grouped === null
      ? (segments.find(
          (s) =>
            relValuePos >= s.offset && relValuePos <= s.offset + s.text.length,
        ) ?? segments[segments.length - 1]!)
      : null;
  const segFromBase = grouped?.from ?? valueStart + seg!.offset;
  const activeValueText = grouped?.typed ?? seg!.text;
  // Comparison/exact operator prefixes belong to the op, not the typed value,
  // and put the value into free-form entry (valueStageSections bails on them).
  // This set MUST mirror langQ's OPERATOR_PREFIXES (>= <= > < =) — nothing more.
  // After the glob migration `~`/`^`/`$` are LITERAL value chars (not ops) and
  // `*` is a positional glob ANCHOR: treating any of them as a prefix wrongly
  // suppressed the popover for the canonical `name:*chat*` contains form. The
  // glob is instead unwrapped to its bare core below so the value stage stays
  // live and offers re-scope / re-form suggestions.
  const valuePrefix =
    grouped === null
      ? (activeValueText.match(/^(>=|<=|>|<|=)/)?.[0] ?? "")
      : "";
  const glob =
    grouped === null && valuePrefix === "" ? parseGlob(activeValueText) : null;
  const segFrom = segFromBase + valuePrefix.length;
  const segTo = grouped?.to ?? segFromBase + seg!.text.length;
  // Drop quotes so the typed text matches observed values (both the grouped
  // and non-grouped value segments go through the same helper). For a glob
  // value the typed text is the bare core inside the `*`s.
  const typed = stripValueQuotes(
    glob !== null ? glob.core : activeValueText.slice(valuePrefix.length),
  );
  const groupedPlanAttrs =
    grouped === null ? {} : { keepOpenOnPick: !grouped.completeGroup };

  const staged = valueStageSections({
    ref,
    typed,
    valuePrefix,
    observed: ctx.observed,
    tokenSpan: { from: start, to: term?.to ?? caret },
    negated,
  });
  if (staged === null) return null;
  if (staged.loading) {
    return {
      stage: "value",
      from: segFrom,
      to: segTo,
      loading: true,
      sections: [],
      ...groupedPlanAttrs,
    };
  }
  const flatValues = staged.sections
    .flatMap((s) => s.options)
    .filter((o) => o.kind === "value");
  return {
    stage: "value",
    from: segFrom,
    to: segTo,
    loading: false,
    // Partial typed values arm Enter-to-complete; an exact-complete value is
    // a switcher (Enter commits, the list is for browsing alternatives).
    autoHighlight:
      typed.length > 0 &&
      flatValues.length > 0 &&
      !flatValues.some((o) => o.kind === "value" && o.value === typed),
    sections: staged.sections,
    ...groupedPlanAttrs,
  };
}

/** Flat option list in render order (keyboard navigation walks this). */
export function flattenOptions(
  plan: CompletionPlan | null,
): CompletionOption[] {
  if (plan === null) return [];
  return plan.sections.flatMap((s) => s.options);
}
