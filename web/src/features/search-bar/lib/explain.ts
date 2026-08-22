// Plain-language explanation of a single query token: the field in bold, then
// what the token asks of it — "Name is exactly "gpt-5.4"". Pure, no React.
//
// Derived from the parsed token (registry field + operator + values), never a
// per-filter string table — so a new field explains itself. The operator
// semantics mirror adapter.ts's lowering: a negated comparison flips through
// the SAME `INVERTED_COMPARISON` map, and `=` reads as "contains" or "is"
// exactly where the adapter lowers it that way.
//
// The bold lead-in is the FIELD, not the operator: an operator lead-in repeats
// the word the predicate already carries ("Exactly. … is exactly …"), and the
// field is the half users actually misread (`env`, `tps`, `-`).

import { INVERTED_COMPARISON } from "./adapter";
import type { CompareOp } from "./ast";
import type { ComposerSegment, FilterSegment } from "./composer-segments";
import {
  EVENTS_FIELD_REGISTRY,
  type FieldDef,
  type FieldRef,
  type FieldRegistry,
} from "./fields";

export type TokenExplanation = {
  /** Bold lead-in: the field this token filters on. */
  subject: string;
  /** The rest of the sentence, ending in a period. Empty when the subject is
   *  the whole explanation (a boolean token states itself). */
  predicate: string;
};

type ComparisonOp = keyof typeof INVERTED_COMPARISON;

function isComparison(op: CompareOp): op is ComparisonOp {
  return op === ">" || op === "<" || op === ">=" || op === "<=";
}

function quote(value: string): string {
  return `"${value}"`;
}

/** `"a"` · `"a" or "b"` · `"a", "b" or "c"` */
function joinValues(values: string[], conjunction: "or" | "and"): string {
  const quoted = values.map(quote);
  if (quoted.length <= 1) return quoted[0] ?? '""';
  return `${quoted.slice(0, -1).join(", ")} ${conjunction} ${quoted.at(-1)}`;
}

/** Plain list — reads better than "or" after a "none of". */
function commaList(values: string[]): string {
  return values.map(quote).join(", ");
}

/**
 * Number spelled out — "2 seconds", "$0.5". Only units the field's label does
 * not already carry are spelled out ("Tokens per second is 50", not "50 tok/s").
 */
function amount(raw: string, field: FieldDef | undefined): string {
  const value = raw.trim();
  if (field?.unit === "s")
    return `${value} ${value === "1" ? "second" : "seconds"}`;
  if (field?.unit === "$") return `$${value}`;
  return value;
}

/** The token's subject — a field's human name, or a user-defined key. */
function subjectOf(ref: FieldRef): string {
  switch (ref.type) {
    case "field":
      return ref.field.label;
    case "metadata":
      return `Metadata ${quote(ref.key)}`;
    case "scores":
      return ref.level === "trace"
        ? `Trace score ${quote(ref.key)}`
        : `Score ${quote(ref.key)}`;
    case "pseudo":
      return ref.id;
  }
}

function comparisonPredicate(
  op: ComparisonOp,
  ref: FieldRef,
  values: string[],
  negated: boolean,
): string {
  const effective = negated ? INVERTED_COMPARISON[op] : op;
  const field = ref.type === "field" ? ref.field : undefined;
  const raw = values[0] ?? "";
  if (field?.kind === "datetime") {
    return {
      ">": `is after ${raw}`,
      ">=": `is on or after ${raw}`,
      "<": `is before ${raw}`,
      "<=": `is on or before ${raw}`,
    }[effective];
  }
  const value = amount(raw, field);
  return {
    ">": `is above ${value}`,
    ">=": `is ${value} or more`,
    "<": `is below ${value}`,
    "<=": `is ${value} or less`,
  }[effective];
}

