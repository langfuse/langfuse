import { type FilterState } from "@/src/features/filters/types";
import { type ColumnDefinition } from "@/src/server/api/interfaces/tableDefinition";
import { Prisma } from "@prisma/client";

export function filterToPrismaSql(
  filters: FilterState,
  tableColumns: ColumnDefinition[],
): Prisma.Sql {
  const statements = filters.map((filter) => {
    // Get column definition to map column to internal name, e.g. "t.id"
    const col = tableColumns.find((c) => c.name === filter.column);
    if (!col) {
      console.error("Invalid filter column", filter.column);
      throw new Error("Invalid filter column: " + filter.column);
    }

    const colPrisma = Prisma.raw(col.internal);
    const operatorPrisma = Prisma.raw(filter.operator); //checked by zod

    // Get prisma value
    let valuePrisma: Prisma.Sql;
    switch (filter.type) {
      case "datetime":
        valuePrisma = Prisma.sql`${
          filter.value
            .toISOString()
            .split(".")[0]! // remove milliseconds
            .replace("T", " ") // to Postgres datetime
        }::TIMESTAMP`;
        break;
      case "number":
        valuePrisma = Prisma.sql`${filter.value}::DOUBLE PRECISION`;
        break;
      case "string":
        valuePrisma = Prisma.sql`${filter.value}`;
        break;
      case "stringOptions":
        valuePrisma = Prisma.sql`(${Prisma.join(
          filter.value.map((v) => Prisma.sql`${v}`),
        )})`;
        break;
    }

    return Prisma.sql`${colPrisma} ${operatorPrisma} ${valuePrisma}`;
  });
  if (statements.length === 0) {
    return Prisma.empty;
  }

  return Prisma.join(
    [Prisma.raw("AND "), Prisma.join(statements, " AND ")],
    "",
  );
}
