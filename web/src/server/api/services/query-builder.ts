import {
  type singleFilter,
  type timeFilter,
  type ColumnDefinition,
  tableColumnsToSqlFilter,
} from "@langfuse/shared";
import { Prisma, type PrismaClient } from "@langfuse/shared/src/db";
import Decimal from "decimal.js";
import { type z } from "zod";
import {
  sqlInterface,
  aggregations,
  groupByInterface,
  filterInterface,
} from "./sqlInterface";
import { tableDefinitions } from "./tableDefinitions";

export type InternalDatabaseRow = {
  [key: string]: bigint | number | Decimal | string | Date;
};

export type DatabaseRow = {
  [key: string]: string | number | Date | null;
};

export const executeQuery = async (
  prisma: PrismaClient,
  projectId: string,
  unsafeQuery: z.TypeOf<typeof sqlInterface>,
) => {
  const query = sqlInterface.parse(unsafeQuery);
  const sql = enrichAndCreateQuery(projectId, query);
  const response = await prisma.$queryRaw<InternalDatabaseRow[]>(sql);

  const parsedResult = outputParser(response);

  return parsedResult;
};

export const enrichAndCreateQuery = (
  projectId: string,
  queryUnsafe: z.TypeOf<typeof sqlInterface>,
) => {
  const query = sqlInterface.parse(queryUnsafe);
  return createQuery({
    ...query,
    filter: [
      ...(query.filter ?? []),
      ...getMandatoryFilter(query.from, projectId),
    ],
  });
};

export const createQuery = (queryUnsafe: z.TypeOf<typeof sqlInterface>) => {
  const query = sqlInterface.parse(queryUnsafe);

  const cte = createDateRangeCte(
    query.from,
    query.filter ?? [],
    query.groupBy ?? [],
  );

  const fromString = cte?.from ?? Prisma.sql` FROM ${getTableSql(query.from)}`;

  // raw mandatory everywhere here as this creates the selection
  // agg is typed via zod
  // column names come from our defs via the table definitions
  const selectedColumns = query.select.map((selectedColumn) => {
    const safeColumn = getColumnDefinition(query.from, selectedColumn.column);
    const safeAgg = aggregations.parse(selectedColumn.agg);
    const columnDefinition = createAggregatedColumn(safeColumn, safeAgg);
    return safeAgg
      ? Prisma.sql`${columnDefinition} as "${createOutputColumnName(
          safeColumn,
          safeAgg,
        )}"`
      : Prisma.sql`${columnDefinition} as "${Prisma.raw(safeColumn.id)}"`;
  });

  if (cte)
    // raw mandatory here
    selectedColumns.unshift(
      Prisma.sql`date_series."date" as "${Prisma.raw(cte.column.id)}"`,
    );

  let groupString = Prisma.empty;

  if ((query.groupBy && query.groupBy.length > 0) || cte) {
    const groupByFields = (query.groupBy ?? []).map((groupBy) =>
      prepareGroupBy(query.from, groupBy),
    );
    groupString =
      groupByFields.length > 0
        ? Prisma.sql` GROUP BY ${Prisma.join(groupByFields, ", ")}`
        : Prisma.empty;
  }
  const selectString =
    selectedColumns.length > 0
      ? Prisma.sql` SELECT ${Prisma.join(selectedColumns, ", ")}`
      : Prisma.empty;

  const orderByString = prepareOrderByString(
    query.from,
    query.orderBy,
    cte ? true : false,
  );

  const filterString =
    query.filter && query.filter.length > 0
      ? Prisma.sql` ${
          cte ? Prisma.sql` AND ` : Prisma.sql` WHERE `
        } ${tableColumnsToSqlFilter(query.filter, tableDefinitions[query.from]!.columns, query.from)}`
      : Prisma.empty;

  const limitString = query.limit
    ? Prisma.sql` LIMIT ${query.limit}`
    : Prisma.empty;

  return Prisma.sql`${
    cte?.cte ?? Prisma.empty
  }${selectString}${fromString}${filterString}${groupString}${orderByString}${limitString};`;
};

