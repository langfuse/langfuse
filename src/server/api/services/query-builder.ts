import {
  singleFilter,
  type timeFilter,
} from "@/src/server/api/interfaces/filters";
import {
  type ColumnDefinition,
  type TableDefinitions,
} from "@/src/server/api/interfaces/tableDefinition";
import { type PrismaClient } from "@prisma/client";
import { type ColumnOrderState } from "@tanstack/react-table";
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

const completionTokens = {
  name: "completionTokens",
  type: "number",
  internal: 'o."completion_tokens"',
} as const;
const observationId = {
  name: "observationId",
  type: "string",
  internal: 'o."project_id"',
} as const;
const observationName = {
  name: "name",
  type: "string",
  internal: 'o."name"',
} as const;
const startTime = {
  name: "startTime",
  type: "datetime",
  internal: 'o."start_time"',
} as const;
const traceId = {
  name: "traceId",
  type: "string",
  internal: 't."id"',
} as const;
const traceVersion = {
  name: "version",
  type: "string",
  internal: 't."version"',
} as const;
const traceTimestamp = {
  name: "timestamp",
  type: "string",
  internal: 't."timestamp"',
} as const;
const scoreName = {
  name: "scoreName",
  type: "string",
  internal: 's."name"',
} as const;

const tableDefinitions: TableDefinitions = {
  traces: {
    table: ` traces as t`,
    columns: [
      { name: "id", type: "string", internal: 't."id"' },
      { name: "projectId", type: "string", internal: 't."project_id"' },

      traceVersion,
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
      completionTokens,
      {
        name: "promptTokens",
        type: "number",
        internal: 'o."prompt_tokens"',
      },
      {
        name: "totalTokens",
        type: "number",
        internal: 'o."total_tokens"',
      },
      observationId,
      { name: "model", type: "string", internal: 'o."model"' },
      { name: "projectId", type: "string", internal: 'o."project_id"' },
      startTime,
      { name: "endTime", type: "datetime", internal: 'o."end_time"' },
    ],
  },
  traces_scores: {
    table: ` traces t JOIN scores s ON t.id = s.trace_id`,
    columns: [
      { name: "projectId", type: "string", internal: 't."project_id"' },
      { name: "value", type: "number", internal: 's."value"' },
      {
        name: "name",
        type: "number",
        internal: 's."name"',
      },
      traceVersion,
      traceTimestamp,
      scoreName,
    ],
  },
};

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
    z.object({
      column: z.string(),
      agg: z.enum(["SUM", "AVG", "COUNT"]).nullable(),
    }),
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

  const a = outputParser(response);
  console.log("a", a, response);
  return a;
};

const createQuery = (query: z.TypeOf<typeof sqlInterface>) => {
  const cte = createDateRangeCte(query.from, query.filter, query.groupBy);

  const fromString = cte?.from ?? ` FROM ${getTableSql(query.from)}`;

  const selectFields = query.select.map((field) =>
    field.agg
      ? `${field.agg}(${
          getColumnSql(query.from, field.column).internal
        }) as "${field.agg.toLowerCase()}${capitalizeFirstLetter(
          field.column,
        )}"`
      : `${getColumnSql(query.from, field.column).internal}`,
  );

  if (cte) selectFields.unshift(`date_series."date" as "${cte.column.name}"`);

  let groupString = "";

  if (query.groupBy.length > 0 || cte) {
    const groupByFields = query.groupBy.map((groupBy) =>
      prepareGroupBy(query.from, groupBy),
    );
    groupString = ` GROUP BY ${groupByFields.join(", ")}`;
  }
  const selectString = `SELECT ${selectFields.join(", ")}`;

  let orderByString = "";
  if (cte) orderByString = ` ORDER BY date_series."date" ASC`;

  const filterString =
    query.filter.length > 0
      ? (cte ? " AND " : " WHERE ") +
        prepareFilterString(query.filter, tableDefinitions[query.from]!.columns)
      : "";

  return `${
    cte?.cte ?? ""
  }${selectString}${fromString}${filterString}${groupString}${orderByString};`;
};

const prepareFilterString = (
  filter: z.infer<typeof sqlInterface>["filter"],
  columnDefinitions: ColumnDefinition[],
) => {
  return filter
    .map((filter) => {
      const column = columnDefinitions.find((x) => x.name === filter.column);
      if (!column) {
        console.error(`Column ${filter.column} not found`);
        throw new Error(`Column ${filter.column} not found`);
      }
      if (filter.type === "datetime") {
        return `${column.internal} ${
          filter.operator
        } '${filter.value.toISOString()}'`;
      } else {
        return `${column.internal} ${filter.operator} '${filter.value}'`;
      }
    })
    .join(" AND ");
};

const prepareGroupBy = (
  table: z.infer<typeof sqlInterface>["from"],
  groupBy: z.infer<typeof sqlInterface>["groupBy"][number],
) => {
  const internalColumn = getColumnSql(table, groupBy.column).internal;
  if (groupBy.type === "datetime") {
    return `date_series."date"`;
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
      ? dateTimeFilters.find((x) => x.operator === ">" || x.operator === ">=")
      : undefined;

  const maxDateColumn =
    dateTimeFilters.length > 1
      ? dateTimeFilters.find((x) => x.operator === "<" || x.operator === "<=")
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

    const cteString = `
      WITH date_series AS (
        SELECT generate_series('${minDateColumn.value.toISOString()}'::timestamp, '${maxDateColumn.value.toISOString()}'::timestamp, '${mapTemporalUnitToInterval(
          groupByColumn.temporalUnit,
        )}') as date
      )
    `;

    const modifiedFrom = ` FROM date_series LEFT JOIN ${getTableSql(
      from,
    )} ON DATE_TRUNC('${groupByColumn.temporalUnit}', ${
      startColumn.internal
    }) = DATE_TRUNC('${groupByColumn.temporalUnit}', date_series.date)`;

    return { cte: cteString, from: modifiedFrom, column: startColumn };
  }

  return undefined;
};

const getTableSql = (table: z.infer<typeof sqlInterface>["from"]): string => {
  return tableDefinitions[table]!.table;
};

const getColumnSql = (
  table: z.infer<typeof sqlInterface>["from"],
  column: string,
): ColumnDefinition => {
  const foundColumn = tableDefinitions[table]!.columns.find((c) => {
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

function capitalizeFirstLetter(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
