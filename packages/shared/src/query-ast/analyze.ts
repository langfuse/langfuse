import type { Predicate, PredicateCondition } from "./predicate";
import {
  resolvePredicateSourceField,
  type PredicateSource,
  type PredicateSourceFieldType,
} from "./sources";

export type PredicateDiagnostic = {
  kind: "contradiction";
  fieldId: string;
  /** The conjuncts whose allowed values do not intersect. */
  conditions: PredicateCondition[];
};

// Fields holding one value per row; a row cannot equal two different values.
const SINGLE_VALUED_FIELD_TYPES: ReadonlySet<PredicateSourceFieldType> =
  new Set(["string", "stringOptions", "number", "boolean"]);

type EqualityConstraint = {
  domain: "string" | "number" | "boolean";
  values: ReadonlySet<string | number | boolean>;
};

const equalityConstraint = (
  condition: PredicateCondition,
): EqualityConstraint | undefined => {
  if (condition.type === "stringOptions" && condition.op === "any of") {
    return { domain: "string", values: new Set(condition.value) };
  }
  if (
    (condition.type === "string" ||
      condition.type === "number" ||
      condition.type === "boolean") &&
    condition.op === "="
  ) {
    return { domain: condition.type, values: new Set([condition.value]) };
  }
  return undefined;
};

/**
 * Flags conjunctions that no row can satisfy. v1 detects equality and
 * `any of` conditions on the same single-valued field whose value sets are
 * disjoint. Callers decide the consequence: reject when authoring, warn when
 * loading a stored filter; the predicate itself is never rewritten.
 */
export const analyzePredicate = (
  predicate: Predicate,
  source: PredicateSource,
): PredicateDiagnostic[] => {
  const diagnostics: PredicateDiagnostic[] = [];

  const analyzeConjunction = (conjuncts: Predicate[]) => {
    const groups = new Map<
      string,
      {
        fieldId: string;
        allowed: Set<string | number | boolean>;
        conditions: PredicateCondition[];
      }
    >();

    for (const node of conjuncts) {
      if (node.kind !== "condition") continue;
      const field = resolvePredicateSourceField(source, node.field.id);
      if (!field || !SINGLE_VALUED_FIELD_TYPES.has(field.type)) continue;
      const constraint = equalityConstraint(node);
      if (!constraint) continue;

      const groupKey = `${field.id}\u0000${constraint.domain}`;
      const group = groups.get(groupKey);
      if (!group) {
        groups.set(groupKey, {
          fieldId: field.id,
          allowed: new Set(constraint.values),
          conditions: [node],
        });
        continue;
      }
      group.conditions.push(node);
      for (const value of group.allowed) {
        if (!constraint.values.has(value)) group.allowed.delete(value);
      }
    }

    for (const group of groups.values()) {
      if (group.allowed.size === 0) {
        diagnostics.push({
          kind: "contradiction",
          fieldId: group.fieldId,
          conditions: group.conditions,
        });
      }
    }
  };

  const flattenAnd = (node: Predicate): Predicate[] =>
    node.kind === "and" ? node.children.flatMap(flattenAnd) : [node];

  const walk = (node: Predicate) => {
    switch (node.kind) {
      case "and": {
        const conjuncts = flattenAnd(node);
        analyzeConjunction(conjuncts);
        conjuncts.forEach((conjunct) => {
          if (conjunct.kind === "or" || conjunct.kind === "not") walk(conjunct);
        });
        return;
      }
      case "or":
        node.children.forEach(walk);
        return;
      case "not":
        walk(node.child);
        return;
      default:
        return;
    }
  };
  walk(predicate);

  return diagnostics;
};
