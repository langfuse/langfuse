import { ObservationView, Prisma } from "@prisma/client";
import {
  datetimeFilterToPrismaSql,
  tableColumnsToSqlFilterAndPrefix,
} from "../filterToPrisma";
import { orderByToPrismaSql } from "../orderByToPrisma";
import { observationsTableCols } from "../../observationsTable";
import { TableFilters } from "./types";

type AdditionalObservationFields = {
  traceName: string | null;
  promptName: string | null;
  promptVersion: string | null;
  traceTags: Array<string>;
};

type FullObservation = AdditionalObservationFields & ObservationView;

export type FullObservations = Array<FullObservation>;

export type FullObservationsWithScores = Array<
  FullObservation & { scores?: Record<string, string[] | number[]> | null }
>;

export type IOAndMetadataOmittedObservations = Array<
  Omit<ObservationView, "input" | "output" | "metadata"> &
    AdditionalObservationFields
>;

export function parseGetAllGenerationsInput(filters: TableFilters) {
  const searchCondition = filters.searchQuery
    ? Prisma.sql`AND (
        o."id" ILIKE ${`%${filters.searchQuery}%`} OR
        o."name" ILIKE ${`%${filters.searchQuery}%`} OR
        o."model" ILIKE ${`%${filters.searchQuery}%`} OR
        t."name" ILIKE ${`%${filters.searchQuery}%`}
      )`
    : Prisma.empty;

  const filterCondition = tableColumnsToSqlFilterAndPrefix(
    filters.filter ?? [],
    observationsTableCols,
    "observations"
  );

  const orderByCondition = orderByToPrismaSql(
    filters.orderBy,
    observationsTableCols
  );

  // to improve query performance, add timeseries filter to observation queries as well
  const startTimeFilter = filters.filter?.find(
    (f) => f.column === "Start Time" && f.type === "datetime"
  );

  const datetimeFilter =
    startTimeFilter && startTimeFilter.type === "datetime"
      ? datetimeFilterToPrismaSql(
          "start_time",
          startTimeFilter.operator,
          startTimeFilter.value
        )
      : Prisma.empty;

  return {
    searchCondition,
    filterCondition,
    orderByCondition,
    datetimeFilter,
  };
}

export function createGenerationsQuery({
  projectId,
  datetimeFilter = Prisma.empty,
  page,
  limit,
  searchCondition = Prisma.empty,
  filterCondition = Prisma.empty,
  orderByCondition = Prisma.empty,
  selectIOAndMetadata = false,
  selectScoreValues = false,
}: {
  projectId: string;
  datetimeFilter?: Prisma.Sql;
  page?: number;
  limit?: number;
  searchCondition?: Prisma.Sql;
  filterCondition?: Prisma.Sql;
  orderByCondition?: Prisma.Sql;
  selectIOAndMetadata?: boolean;
  selectScoreValues?: boolean;
}) {
  return Prisma.sql`
  WITH scores_avg AS (
        SELECT
          trace_id,
          observation_id,
          ${selectScoreValues ? Prisma.sql`jsonb_object_agg(name::text, "values") AS "scores_values",` : Prisma.empty}
          jsonb_object_agg(name::text, avg_value::double precision) AS "scores_avg"
        FROM (
          SELECT
            trace_id,
            observation_id,
            name,
            ${selectScoreValues ? Prisma.sql`array_agg(COALESCE(string_value, value::text)) AS "values",` : Prisma.empty}
            avg(value) avg_value,
            comment
          FROM
            scores
          WHERE
            project_id = ${projectId}
            ${selectScoreValues ? Prisma.empty : Prisma.sql`AND scores."data_type" IN ('NUMERIC', 'BOOLEAN')`}
          GROUP BY
            trace_id,
            observation_id,
            name,
            comment
          ORDER BY
            trace_id
          ) tmp
        GROUP BY
          trace_id, 
          observation_id
      )
      SELECT
        ${selectScoreValues ? Prisma.sql`s_avg."scores_values" AS "scores",` : Prisma.empty}
        o.id,
        o.name,
        o.model,
        o."modelParameters",
        o.start_time as "startTime",
        o.end_time as "endTime",
        ${selectIOAndMetadata ? Prisma.sql`o.input, o.output, o.metadata,` : Prisma.empty} 
        o.trace_id as "traceId",
        t.name as "traceName",
        o.completion_start_time as "completionStartTime",
        o.time_to_first_token as "timeToFirstToken",
        o.prompt_tokens as "promptTokens",
        o.completion_tokens as "completionTokens",
        o.total_tokens as "totalTokens",
        o.unit,
        o.level,
        o.status_message as "statusMessage",
        o.version,
        o.model_id as "modelId",
        o.input_price as "inputPrice",
        o.output_price as "outputPrice",
        o.total_price as "totalPrice",
        o.calculated_input_cost as "calculatedInputCost",
        o.calculated_output_cost as "calculatedOutputCost",
        o.calculated_total_cost as "calculatedTotalCost",
        o."latency",
        o.prompt_id as "promptId",
        p.name as "promptName",
        p.version as "promptVersion",
        t.tags as "traceTags"
      FROM observations_view o
      JOIN traces t ON t.id = o.trace_id AND t.project_id = ${projectId}
      LEFT JOIN scores_avg AS s_avg ON s_avg.trace_id = t.id and s_avg.observation_id = o.id
      LEFT JOIN prompts p ON p.id = o.prompt_id AND p.project_id = ${projectId}
      WHERE
        o.project_id = ${projectId}
        AND o.type = 'GENERATION'
        ${datetimeFilter}
        ${searchCondition}
        ${filterCondition}
        ${orderByCondition}
      ${limit ? Prisma.sql`LIMIT ${limit}` : Prisma.empty}
      ${page && limit ? Prisma.sql`OFFSET ${page * limit}` : Prisma.empty}
    `;
}
