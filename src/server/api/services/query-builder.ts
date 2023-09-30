import { type PrismaClient } from "@prisma/client";
import Decimal from "decimal.js";
import { z } from "zod";

export type InternalDatabaseRow = {
  [key: string]: bigint | number | Decimal | string | Date;
};

export type DatabaseRow = {
  [key: string]: string | number | Date;
};

export function isDatabaseRow(value: unknown): value is DatabaseRow {
  if (typeof value !== "object" || value === null) return false;

  const obj = value as Record<string, unknown>;

  const isBigIntOrDecimal = (x: unknown): x is bigint | Decimal | number => {
    return (
      typeof x === "bigint" || typeof x === "number" || Decimal.isDecimal(x)
    );
  };

  for (const key in obj) {
    const val = obj[key];
    if (typeof val !== "string" && !isBigIntOrDecimal(val)) {
      return false;
    }
  }

  return true;
}

export function isArrayOfDatabaseRow(value: unknown): value is DatabaseRow[] {
  return Array.isArray(value) && value.every(isDatabaseRow);
}

type Column = {
  name: string;
  type: string;
  internal: string;
};

const comlpetionTokens = {
  name: "completionTokens",
  type: "number",
  internal: 'o."completion_tokens"',
};
const observationId = {
  name: "observationId",
  type: "string",
  internal: 'o."project_id"',
};
const observationName = {
  name: "name",
  type: "string",
  internal: 'o."name"',
};

const traceId = { name: "traceId", type: "string", internal: 't."id"' };

const tableDefinitions = {
  traces: {
    table: ` traces as t`,
    columns: [
      { name: "id", type: "string", internal: 't."id"' },
      { name: "projectId", type: "string", internal: 't."project_id"' },
    ],
  },
  traces_observations: {
    table: ` traces t LEFT JOIN observations o ON t.id = o.trace_id`,
    columns: [
      traceId,
      observationId,
      { name: "type", type: "string", internal: 'o."type"' },
      { name: "projectId", type: "string", internal: 't."project_id"' },
    ],
  },
  observations: {
    table: ` observations as o`,
    columns: [
      traceId,
      observationName,
      { name: "type", type: "string", internal: 'o."type"' },
      comlpetionTokens,
      observationId,
      { name: "projectId", type: "string", internal: 'o."project_id"' },
      { name: "startTime", type: "datetime", internal: 'o."start_time"' },
      { name: "endTime", type: "datetime", internal: 'o."end_time"' },
    ],
  },
  traces_scores: {
    table: ` traces t JOIN scores s ON t.id = s.trace_id`,
    columns: [
      { name: "projectId", type: "string", internal: 't."project_id"' },
    ],
  },
};

const timeFilter = z.object({
  column: z.string(),
  operator: z.enum(["=", ">", "<", ">=", "<=", "in", "like"]),
  value: z.date(),
  type: z.literal("datetime"),
});

const temporalUnit = z.enum([
  "year",
  "month",
  "day",
  "hour",
  "minute",
  "second",
  "millisecond",
  "microsecond",
  "nanosecond",
]);
const singleFilter = z.discriminatedUnion("type", [
  timeFilter,
  z.object({
    column: z.string(),
    operator: z.enum(["=", ">", "<", ">=", "<=", "in", "like"]),
    value: z.string(),
    type: z.literal("string"),
  }),
  z.object({
    column: z.string(),
    operator: z.enum(["=", ">", "<", ">=", "<=", "in", "like"]),
    value: z.number(),
    type: z.literal("number"),
  }),
]);

export const sqlInterface = z.object({
  from: z.enum([
    "traces",
    "traces_observations",
    "observations",
    "traces_scores",
  ]), // predefined views on our db
  filter: z.array(singleFilter),
  groupBy: z.array(
    z.discriminatedUnion("type", [
      z.object({
        type: z.literal("datetime"),
        column: z.string(),
        temporalUnit: temporalUnit,
      }),
      z.object({ type: z.literal("number"), column: z.string() }),
      z.object({ type: z.literal("string"), column: z.string() }),
    ]),
  ),
  select: z.array(
    z.object({ column: z.string(), agg: z.enum(["SUM", "AVG"]).nullable() }),
  ),
});

export const executeQuery = async (
  prisma: PrismaClient,
  projectId: string,
  query: z.TypeOf<typeof sqlInterface>,
) => {
  console.log("query", query);
  const safeQuery = {
    ...query,
    filter: [
      ...query.filter,
      {
        type: "string" as const,
        column: "projectId",
        operator: "=" as const,
        value: projectId,
      },
    ],
  };
  console.log("safe query", safeQuery);
  const stringQuery = createQuery(safeQuery);
  console.log("stringQuery", stringQuery);
  const response =
    await prisma.$queryRawUnsafe<InternalDatabaseRow[]>(stringQuery);
  console.log("response", response);

  return outputParser(response);
};

