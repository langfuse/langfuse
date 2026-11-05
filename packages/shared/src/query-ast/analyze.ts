/**
 * Static checks on a predicate before it runs. `analyzePredicate` reports
 * conjunctions that no row can satisfy, such as `userId = "a" AND userId = "b"`.
 * It only reads the predicate; callers decide whether a diagnostic blocks
 * saving or shows a warning.
 */
import {
  conjuncts,
  type Predicate,
  type PredicateCondition,
} from "./predicate";
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

/** The values an `=` or `any of` condition allows; `undefined` for other ops. */
const allowedValues = (
  condition: PredicateCondition,
): ReadonlySet<string | number | boolean> | undefined => {
  if (condition.type === "stringOptions" && condition.op === "any of") {
    return new Set(condition.value);
  }
  if (
    (condition.type === "string" ||
      condition.type === "number" ||
      condition.type === "boolean") &&
    condition.op === "="
  ) {
    return new Set([condition.value]);
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

  const analyzeConjunction = (operands: Predicate[]) => {
    const groups = new Map<
      string,
      {
        fieldId: string;
        allowed: Set<string | number | boolean>;
        conditions: PredicateCondition[];
      }
    >();

    for (const node of operands) {
      if (node.kind !== "condition") continue;
      const field = resolvePredicateSourceField(source, node.field.id);
      if (
        !field ||
        // Skip fields where one row can hold several values (comments, tags,
        // scores): `= a AND = b` can both match the same row there.
        field.multiValued ||
        !SINGLE_VALUED_FIELD_TYPES.has(field.type) ||
        // An ill-typed condition is rejected when the filter compiles, so it
        // is not reported as a contradiction here.
        !field.operators[node.type]?.includes(node.op)
      ) {
        continue;
      }
      const values = allowedValues(node);
      if (!values) continue;

      // A target scopes a condition to other rows (e.g. another experiment run).
      const groupKey = [field.id, node.target ?? ""].join("\u0000");
      const group = groups.get(groupKey);
      if (!group) {
        groups.set(groupKey, {
          fieldId: field.id,
          allowed: new Set(values),
          conditions: [node],
        });
        continue;
      }
      group.conditions.push(node);
      // Keep only the values every condition in the group allows so far.
      for (const value of group.allowed) {
        if (!values.has(value)) group.allowed.delete(value);
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

  // Stops at `not`: a contradiction under negation matches every row, so
  // reporting it would block a valid filter.
  const walk = (node: Predicate) => {
    switch (node.kind) {
      case "and": {
        const operands = conjuncts(node);
        analyzeConjunction(operands);
        operands.forEach((operand) => {
          if (operand.kind === "or") walk(operand);
        });
        return;
      }
      case "or":
        node.children.forEach(walk);
        return;
      case "not":
      case "condition":
      case "search":
        return;
    }
  };
  walk(predicate);

  return diagnostics;
};
