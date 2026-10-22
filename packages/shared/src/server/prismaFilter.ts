import type { Prisma } from "@prisma/client";
import { InvalidRequestError } from "../errors";
import type { FilterState } from "../types";
import { escapeSqlLikePattern } from "./utils/sqlLike";

type PrismaFilter = FilterState[number];
type PrismaFilterType = PrismaFilter["type"];

export type PrismaFilterColumnHandlers<TWhere> = {
  [Type in PrismaFilterType]?: (
    filter: Extract<PrismaFilter, { type: Type }>,
  ) => TWhere;
};

export function compilePrismaFilters<TWhere>(
  filters: FilterState,
  handlers: Record<string, PrismaFilterColumnHandlers<TWhere>>,
): TWhere[] {
  return filters.map((filter) => {
    const handler = handlers[filter.column]?.[filter.type] as
      | ((filter: PrismaFilter) => TWhere)
      | undefined;
    if (!handler) {
      throw new InvalidRequestError(
        `Unsupported Prisma filter: ${filter.column} (${filter.type})`,
      );
    }
    return handler(filter);
  });
}

type StringFilter = Extract<PrismaFilter, { type: "string" }>;

export function stringFilterToPrisma(
  filter: StringFilter,
): Prisma.StringFilter {
  const insensitive = { mode: "insensitive" as const };
  // Postgres runs every insensitive string filter, `equals` included, as an unescaped ILIKE.
  const escapedValue = escapeSqlLikePattern(filter.value);

  switch (filter.operator) {
    case "=":
      return { equals: escapedValue, ...insensitive };
    case "contains":
      return { contains: escapedValue, ...insensitive };
    case "does not contain":
      return { not: { contains: escapedValue, ...insensitive } };
    case "starts with":
      return { startsWith: escapedValue, ...insensitive };
    case "ends with":
      return { endsWith: escapedValue, ...insensitive };
    case "is not empty":
      return { not: "" };
  }
}

type StringOptionsFilter = Extract<PrismaFilter, { type: "stringOptions" }>;

export function stringOptionsFilterToPrisma(
  filter: StringOptionsFilter,
): Prisma.StringFilter {
  return filter.operator === "any of"
    ? { in: filter.value, mode: "insensitive" }
    : { notIn: filter.value, mode: "insensitive" };
}