/** Predicate for `=`, whose meaning depends on the field's sync mode. */
function defaultOpPredicate(ref: FieldRef, seg: FilterSegment): string {
  const { values, valueOp, negated } = seg;
  const many = values.length > 1;

  // stringObject `=` is an exact match — unlike the contains default on a
  // plain text column.
  if (ref.type === "metadata") {
    return negated
      ? `is not exactly ${joinValues(values, "or")}`
      : `is exactly ${joinValues(values, "or")}`;
  }
  if (ref.type === "scores") {
    if (negated)
      return many
        ? `is none of ${commaList(values)}`
        : `is not ${quote(values[0] ?? "")}`;
    return `is ${joinValues(values, "or")}`;
  }
  if (ref.type === "field" && ref.field.syncMode === "arrayOption") {
    if (valueOp === "and") return `include all of ${joinValues(values, "and")}`;
    if (negated)
      return many
        ? `include none of ${commaList(values)}`
        : `do not include ${quote(values[0] ?? "")}`;
    return `include ${joinValues(values, "or")}`;
  }
  // Bare `=` on a text column is a substring search; grouped values are an
  // exact set (stringOptions), so they read differently.
  if (ref.type === "field" && ref.field.syncMode === "textSearch" && !many) {
    return negated
      ? `does not contain ${quote(values[0] ?? "")}`
      : `contains ${quote(values[0] ?? "")}`;
  }
  const exactly =
    ref.type === "field" && ref.field.syncMode === "textSearch"
      ? "exactly "
      : "";
  if (negated)
    return many
      ? `is none of ${commaList(values)}`
      : `is not ${exactly}${quote(values[0] ?? "")}`;
  return `is ${exactly}${joinValues(values, "or")}`;
}

function predicateOf(ref: FieldRef, seg: FilterSegment): string {
  const { op, values, negated } = seg;

  if (isComparison(op)) return comparisonPredicate(op, ref, values, negated);

  // Number equality, before the string-operator switch: `latency:2` and
  // `latency:=2` lower to the SAME numeric filter, so both must read "is 2
  // seconds" — not a quoted, unitless "is exactly "2"" for the `:=` spelling.
  if (ref.type === "field" && ref.field.kind === "number") {
    const value = amount(values[0] ?? "", ref.field);
    return negated ? `is not ${value}` : `is ${value}`;
  }

  switch (op) {
    case "exact":
      return negated
        ? `is not exactly ${joinValues(values, "or")}`
        : `is exactly ${joinValues(values, "or")}`;
    case "~":
      return negated
        ? `does not contain ${joinValues(values, "or")}`
        : `contains ${joinValues(values, "or")}`;
    case "^":
      return `starts with ${quote(values[0] ?? "")}`;
    case "$":
      return `ends with ${quote(values[0] ?? "")}`;
    default:
      return defaultOpPredicate(ref, seg);
  }
}

/** A boolean token needs no value in the copy: "Is not root observation." */
function explainBoolean(field: FieldDef, seg: FilterSegment): TokenExplanation {
  const asked = (seg.values[0] ?? "").trim().toLowerCase() === "true";
  const holds = seg.negated ? !asked : asked;
  const phrase = holds ? field.label : (field.negatedLabel ?? field.label);
  return { subject: `${phrase}.`, predicate: "" };
}

/** `has:` reads about its VALUE — the field that is (or isn't) set. */
function explainHas(
  seg: FilterSegment,
  registry: FieldRegistry,
): TokenExplanation {
  const labels = seg.values.map((value) => {
    const ref = registry.resolveField(value);
    return ref === null ? value : subjectOf(ref);
  });
  const verb = labels.length > 1 ? "are" : "is";
  return {
    subject: labels.join(" and "),
    predicate: seg.negated ? `${verb} not set.` : `${verb} set.`,
  };
}

const KEYWORDS: Record<string, TokenExplanation> = {
  AND: { subject: "AND", predicate: "— every filter has to match." },
  OR: { subject: "OR", predicate: "— either side can match." },
  NOT: { subject: "NOT", predicate: "— excludes the filter that follows." },
};

/**
 * Explain one token in plain language, or null when there is nothing useful to
 * say (parentheses, an unknown field, an invalid token — those carry their own
 * diagnostic).
 */
export function explainSegment(
  seg: ComposerSegment,
  registry: FieldRegistry = EVENTS_FIELD_REGISTRY,
): TokenExplanation | null {
  switch (seg.kind) {
    case "filter": {
      const ref = registry.resolveField(seg.displayField);
      if (ref === null) return null;
      if (ref.type === "pseudo") return explainHas(seg, registry);
      if (ref.type === "field" && ref.field.kind === "boolean") {
        return explainBoolean(ref.field, seg);
      }
      return {
        subject: subjectOf(ref),
        predicate: `${predicateOf(ref, seg)}.`,
      };
    }
    case "freeText":
      return {
        subject: "Full-text search",
        predicate: `for ${quote(seg.raw.trim())} — matches id, name, input and output.`,
      };
    case "operator":
      return KEYWORDS[seg.raw.toUpperCase()] ?? null;
    default:
      return null;
  }
}
