import { type FilterState } from "@langfuse/shared";

const SET_VALUE_FILTER_TYPES = new Set([
  "stringOptions",
  "categoryOptions",
  "arrayOptions",
]);

function stableStringify(value: unknown) {
  return JSON.stringify(value, (_key, nestedValue) => {
    if (
      nestedValue &&
      typeof nestedValue === "object" &&
      !Array.isArray(nestedValue) &&
      !(nestedValue instanceof Date)
    ) {
      return Object.fromEntries(
        Object.entries(nestedValue)
          .filter(([, entryValue]) => entryValue !== undefined)
          .sort(([left], [right]) => left.localeCompare(right)),
      );
    }
    return nestedValue;
  });
}

function canonicalFilter(filter: FilterState[number]) {
  const value =
    SET_VALUE_FILTER_TYPES.has(filter.type) && Array.isArray(filter.value)
      ? [...filter.value].sort()
      : filter.value;

  return stableStringify({ ...filter, value });
}

/**
 * Filter conditions are ANDed, and option values are sets. UI round-trips may
 * rebuild either in a different order without changing the rule's meaning.
 */
export function areFilterStatesEquivalent(
  left: FilterState,
  right: FilterState,
) {
  if (left.length !== right.length) return false;

  const canonicalLeft = left.map(canonicalFilter).sort();
  const canonicalRight = right.map(canonicalFilter).sort();
  return canonicalLeft.every(
    (filter, index) => filter === canonicalRight[index],
  );
}
