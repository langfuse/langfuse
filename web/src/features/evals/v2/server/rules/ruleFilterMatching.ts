import {
  EvalTargetObject,
  stableJsonStringify,
  TopicsTargetObject,
  type FilterState,
} from "@langfuse/shared";

function conditionKey(condition: FilterState[number]) {
  const value = Array.isArray(condition.value)
    ? [...condition.value].sort((left, right) =>
        stableJsonStringify(left).localeCompare(stableJsonStringify(right)),
      )
    : condition.value;

  return stableJsonStringify({ ...condition, value });
}

export function filterStateKey(filter: FilterState) {
  return stableJsonStringify(filter.map(conditionKey).sort());
}

export function filtersMatch(left: FilterState, right: FilterState) {
  return filterStateKey(left) === filterStateKey(right);
}

export function fallbackRuleName(
  filter: FilterState,
  targetObject:
    | EvalTargetObject
    | typeof TopicsTargetObject = EvalTargetObject.EVENT,
) {
  if (filter.length === 0) {
    return targetObject === TopicsTargetObject
      ? "All traces"
      : "All observations";
  }

  return filter
    .map((condition) => {
      const column =
        "key" in condition && condition.key
          ? `${condition.column}.${condition.key}`
          : condition.column;
      const value = Array.isArray(condition.value)
        ? condition.value.join(", ")
        : String(condition.value);
      return `${column} ${condition.operator}${value ? ` ${value}` : ""}`;
    })
    .join(" · ")
    .slice(0, 200);
}
