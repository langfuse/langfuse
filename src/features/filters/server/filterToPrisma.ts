import { type FilterState } from "@/src/features/filters/types";
import { filterOperators } from "@/src/server/api/interfaces/filters";
import { type ColumnDefinition } from "@/src/server/api/interfaces/tableDefinition";
import { Prisma } from "@prisma/client";

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

export function filterToPrismaSql(
  filters: FilterState,
  tableColumns: ColumnDefinition[],
): Prisma.Sql {
  const statements = filters.map((filter) => {
    // Get column definition to map column to internal name, e.g. "t.id"
    const col = tableColumns.find(
      (c) =>
        // TODO: Only use id instead of name
        c.name === filter.column || c.id === filter.column,
    );
    if (!col) {
      console.error("Invalid filter column", filter.column);
      throw new Error("Invalid filter column: " + filter.column);
    }

    const colPrisma = Prisma.raw(col.internal);
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
        valuePrisma = Prisma.sql`${filter.value}::DOUBLE PRECISION`;
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

    return Prisma.sql`${funcPrisma1}${cast1}${colPrisma}${jsonKeyPrisma}${cast2} ${operatorPrisma} ${valuePrefix}${valuePrisma}${valueSuffix}${funcPrisma2}`;
  });
  if (statements.length === 0) {
    return Prisma.empty;
  }

  return Prisma.join(
    [Prisma.raw("AND "), Prisma.join(statements, " AND ")],
    "",
  );
}

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
