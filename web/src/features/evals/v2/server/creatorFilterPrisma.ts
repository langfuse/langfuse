import type { FilterState } from "@langfuse/shared";
import { stringFilterToPrisma } from "@langfuse/shared/src/server";

type StringFilter = Extract<FilterState[number], { type: "string" }>;
type StringOptionsFilter = Extract<
  FilterState[number],
  { type: "stringOptions" }
>;

function stringMatchesFilter(value: string, filter: StringFilter) {
  const actual = value.toLocaleLowerCase();
  const expected = filter.value.toLocaleLowerCase();

  switch (filter.operator) {
    case "=":
      return actual === expected;
    case "contains":
      return actual.includes(expected);
    case "does not contain":
      return !actual.includes(expected);
    case "starts with":
      return actual.startsWith(expected);
    case "ends with":
      return actual.endsWith(expected);
  }
}

export function creatorWhere(filter: StringFilter) {
  const valueFilter = stringFilterToPrisma(filter);
  const userFilter = {
    createdByUser: {
      is: {
        OR: [{ name: valueFilter }, { name: null, email: valueFilter }],
      },
    },
  };

  return stringMatchesFilter("API", filter)
    ? { OR: [{ createdByUserId: null }, userFilter] }
    : userFilter;
}

export function creatorOptionsWhere(filter: StringOptionsFilter) {
  const creatorMatches = filter.value.map((value) =>
    value === "API"
      ? { createdByUserId: null }
      : {
          createdByUser: {
            is: {
              OR: [
                { name: { equals: value, mode: "insensitive" as const } },
                {
                  name: null,
                  email: { equals: value, mode: "insensitive" as const },
                },
              ],
            },
          },
        },
  );

  return filter.operator === "any of"
    ? { OR: creatorMatches }
    : { NOT: { OR: creatorMatches } };
}