const createOutputColumnName = (
  columnDefinition: ColumnDefinition,
  safeAgg: z.infer<typeof aggregations>,
): Prisma.Sql => {
  if (!safeAgg) return Prisma.empty;
  if (["SUM", "AVG", "COUNT", "MAX", "MIN"].includes(safeAgg)) {
    return Prisma.sql`${Prisma.raw(safeAgg.toLowerCase())}${Prisma.raw(
      capitalizeFirstLetter(columnDefinition.id),
    )}`;
  }

  if (safeAgg === "50thPercentile") {
    return Prisma.sql`percentile50${Prisma.raw(
      capitalizeFirstLetter(columnDefinition.id),
    )}`;
  }
  if (safeAgg === "75thPercentile") {
    return Prisma.sql`percentile75${Prisma.raw(
      capitalizeFirstLetter(columnDefinition.id),
    )}`;
  }
  if (safeAgg === "90thPercentile") {
    return Prisma.sql`percentile90${Prisma.raw(
      capitalizeFirstLetter(columnDefinition.id),
    )}`;
  }
  if (safeAgg === "95thPercentile") {
    return Prisma.sql`percentile95${Prisma.raw(
      capitalizeFirstLetter(columnDefinition.id),
    )}`;
  }
  if (safeAgg === "99thPercentile") {
    return Prisma.sql`percentile99${Prisma.raw(
      capitalizeFirstLetter(columnDefinition.id),
    )}`;
  }
  return Prisma.empty;
};

const createAggregatedColumn = (
  columnDefinition: ColumnDefinition,
  agg?: z.infer<typeof aggregations>,
): Prisma.Sql => {
  // raw mandatory everywhere here as this creates the selection
  // agg is typed via zod
  // column names come from our defs via the table definitions

  switch (agg) {
    case "AVG":
    case "COUNT":
    case "MAX":
    case "MIN":
    case "SUM":
      return Prisma.sql`${Prisma.raw(
        aggregations.parse(agg) as string,
      )}(${getInternalSql(columnDefinition)})`;
    case "50thPercentile":
      return Prisma.sql`percentile_disc(0.5) within group (order by ${getInternalSql(
        columnDefinition,
      )})`;
    case "75thPercentile":
      return Prisma.sql`percentile_disc(0.75) within group (order by ${getInternalSql(
        columnDefinition,
      )})`;
    case "90thPercentile":
      return Prisma.sql`percentile_disc(0.9) within group (order by ${getInternalSql(
        columnDefinition,
      )})`;
    case "95thPercentile":
      return Prisma.sql`percentile_disc(0.95) within group (order by ${getInternalSql(
        columnDefinition,
      )})`;
    case "99thPercentile":
      return Prisma.sql`percentile_disc(0.99) within group (order by ${getInternalSql(
        columnDefinition,
      )})`;
    case undefined:
      return Prisma.sql`${getInternalSql(columnDefinition)}`;
  }
};

const prepareOrderByString = (
  from: z.infer<typeof sqlInterface>["from"],
  orderBy: z.infer<typeof sqlInterface>["orderBy"],
  hasCte: boolean,
): Prisma.Sql => {
  const orderBys = (orderBy ?? []).map((orderBy) => {
    // raw mandatory here
    const safeColumn = getColumnDefinition(from, orderBy.column);
    const safeAgg = aggregations.parse(orderBy.agg);
    return Prisma.sql`${createAggregatedColumn(
      safeColumn,
      safeAgg,
    )} ${Prisma.raw(orderBy.direction)} ${Prisma.raw(orderBy.direction === "DESC" ? "NULLS LAST" : "NULLS FIRST")}`;
  });
  const addedCte = hasCte
    ? [Prisma.sql`date_series."date" ASC`, ...orderBys]
    : orderBys;

  return addedCte.length > 0
    ? Prisma.sql` ORDER BY ${Prisma.join(addedCte, ", ")}`
    : Prisma.empty;
};

