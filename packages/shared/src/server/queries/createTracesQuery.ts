import { Prisma } from "@prisma/client";
import { TableFilters } from "./types";
import {
  datetimeFilterToPrismaSql,
  tableColumnsToSqlFilterAndPrefix,
} from "../filterToPrisma";
import { tracesTableCols } from "../../tracesTable";
import { orderByToPrismaSql } from "../orderByToPrisma";

export function parseTraceAllFilters(input: TableFilters) {
  const filterCondition = tableColumnsToSqlFilterAndPrefix(
    input.filter ?? [],
    tracesTableCols,
    "traces"
  );
  const orderByCondition = orderByToPrismaSql(input.orderBy, tracesTableCols);

  // to improve query performance, add timeseries filter to observation queries as well
  const timeseriesFilter = input.filter?.find(
    (f) => f.column === "Timestamp" && f.type === "datetime"
  );

  const observationTimeseriesFilter =
    timeseriesFilter && timeseriesFilter.type === "datetime"
      ? datetimeFilterToPrismaSql(
          "start_time",
          timeseriesFilter.operator,
          timeseriesFilter.value
        )
      : Prisma.empty;

  const searchCondition = input.searchQuery
    ? Prisma.sql`AND (
    t."id" ILIKE ${`%${input.searchQuery}%`} OR 
    t."external_id" ILIKE ${`%${input.searchQuery}%`} OR 
    t."user_id" ILIKE ${`%${input.searchQuery}%`} OR 
    t."name" ILIKE ${`%${input.searchQuery}%`}
  )`
    : Prisma.empty;

  return {
    filterCondition,
    orderByCondition,
    observationTimeseriesFilter,
    searchCondition,
  };
}

export function createTracesQuery({
  select,
  projectId,
  observationTimeseriesFilter = Prisma.empty,
  page,
  limit,
  searchCondition = Prisma.empty,
  filterCondition = Prisma.empty,
  orderByCondition = Prisma.empty,
  selectScoreValues = false,
}: {
  select: Prisma.Sql;
  projectId: string;
  observationTimeseriesFilter?: Prisma.Sql;
  page?: number;
  limit?: number;
  searchCondition?: Prisma.Sql;
  filterCondition?: Prisma.Sql;
  orderByCondition?: Prisma.Sql;
  selectScoreValues?: boolean;
}) {
  return Prisma.sql`
  SELECT
      ${select}
  FROM
    "traces" AS t
  LEFT JOIN LATERAL (
    SELECT
      SUM(prompt_tokens) AS "promptTokens",
      SUM(completion_tokens) AS "completionTokens",
      SUM(total_tokens) AS "totalTokens",
      SUM(calculated_total_cost) AS "calculatedTotalCost",
      SUM(calculated_input_cost) AS "calculatedInputCost",
      SUM(calculated_output_cost) AS "calculatedOutputCost",
      COALESCE(  
        MAX(CASE WHEN level = 'ERROR' THEN 'ERROR' END),  
        MAX(CASE WHEN level = 'WARNING' THEN 'WARNING' END),  
        MAX(CASE WHEN level = 'DEFAULT' THEN 'DEFAULT' END),  
        'DEBUG'  
      ) AS "level"
    FROM
      "observations_view"
    WHERE
      trace_id = t.id
      AND "type" = 'GENERATION'
      AND "project_id" = ${projectId}
      ${observationTimeseriesFilter}
  ) AS tm ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS "observationCount",
      EXTRACT(EPOCH FROM COALESCE(MAX("end_time"), MAX("start_time"))) - EXTRACT(EPOCH FROM MIN("start_time"))::double precision AS "latency"
    FROM
        "observations"
    WHERE
        trace_id = t.id
        AND "project_id" = ${projectId}
         ${observationTimeseriesFilter}
  ) AS tl ON true
  LEFT JOIN LATERAL (
    SELECT
      ${selectScoreValues ? Prisma.sql`jsonb_object_agg(name::text, "values") AS "scores_values",` : Prisma.empty}
      jsonb_object_agg(name::text, avg_value::double precision) AS "scores_avg"
    FROM (
        SELECT
            name,
            ${selectScoreValues ? Prisma.sql`array_agg(COALESCE(string_value, value::text)) AS "values",` : Prisma.empty}
            AVG(value) avg_value
        FROM
            scores
        WHERE
            trace_id = t.id
            AND t."project_id" = ${projectId}     
            ${selectScoreValues ? Prisma.empty : Prisma.sql`AND scores."data_type" IN ('NUMERIC', 'BOOLEAN')`}
        GROUP BY
            name
    ) tmp
  ) AS s_avg ON true
  WHERE 
    t."project_id" = ${projectId}
    ${searchCondition}
    ${filterCondition}
  ${orderByCondition}
  ${limit ? Prisma.sql`LIMIT ${limit}` : Prisma.empty}
  ${page && limit ? Prisma.sql`OFFSET ${page * limit}` : Prisma.empty}
`;
}
