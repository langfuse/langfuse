import type { FilterState } from "@langfuse/shared";

export const EXPERIMENTS_AND_EVALS_ALIAS = "experiments-and-evals";

export const EXPERIMENTS_AND_EVALS_EXCLUSION_FILTERS = [
  {
    column: "environment",
    type: "string",
    operator: "does not contain",
    value: "langfuse-",
  },
  {
    column: "environment",
    type: "stringOptions",
    operator: "none of",
    value: ["sdk-experiment"],
  },
  {
    column: "experimentId",
    type: "null",
    operator: "is null",
    value: "",
  },
] satisfies FilterState;

export type FilterAlias = {
  /** Complete query-language token, including a leading negation when needed. */
  token: `-${string}`;
  label: string;
  description: string;
  filters: FilterState;
};

export const EXPERIMENTS_AND_EVALS_FILTER_ALIAS: FilterAlias = {
  token: `-${EXPERIMENTS_AND_EVALS_ALIAS}`,
  label: "Exclude experiments & evals",
  description: "Exclude experiments & evals.",
  filters: EXPERIMENTS_AND_EVALS_EXCLUSION_FILTERS,
};

export function resolveFilterAlias(
  token: string,
  aliases: readonly FilterAlias[],
): FilterAlias | null {
  const normalized = token.toLowerCase();
  return aliases.find((alias) => alias.token === normalized) ?? null;
}

function hasSameValue(
  left: FilterState[number]["value"],
  right: FilterState[number]["value"],
) {
  return Array.isArray(left) && Array.isArray(right)
    ? left.length === right.length &&
        left.every((value, index) => value === right[index])
    : left === right;
}

function matchesFilter(
  filter: FilterState[number],
  expected: FilterState[number],
) {
  return (
    filter.column === expected.column &&
    filter.type === expected.type &&
    filter.operator === expected.operator &&
    hasSameValue(filter.value, expected.value)
  );
}

function extractAliasFilters(
  filters: FilterState,
  alias: FilterAlias,
): FilterState | null {
  const expectedFilters = alias.filters;
  const matchedIndices = new Set<number>();

  for (const expected of expectedFilters) {
    const index = filters.findIndex(
      (filter, candidateIndex) =>
        !matchedIndices.has(candidateIndex) && matchesFilter(filter, expected),
    );
    if (index < 0) return null;
    matchedIndices.add(index);
  }

  return filters.filter((_, index) => !matchedIndices.has(index));
}

export function extractRegisteredFilterAlias(
  filters: FilterState,
  aliases: readonly FilterAlias[],
): {
  alias: FilterAlias | null;
  remaining: FilterState;
} {
  for (const alias of aliases) {
    const remaining = extractAliasFilters(filters, alias);
    if (remaining !== null) return { alias, remaining };
  }
  return { alias: null, remaining: filters };
}