const prepareGroupBy = (
  table: z.infer<typeof sqlInterface>["from"],
  groupBy: z.infer<typeof groupByInterface>[number],
) => {
  const internalColumn = getInternalSql(
    getColumnDefinition(table, groupBy.column),
  );
  if (groupBy.type === "datetime") {
    return Prisma.sql`date_series."date"`;
  } else {
    return internalColumn;
  }
};

function isTimeRangeFilter(
  filter: z.infer<typeof filterInterface>[number],
): filter is z.infer<typeof timeFilter> {
  return filter.type === "datetime";
}

const createDateRangeCte = (
  fromUnsafe: z.infer<typeof sqlInterface>["from"],
  filtersUnsafe: z.infer<typeof singleFilter>[],
  groupByUnsafe: z.infer<typeof groupByInterface>,
) => {
  const from = sqlInterface.shape.from.parse(fromUnsafe);
  const groupBy = groupByInterface.parse(groupByUnsafe);
  const filters = filterInterface.parse(filtersUnsafe);

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
      minDateColumn.column !== groupByColumn.column ||
      maxDateColumn.column !== groupByColumn.column
    ) {
      throw new Error(
        "Min date column, max date column must match group by column",
      );
    }

    const startColumn = getColumnDefinition(from, minDateColumn.column);

    // raw mandatory for temporal unit. From and to are parameterised values
    // temporal unit is typed
    const cteString = Prisma.sql`
      WITH date_series AS (
        SELECT generate_series(${minDateColumn.value}, ${
          maxDateColumn.value
        }, '1 ${Prisma.raw(groupByColumn.temporalUnit)}') as date
      )
    `;

    // as above, raw is mandatory for columns and temporal unit
    const modifiedFrom = Prisma.sql` FROM date_series LEFT JOIN ${getTableSql(
      from,
    )} ON DATE_TRUNC('${Prisma.raw(
      groupByColumn.temporalUnit,
    )}', ${getInternalSql(startColumn)}) = DATE_TRUNC('${Prisma.raw(
      groupByColumn.temporalUnit,
    )}', date_series."date")`;

    return { cte: cteString, from: modifiedFrom, column: startColumn };
  }

  return undefined;
};

const getTableSql = (
  tableUnsafe: z.infer<typeof sqlInterface>["from"],
): Prisma.Sql => {
  const table = sqlInterface.shape.from.parse(tableUnsafe);
  return Prisma.raw(tableDefinitions[table]!.table);
};

const getColumnDefinition = (
  tableUnsafe: z.infer<typeof sqlInterface>["from"],
  column: string,
): ColumnDefinition => {
  const table = sqlInterface.shape.from.parse(tableUnsafe);

  const foundColumn = tableDefinitions[table]!.columns.find((c) => {
    return c.id === column;
  });
  if (!foundColumn) {
    console.error(`Column "${column}" not found in table ${table}`);
    throw new Error(`Column "${column}" not found in table ${table}`);
  }
  return foundColumn;
};

const getInternalSql = (colDef: ColumnDefinition): Prisma.Sql =>
  // raw required here, everything is typed
  Prisma.raw(colDef.internal);

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
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
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

const getMandatoryFilter = (
  tableUnsafe: z.infer<typeof sqlInterface>["from"],
  projectId: string,
) => {
  const table = sqlInterface.shape.from.parse(tableUnsafe);

  const observationFilter = {
    type: "string" as const,
    column: "observationsProjectId",
    operator: "=" as const,
    value: projectId,
  };

  const traceFilter = {
    type: "string" as const,
    column: "tracesProjectId",
    operator: "=" as const,
    value: projectId,
  };

  switch (table) {
    case "traces":
    case "traces_scores":
    case "traces_metrics":
      return [traceFilter];
    case "traces_observations":
    case "traces_observationsview":
    case "traces_parent_observation_scores":
      return [traceFilter, observationFilter];
    case "observations":
      return [observationFilter];
  }
};
