import { Prisma } from "@prisma/client";
import { ColumnDefinition, type TableNames } from "../tableDefinitions";
import { FilterState } from "../types";
import { filterOperators, timeFilter } from "../interfaces/filters";
import { z } from "zod/v4";
import { logger } from "./index";

const operatorReplacements = {
  "any of": "IN",
  "none of": "NOT IN",
  contains: "ILIKE",
  "does not contain": "NOT ILIKE",
  "starts with": "ILIKE",
  "ends with": "ILIKE",
};

const arrayOperatorReplacements = {
  "any of": "&&",
  "all of": "@>",
  "none of": "&&",
};

/**
 * SECURITY: This function must only be used, when all its inputs were verified with zod.
 */
export function tableColumnsToSqlFilterAndPrefix(
  filters: FilterState,
  tableColumns: ColumnDefinition[],
  table: TableNames,
): Prisma.Sql {
  const sql = tableColumnsToSqlFilter(filters, tableColumns, table);
  if (sql === Prisma.empty) {
    return Prisma.empty;
  }
  return Prisma.join([Prisma.raw("AND "), sql], "");
}

/**
 * SECURITY: This function must only be used, when all its inputs were verified with zod.
 * Converts filter state and table columns to a Prisma SQL filter.
 */
export function tableColumnsToSqlFilter(
  filters: FilterState,
  tableColumns: ColumnDefinition[],
  table: TableNames,
): Prisma.Sql {
  const internalFilters = filters.map((filter) => {
    // Get column definition to map column to internal name, e.g. "t.id"
    const col = tableColumns.find(
      (c) =>
        // TODO: Only use id instead of name
        c.name === filter.column || c.id === filter.column,
    );
    if (!col) {
      logger.error("Invalid filter column", filter.column);
      throw new Error("Invalid filter column: " + filter.column);
    }
    const colPrisma = Prisma.raw(col.internal);
    return {
      condition: filter,
      internalColumn: colPrisma,
      column: col,
      table: table,
    };
  });

  const statements = internalFilters.map((filterAndColumn) => {
    const filter = filterAndColumn.condition;
    const operatorPrisma =
      filter.type === "arrayOptions"
        ? Prisma.raw(
            arrayOperatorReplacements[
              filter.operator as keyof typeof arrayOperatorReplacements
            ],
          )
        : filter.operator in operatorReplacements
          ? Prisma.raw(
              operatorReplacements[
                filter.operator as keyof typeof operatorReplacements
              ],
            )
          : Prisma.raw(filter.operator); //checked by zod

    // Get prisma value
    let valuePrisma: Prisma.Sql;
    switch (filter.type) {
      case "datetime":
        valuePrisma = Prisma.sql`${filter.value}::timestamp with time zone at time zone 'UTC'`;
        break;
      case "number":
      case "numberObject":
        valuePrisma = Prisma.sql`${filter.value.toString()}::DOUBLE PRECISION`;
        break;
      case "string":
      case "stringObject":
        valuePrisma = Prisma.sql`${filter.value}`;
        break;
      case "stringOptions":
        valuePrisma = Prisma.sql`(${Prisma.join(
          filter.value.map((v) => Prisma.sql`${v}`),
        )})`;
        break;
      case "arrayOptions":
        valuePrisma = Prisma.sql`ARRAY[${Prisma.join(
          filter.value.map((v) => Prisma.sql`${v}`),
          ", ",
        )}] `;
        break;
      case "boolean":
        valuePrisma = Prisma.sql`${filter.value}`;
        break;
      case "categoryOptions":
        // LFE-4815: Support category options in postgres
        logger.warn("Category options not supported in postgres yet");
        throw new Error("Category options not supported in postgres yet");
      case "null":
        valuePrisma = Prisma.sql``;
        break;
    }
    const jsonKeyPrisma =
      filter.type === "stringObject" || filter.type === "numberObject"
        ? Prisma.sql`->>${filter.key}`
        : Prisma.empty;
    const [cast1, cast2] =
      filter.type === "numberObject"
        ? [Prisma.raw("cast("), Prisma.raw(" as double precision)")]
        : [Prisma.empty, Prisma.empty];
    const [valuePrefix, valueSuffix] =
      filter.type === "string" || filter.type === "stringObject"
        ? [
            ["contains", "does not contain", "ends with"].includes(
              filter.operator,
            )
              ? Prisma.raw("'%' || ")
              : Prisma.empty,
            ["contains", "does not contain", "starts with"].includes(
              filter.operator,
            )
              ? Prisma.raw(" || '%'")
              : Prisma.empty,
          ]
        : [Prisma.empty, Prisma.empty];
    const [funcPrisma1, funcPrisma2] =
      filter.type === "arrayOptions" && filter.operator === "none of"
        ? [Prisma.raw("NOT ("), Prisma.raw(")")]
        : [Prisma.empty, Prisma.empty];

    return Prisma.sql`${funcPrisma1}${cast1}${filterAndColumn.internalColumn}${jsonKeyPrisma}${cast2} ${operatorPrisma} ${valuePrefix}${valuePrisma}${castValueToPostgresTypes(filterAndColumn.column, filterAndColumn.table)}${valueSuffix}${funcPrisma2}`;
  });
  if (statements.length === 0) {
    return Prisma.empty;
  }
  // FOR SECURITY: We join the statements with " AND " to prevent SQL injection.
  // IF WE EVER CHANGE THIS, WE MUST ENSURE THAT USERS ONLY ACCESS THE DATA THEY ARE ALLOWED TO.
  // Example: Or condition on charts API on projectId would break this.
  return Prisma.join(statements, " AND ");
}

const castValueToPostgresTypes = (
  column: ColumnDefinition,
  table: TableNames,
) => {
  return column.name === "type" &&
    (table === "observations" ||
      table === "traces_observations" ||
      table === "traces_observationsview" ||
      table === "traces_parent_observation_scores")
    ? Prisma.sql`::"ObservationType"`
    : Prisma.empty;
};

const dateOperators = filterOperators["datetime"];

export const datetimeFilterToPrismaSql = (
  safeColumn: string,
  operator: (typeof dateOperators)[number],
  value: Date,
) => {
  if (!dateOperators.includes(operator)) {
    throw new Error("Invalid operator: " + operator);
  }
  if (isNaN(value.getTime())) {
    throw new Error("Invalid date: " + value.toString());
  }

  return Prisma.sql`AND ${Prisma.raw(safeColumn)} ${Prisma.raw(
    operator,
  )} ${value}::timestamp with time zone at time zone 'UTC'`;
};

export const datetimeFilterToPrisma = (
  timestampFilter: z.infer<typeof timeFilter>,
) => {
  const prismaTimestampFilter =
    timestampFilter.operator === ">="
      ? { gte: timestampFilter.value }
      : timestampFilter.operator === ">"
        ? { gt: timestampFilter.value }
        : timestampFilter.operator === "<="
          ? { lte: timestampFilter.value }
          : timestampFilter.operator === "<"
            ? { lt: timestampFilter.value }
            : {};
  return prismaTimestampFilter;
};
