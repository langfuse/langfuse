// Plain-language explanation of a single query token: bold lead-in + one
// sentence, RegExr-style. Pure, no React.
//
// Derived from the parsed token (registry field + operator + values), never a
// per-filter string table — so a new field explains itself. The operator
// semantics mirror adapter.ts's lowering: a negated comparison flips through
// the SAME `INVERTED_COMPARISON` map, and the `=` default reads as "contains"
// or "is" exactly where the adapter lowers it that way.

import { INVERTED_COMPARISON } from "./adapter";
import type { CompareOp } from "./ast";
import type { ComposerSegment, FilterSegment } from "./composer-segments";
import { resolveField, type FieldDef, type FieldRef } from "./fields";

export type TokenExplanation = {
  /** Bold lead-in naming the operator, e.g. "Exclude" (no trailing period). */
  label: string;
  /** One plain sentence, ending in a period. */
  sentence: string;
};

// View-neutral subject: the bar mounts on several tables, so the copy never
// claims a row is an observation.
const SUBJECT = "results";

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

/** Number with its display unit — "2 seconds", "$0.5", "50 tok/s". */
function amount(raw: string, field: FieldDef | undefined): string {
  const value = raw.trim();
  const unit = field?.unit;
  if (unit === undefined) return value;
  if (unit === "s") return `${value} ${value === "1" ? "second" : "seconds"}`;
  if (unit === "$") return `$${value}`;
  return `${value} ${unit}`;
}

/** What the filter is about: a column id, a metadata key, or a named score. */
function target(ref: FieldRef): string {
  switch (ref.type) {
    case "field":
      return ref.field.id;
    case "metadata":
      return `the metadata key ${quote(ref.key)}`;
    case "scores":
      return ref.level === "trace"
        ? `the ${quote(ref.key)} trace score`
        : `the ${quote(ref.key)} score (observation or trace level)`;
    case "pseudo":
      return ref.id;
  }
}

const COMPARISON_COPY: Record<
  ComparisonOp,
  { label: string; predicate: (v: string) => string }
> = {
  ">": { label: "Greater than", predicate: (v) => `is above ${v}` },
  ">=": { label: "At least", predicate: (v) => `is ${v} or more` },
  "<": { label: "Less than", predicate: (v) => `is below ${v}` },
  "<=": { label: "At most", predicate: (v) => `is ${v} or less` },
};

const DATE_COMPARISON_COPY: Record<
  ComparisonOp,
  { label: string; predicate: (v: string) => string }
> = {
  ">": { label: "After", predicate: (v) => `is after ${v}` },
  ">=": { label: "On or after", predicate: (v) => `is on or after ${v}` },
  "<": { label: "Before", predicate: (v) => `is before ${v}` },
  "<=": { label: "On or before", predicate: (v) => `is on or before ${v}` },
};

// A negated filter reads as "Hides results where <positive predicate>", except
// comparisons and booleans, which have a native inverse and read positively
// (matching how the adapter flips rather than negates them).
type Copy = { label: string; predicate: string; hides?: boolean };

function comparisonCopy(
  op: ComparisonOp,
  ref: FieldRef,
  values: string[],
  negated: boolean,
): Copy {
  const effective = negated ? INVERTED_COMPARISON[op] : op;
  const field = ref.type === "field" ? ref.field : undefined;
  const isDate = field?.kind === "datetime";
  const table = isDate ? DATE_COMPARISON_COPY : COMPARISON_COPY;
  const value = isDate
    ? (values[0] ?? "")
    : amount(values[0] ?? "", ref.type === "field" ? field : undefined);
  return {
    label: table[effective].label,
    predicate: `${target(ref)} ${table[effective].predicate(value)}`,
  };
}

function hasCopy(values: string[], negated: boolean): Copy {
  // `has:` values are field names — show the canonical id the filter applies to.
  const names = values.map((v) => {
    const ref = resolveField(v);
    return ref !== null ? target(ref) : v;
  });
  const list = names.join(" and ");
  return negated
    ? { label: "Missing", predicate: `${list} is not set` }
    : { label: "Has a value", predicate: `${list} is set` };
}

function booleanCopy(
  field: FieldDef,
  values: string[],
  negated: boolean,
): Copy {
  const asked = (values[0] ?? "").trim().toLowerCase() === "true";
  const effective = negated ? !asked : asked;
  return {
    label: effective ? "Is true" : "Is false",
    predicate: `${field.id} is ${effective}`,
  };
}

