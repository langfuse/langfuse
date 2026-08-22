import { stableJsonStringify, type FilterState } from "@langfuse/shared";

function conditionKey(condition: FilterState[number]) {
  const value = Array.isArray(condition.value)
    ? [...condition.value].sort((left, right) =>
        stableJsonStringify(left).localeCompare(stableJsonStringify(right)),
      )
    : condition.value;

  return stableJsonStringify({ ...condition, value });
}

export function filtersMatch(left: FilterState, right: FilterState) {
  if (left.length !== right.length) return false;

  const leftKeys = left.map(conditionKey).sort();
  const rightKeys = right.map(conditionKey).sort();
  return leftKeys.every((key, index) => key === rightKeys[index]);
}

export function fallbackRuleName(filter: FilterState) {
  if (filter.length === 0) return "All observations";

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
