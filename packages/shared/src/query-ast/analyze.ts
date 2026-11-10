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
  type PredicateSourceField,
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
 * The resolved field when `condition` can take part in a contradiction: the
 * field exists, holds one value per row, and accepts the condition's operator.
 */
const comparableField = (
  source: PredicateSource,
  condition: PredicateCondition,
): PredicateSourceField | undefined => {
  const field = resolvePredicateSourceField(source, condition.field.id);
  if (
    !field ||
    // Skip fields where one row can hold several values (comments, tags,
    // scores): `= a AND = b` can both match the same row there.
    field.multiValued ||
    !SINGLE_VALUED_FIELD_TYPES.has(field.type) ||
    // An ill-typed condition is rejected when the filter compiles, so it
    // is not reported as a contradiction here.
    !field.operators[condition.type]?.includes(condition.op)
  ) {
    return undefined;
  }
  return field;
};

/** Groups of sibling conditions on one field whose allowed values are disjoint. */
const contradictions = (
  operands: Predicate[],
  source: PredicateSource,
): PredicateDiagnostic[] => {
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
    const field = comparableField(source, node);
    const values = field && allowedValues(node);
    if (!field || !values) continue;

    // Keyed by field and target only, not condition type: `=` and `any of`
    // values compare as one set. Sound while no single-valued field accepts
    // both `stringOptions` and a number or boolean condition type.
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

  return [...groups.values()]
    .filter((group) => group.allowed.size === 0)
    .map((group) => ({
      kind: "contradiction",
      fieldId: group.fieldId,
      conditions: group.conditions,
    }));
};

// Non-empty when `node` matches no row. Stops at `not`: v1 cannot tell when a
// negation matches nothing.
const unsatisfiable = (
  node: Predicate,
  source: PredicateSource,
): PredicateDiagnostic[] => {
  switch (node.kind) {
    case "and": {
      const operands = conjuncts(node);
      return [
        ...contradictions(operands, source),
        ...operands.flatMap((operand) =>
          operand.kind === "or" ? unsatisfiable(operand, source) : [],
        ),
      ];
    }
    case "or": {
      const branches = node.children.map((child) =>
        unsatisfiable(child, source),
      );
      return branches.every((b) => b.length > 0) ? branches.flat() : [];
    }
    case "not":
    case "condition":
      return [];
  }
};

/**
 * Reports why no row can satisfy the predicate; an empty result means it may
 * match rows. A conjunction fails when equality or `any of` conditions on the
 * same single-valued field have no value in common, or when one of its `or`
 * operands fails in every branch. A dead branch inside a satisfiable `or` is
 * not reported. Conditions are compared only when they share a `target`
 * (none counts as its own value); targets are host-owned and their overlaps
 * unknown here, so contradictions across targets are missed, never invented.
 * Callers decide the consequence: reject when authoring, warn when loading a
 * stored filter; the predicate itself is never rewritten.
 */
export const analyzePredicate = (
  predicate: Predicate,
  source: PredicateSource,
): PredicateDiagnostic[] => unsatisfiable(predicate, source);