const createQuery = (query: z.TypeOf<typeof sqlInterface>) => {
  const cte = createDateRangeCte(query.from, query.filter, query.groupBy);
  const fromString = cte?.query ?? ` FROM ${getTableSql(query.from)}`;

  const selectFields = query.select.map((field) =>
    field.agg
      ? `${field.agg}(${getColumnSql(query.from, field.column).internal}) as "${
          field.column
        }"`
      : `${getColumnSql(query.from, field.column).internal}`,
  );

  if (cte) selectFields.unshift(`series."date" as "${cte.column.name}"`);

  let groupString = "";

  if (query.groupBy.length > 0 || cte) {
    const groupByFields = query.groupBy.map((groupBy) =>
      prepareGroupBy(query.from, groupBy),
    );
    groupString = ` GROUP BY ${groupByFields.join(", ")}`;
  }
  const selectString = `SELECT ${selectFields.join(", ")}`;

  let orderByString = "";
  if (cte) orderByString = ` ORDER BY series."date" DESC`;

  const filterString = prepareFilterString(query.from, query.filter);

  return `${selectString}${fromString}${filterString}${groupString}${orderByString};`;
};

const prepareFilterString = (
  table: z.infer<typeof sqlInterface>["from"],
  filter: z.infer<typeof sqlInterface>["filter"],
) => {
  return filter.length > 0
    ? " WHERE " +
        filter
          .map((filter) => {
            const internalColumn = getColumnSql(table, filter.column).internal;
            if (filter.type === "datetime") {
              return `${internalColumn} ${
                filter.operator
              } '${filter.value.toISOString()}'`;
            } else {
              return `${internalColumn} ${filter.operator} '${filter.value}'`;
            }
          })
          .join(" AND ")
    : "";
};

const prepareGroupBy = (
  table: z.infer<typeof sqlInterface>["from"],
  groupBy: z.infer<typeof sqlInterface>["groupBy"][number],
) => {
  const internalColumn = getColumnSql(table, groupBy.column).internal;
  if (groupBy.type === "datetime") {
    return `series."date"`;
  } else {
    return internalColumn;
  }
};

function isTimeRangeFilter(
  filter: z.infer<typeof sqlInterface>["filter"][number],
): filter is z.infer<typeof timeFilter> {
  return filter.type === "datetime";
}

const createDateRangeCte = (
  from: z.infer<typeof sqlInterface>["from"],
  filters: z.infer<typeof singleFilter>[],
  groupBy: z.infer<typeof sqlInterface>["groupBy"],
) => {
  const groupByColumns = groupBy.filter((x) => x.type === "datetime");

  if (groupByColumns.length === 0) return undefined;
  if (groupByColumns.length > 1)
    throw new Error("Only one datetime group by is supported");
  const groupByColumn = groupByColumns[0];

  const dateTimeFilters = filters.filter(isTimeRangeFilter);

  const minDateColumn =
    dateTimeFilters.length > 1
      ? dateTimeFilters.find((x) => x.operator === ">")
      : undefined;

  const maxDateColumn =
    dateTimeFilters.length > 1
      ? dateTimeFilters.find((x) => x.operator === "<")
      : undefined;

  if (
    groupByColumn &&
    "temporalUnit" in groupByColumn &&
    minDateColumn &&
    maxDateColumn
  ) {
    if (
      minDateColumn?.column !== groupByColumn?.column ||
      maxDateColumn?.column !== groupByColumn?.column
    ) {
      throw new Error(
        "Min date column, max date column must match group by column",
      );
    }
    const startColumn = getColumnSql(from, minDateColumn.column);

    const series = `
      generate_series('${minDateColumn.value.toISOString()}'::timestamp, '${maxDateColumn.value.toISOString()}'::timestamp, '${mapTemporalUnitToInterval(
        groupByColumn.temporalUnit,
      )}') as series(date)
    `;

    return {
      query: ` FROM  ${series} LEFT JOIN ${getTableSql(from)} ON DATE_TRUNC('${
        groupByColumn.temporalUnit
      }', ${startColumn.internal}) = series.date`,
      column: startColumn,
    };
  }

  return undefined;
};

const getTableSql = (table: z.infer<typeof sqlInterface>["from"]): string => {
  return tableDefinitions[table].table;
};

const getColumnSql = (
  table: z.infer<typeof sqlInterface>["from"],
  column: string,
): Column => {
  const foundColumn = tableDefinitions[table].columns.find((c) => {
    return c.name === column;
  });
  if (!foundColumn) {
    console.error(`Column ${column} not found in table ${table}`);
    throw new Error(`Column ${column} not found in table ${table}`);
  }
  return foundColumn;
};

const mapTemporalUnitToInterval = (unit: z.infer<typeof temporalUnit>) => {
  switch (unit) {
    case "year":
      return "1 year";
    case "month":
      return "1 month";
    case "day":
      return "1 day";
    case "hour":
      return "1 hour";
    case "minute":
      return "1 minute";
    case "second":
      return "1 second";
    case "millisecond":
      return "1 millisecond";
    case "microsecond":
      return "1 microsecond";
    case "nanosecond":
      return "1 nanosecond";
  }
};

const outputParser = (output: InternalDatabaseRow[]): DatabaseRow[] => {
  return output.map((row) => {
    const newRow: DatabaseRow = {};
    for (const key in row) {
      const val = row[key];
      if (typeof val === "bigint") {
        newRow[key] = Number(val);
      } else if (typeof val === "number") {
        newRow[key] = val;
      } else if (Decimal.isDecimal(val)) {
        newRow[key] = val.toNumber();
      } else if (typeof val === "string") {
        newRow[key] = val;
      } else if (val instanceof Date) {
        newRow[key] = val;
      } else if (val === null) {
        newRow[key] = val;
      } else {
        console.log(`Unknown type ${typeof val} for ${val}`);
        throw new Error(`Unknown type ${typeof val}`);
      }
    }
    return newRow;
  });
};
