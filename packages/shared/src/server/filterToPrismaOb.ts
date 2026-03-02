import { Prisma } from "@prisma/client";
import { ColumnDefinition, type TableNames } from "../tableDefinitions";
import { FilterState } from "../types";
import { filterOperators, timeFilter } from "../interfaces/filters";
import { z } from "zod/v4";
import { logger } from "./index";

// OceanBase uses LIKE instead of ILIKE (case-insensitive)
const operatorReplacements = {
  "any of": "IN",
  "none of": "NOT IN",
  contains: "LIKE",
  "does not contain": "NOT LIKE",
  "starts with": "LIKE",
  "ends with": "LIKE",
};

// OceanBase doesn't support PostgreSQL array operators like && and @>
// Use JSON functions or alternative approaches
const arrayOperatorReplacements = {
  "any of": "IN",
  "all of": "IN",
  "none of": "NOT IN",
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
    // OceanBase uses backticks instead of double quotes for field names
    const internalField = col.internal.replace(/"/g, "`");
    const colPrisma = Prisma.raw(internalField);
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
    const valuePrisma: Prisma.Sql = (() => {
      switch (filter.type) {
        case "datetime":
          // OceanBase uses CAST for type conversion
          return Prisma.sql`CAST(${filter.value} AS DATETIME)`;
        case "number":
        case "numberObject":
          // OceanBase uses CAST for type conversion
          return Prisma.sql`CAST(${filter.value.toString()} AS DECIMAL(65,30)}`;
        case "string":
        case "stringObject":
          return Prisma.sql`${filter.value}`;
        case "stringOptions":
          return Prisma.sql`(${Prisma.join(
            filter.value.map((v) => Prisma.sql`${v}`),
          )})`;
        case "arrayOptions":
          // OceanBase doesn't support ARRAY[] syntax
          // Use JSON_ARRAY or simple IN clause
          return Prisma.sql`(${Prisma.join(
            filter.value.map((v) => Prisma.sql`${v}`),
            ", ",
          )})`;
        case "boolean":
          return Prisma.sql`${filter.value}`;
        case "categoryOptions":
          // LFE-4815: Support category options in postgres
          logger.warn("Category options not supported in postgres yet");
          throw new Error("Category options not supported in postgres yet");
        case "null":
          return Prisma.sql``;
        default:
          // This should never happen if filter types are properly validated
          throw new Error(`Unknown filter type: ${(filter as any).type}`);
      }
    })();
    // OceanBase uses CONCAT() instead of || for string concatenation
    const needsLikePattern =
      filter.type === "string" || filter.type === "stringObject";
    const addPrefixWildcard =
      needsLikePattern &&
      ["contains", "does not contain", "ends with"].includes(filter.operator);
    const addSuffixWildcard =
      needsLikePattern &&
      ["contains", "does not contain", "starts with"].includes(filter.operator);
    const [funcPrisma1, funcPrisma2] =
      filter.type === "arrayOptions" && filter.operator === "none of"
        ? [Prisma.raw("NOT ("), Prisma.raw(")")]
        : [Prisma.empty, Prisma.empty];

    // Build the comparison value with CONCAT for LIKE patterns
    let comparisonValue: Prisma.Sql;
    if (addPrefixWildcard && addSuffixWildcard) {
      comparisonValue = Prisma.sql`CONCAT('%', ${valuePrisma}, '%')`;
    } else if (addPrefixWildcard) {
      comparisonValue = Prisma.sql`CONCAT('%', ${valuePrisma})`;
    } else if (addSuffixWildcard) {
      comparisonValue = Prisma.sql`CONCAT(${valuePrisma}, '%')`;
    } else {
      comparisonValue = valuePrisma;
    }

    // 构建左侧表达式
    let leftExpression: Prisma.Sql;
    if (filter.type === "numberObject" || filter.type === "stringObject") {
      // 处理 JSON 路径：如果 key 是纯数字或包含特殊字符，需要用引号括起来
      const needsQuotes =
        /^\d+$/.test(filter.key) || /[.[\]\s]/.test(filter.key);
      const jsonPath = needsQuotes ? `$."${filter.key}"` : `$.${filter.key}`;

      if (filter.type === "numberObject") {
        // numberObject: 使用 CAST(JSON_VALUE(...) AS DECIMAL)
        leftExpression = Prisma.raw(
          `CAST(JSON_VALUE(${filterAndColumn.internalColumn.sql}, '${jsonPath}') AS DECIMAL(65,30))`,
        );
      } else {
        // stringObject: 使用 JSON_VALUE(...)
        leftExpression = Prisma.raw(
          `JSON_VALUE(${filterAndColumn.internalColumn.sql}, '${jsonPath}')`,
        );
      }
    } else {
      // 其他类型: 直接使用列名
      leftExpression = filterAndColumn.internalColumn;
    }

    return Prisma.sql`${funcPrisma1}${leftExpression} ${operatorPrisma} ${comparisonValue}${castValueToOceanBaseTypes()}${funcPrisma2}`;
  });
  if (statements.length === 0) {
    return Prisma.empty;
  }
  // FOR SECURITY: We join the statements with " AND " to prevent SQL injection.
  // IF WE EVER CHANGE THIS, WE MUST ENSURE THAT USERS ONLY ACCESS THE DATA THEY ARE ALLOWED TO.
  // Example: Or condition on charts API on projectId would break this.
  return Prisma.join(statements, " AND ");
}

// OceanBase uses CAST instead of PostgreSQL :: operator
const castValueToOceanBaseTypes = () => {
  // OceanBase doesn't support custom ENUM types in CAST
  // ENUM values are stored as strings, so no explicit cast needed
  return Prisma.empty;
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

  // OceanBase uses CAST for type conversion
  return Prisma.sql`AND ${Prisma.raw(safeColumn)} ${Prisma.raw(
    operator,
  )} CAST(${value} AS DATETIME)`;
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