/** Operator copy for the `=` default, which lowers per sync mode. */
function defaultOpCopy(ref: FieldRef, seg: FilterSegment): Copy {
  const { values, valueOp, negated } = seg;
  const many = values.length > 1;
  const where = target(ref);

  if (ref.type === "metadata") {
    // stringObject `=` is an exact match — the sharpest contrast with the
    // contains default on text columns.
    return {
      label: "Exactly",
      predicate: `${where} is exactly ${joinValues(values, "or")}`,
      hides: negated,
    };
  }
  if (ref.type === "scores") {
    return {
      label: negated ? (many ? "None of" : "Exclude") : many ? "Any of" : "Is",
      predicate: `${where} is ${joinValues(values, "or")}`,
      hides: negated,
    };
  }
  if (ref.type === "field" && ref.field.kind === "number") {
    return {
      label: "Is",
      predicate: `${where} is ${amount(values[0] ?? "", ref.field)}`,
      hides: negated,
    };
  }
  if (ref.type === "field" && ref.field.syncMode === "arrayOption") {
    if (valueOp === "and") {
      return {
        label: "All of",
        predicate: `${where} contains all of ${joinValues(values, "and")}`,
        hides: negated,
      };
    }
    return {
      label: negated
        ? many
          ? "None of"
          : "Exclude"
        : many
          ? "Any of"
          : "Includes",
      predicate: `${where} contains ${joinValues(values, "or")}`,
      hides: negated,
    };
  }
  if (ref.type === "field" && ref.field.syncMode === "textSearch" && !many) {
    // Bare `=` on a text column is a substring search, not equality.
    return {
      label: negated ? "Does not contain" : "Contains",
      predicate: `${where} contains ${quote(values[0] ?? "")}`,
      hides: negated,
    };
  }
  // Option-backed columns, and grouped values on a text column (an exact set).
  const exactly =
    ref.type === "field" && ref.field.syncMode === "textSearch"
      ? "exactly "
      : "";
  return {
    label: negated ? (many ? "None of" : "Exclude") : many ? "Any of" : "Is",
    predicate: `${where} is ${exactly}${joinValues(values, "or")}`,
    hides: negated,
  };
}

function filterCopy(ref: FieldRef, seg: FilterSegment): Copy {
  const { op, values, negated } = seg;
  const where = target(ref);

  if (ref.type === "pseudo") return hasCopy(values, negated);
  if (isComparison(op)) return comparisonCopy(op, ref, values, negated);
  if (ref.type === "field" && ref.field.kind === "boolean") {
    return booleanCopy(ref.field, values, negated);
  }

  switch (op) {
    case "exact":
      return {
        label: negated
          ? values.length > 1
            ? "None of"
            : "Not exactly"
          : values.length > 1
            ? "Any of"
            : "Exactly",
        predicate: `${where} is exactly ${joinValues(values, "or")}`,
        hides: negated,
      };
    case "~":
      return {
        label: negated ? "Does not contain" : "Contains",
        predicate: `${where} contains ${joinValues(values, "or")}`,
        hides: negated,
      };
    case "^":
      return {
        label: "Starts with",
        predicate: `${where} starts with ${quote(values[0] ?? "")}`,
        hides: negated,
      };
    case "$":
      return {
        label: "Ends with",
        predicate: `${where} ends with ${quote(values[0] ?? "")}`,
        hides: negated,
      };
    default:
      return defaultOpCopy(ref, seg);
  }
}

const KEYWORD_COPY: Record<string, TokenExplanation> = {
  AND: { label: "And", sentence: "Every filter has to match." },
  OR: { label: "Or", sentence: "Either side can match." },
  NOT: { label: "Not", sentence: "Excludes the filter that follows." },
};

/**
 * Explain one token in plain language, or null when there is nothing useful to
 * say (parentheses, an unknown field, an invalid token — those carry their own
 * diagnostic).
 */
export function explainSegment(seg: ComposerSegment): TokenExplanation | null {
  switch (seg.kind) {
    case "filter": {
      const ref = resolveField(seg.displayField);
      if (ref === null) return null;
      const copy = filterCopy(ref, seg);
      const verb = copy.hides === true ? "Hides" : "Matches";
      return {
        label: copy.label,
        sentence: `${verb} ${SUBJECT} where ${copy.predicate}.`,
      };
    }
    case "freeText":
      return {
        label: "Full-text search",
        sentence:
          `Matches ${SUBJECT} containing ${quote(seg.raw.trim())} in their id, name, input or output. ` +
          "Use input: or output: to search one payload, or name:/id: to narrow to that column.",
      };
    case "operator":
      return KEYWORD_COPY[seg.raw.toUpperCase()] ?? null;
    default:
      return null;
  }
}
