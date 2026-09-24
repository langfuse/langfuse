import type { FilterState } from "@langfuse/shared";

function matchesFilterSlot(
  current: FilterState[number],
  example: FilterState[number],
) {
  return (
    current.column === example.column &&
    current.type === example.type &&
    current.operator === example.operator &&
    "key" in current === "key" in example &&
    (!("key" in current) || !("key" in example) || current.key === example.key)
  );
}

function includesExampleValue(
  current: FilterState[number],
  example: FilterState[number],
) {
  const currentValue = current.value;
  const exampleValue = example.value;
  if (Array.isArray(currentValue) && Array.isArray(exampleValue)) {
    return exampleValue.every((value) => currentValue.includes(value));
  }

  return currentValue === exampleValue;
}

function isExamplePresent(current: FilterState, example: FilterState) {
  return example.every((exampleFilter) =>
    current.some(
      (currentFilter) =>
        matchesFilterSlot(currentFilter, exampleFilter) &&
        includesExampleValue(currentFilter, exampleFilter),
    ),
  );
}

export function toggleExampleFilters(
  current: FilterState,
  example: FilterState,
): FilterState {
  const next = [...current];

  if (isExamplePresent(current, example)) {
    for (const removal of example) {
      const index = next.findIndex(
        (filter) =>
          matchesFilterSlot(filter, removal) &&
          includesExampleValue(filter, removal),
      );
      const existing = next[index];

      if (
        index >= 0 &&
        existing &&
        Array.isArray(existing.value) &&
        Array.isArray(removal.value)
      ) {
        const removalValue = removal.value;
        const value = existing.value.filter(
          (item) => !removalValue.includes(item),
        );
        if (value.length > 0) {
          next[index] = { ...existing, value } as typeof existing;
        } else {
          next.splice(index, 1);
        }
      } else if (index >= 0) {
        next.splice(index, 1);
      }
    }

    return next;
  }

  for (const addition of example) {
    const index = next.findIndex((filter) =>
      matchesFilterSlot(filter, addition),
    );
    if (index < 0) {
      next.push(addition);
      continue;
    }

    const existing = next[index];
    if (
      existing &&
      Array.isArray(existing.value) &&
      Array.isArray(addition.value)
    ) {
      next[index] = {
        ...existing,
        value: Array.from(new Set([...existing.value, ...addition.value])),
      } as typeof existing;
    }
  }

  return next;
}
