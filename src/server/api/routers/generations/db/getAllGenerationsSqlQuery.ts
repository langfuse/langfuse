import {
  datetimeFilterToPrismaSql,
  filterToPrismaSql,
} from "@/src/features/filters/server/filterToPrisma";
import { orderByToPrismaSql } from "@/src/features/orderBy/server/orderByToPrisma";
import { observationsTableCols } from "@/src/server/api/definitions/observationsTable";
import { Prisma } from "@prisma/client";

import { type GenerationsExportInput } from "../exportQuery";
import { type GetAllGenerationsInput } from "../getAllQuery";

type GetSqlFromInputParams =
  | {
      input: GenerationsExportInput;
      type: "export";
    }
  | { input: GetAllGenerationsInput; type: "paginate" };

export function getAllGenerationsSqlQuery({
  input,
  type,
}: GetSqlFromInputParams) {
  const searchCondition = input.searchQuery
    ? Prisma.sql`AND (
        o."id" ILIKE ${`%${input.searchQuery}%`} OR
        o."name" ILIKE ${`%${input.searchQuery}%`} OR
        o."model" ILIKE ${`%${input.searchQuery}%`} OR
        t."name" ILIKE ${`%${input.searchQuery}%`}
      )`
    : Prisma.empty;

  const filterCondition = filterToPrismaSql(
    input.filter,
    observationsTableCols,
  );

  const orderByCondition = orderByToPrismaSql(
    input.orderBy,
    observationsTableCols,
  );

  // to improve query performance, add timeseries filter to observation queries as well
  const startTimeFilter = input.filter.find(
    (f) => f.column === "start_time" && f.type === "datetime",
  );
  const datetimeFilter =
    startTimeFilter && startTimeFilter.type === "datetime"
      ? datetimeFilterToPrismaSql(
          "start_time",
          startTimeFilter.operator,
          startTimeFilter.value,
        )
      : Prisma.empty;

  // For exports: use a date cutoff filter to ignore ingested rows
  const dateCutoffFilter =
    type === "export"
      ? datetimeFilterToPrismaSql("start_time", "<", new Date())
      : Prisma.empty;

  // For UI pagination: set LIMIT and OFFSET
  const pagination =
    type === "paginate"
      ? Prisma.sql`LIMIT ${input.limit} OFFSET ${input.page * input.limit}`
      : Prisma.empty;

  const rawSqlQuery = Prisma.sql`
      WITH observations_with_latency AS (
        SELECT
          o.*,
          CASE WHEN o.end_time IS NULL THEN NULL ELSE (EXTRACT(EPOCH FROM o."end_time") - EXTRACT(EPOCH FROM o."start_time"))::double precision END AS "latency"
        FROM observations_view o
        WHERE o.type = 'GENERATION'
        AND o.project_id = ${input.projectId}
        ${datetimeFilter}
        ${dateCutoffFilter}
      ),
      -- used for filtering
      scores_avg AS (
        SELECT
          trace_id,
          observation_id,
          jsonb_object_agg(name::text, avg_value::double precision) AS scores_avg
        FROM (
          SELECT
            trace_id,
            observation_id,
            name,
            avg(value) avg_value
          FROM
            scores
          GROUP BY
            1,
            2,
            3
          ORDER BY
            1) tmp
        GROUP BY
          1, 2
      )
      SELECT
        o.id,
        o.name,
        o.model,
        o.start_time as "startTime",
        o.end_time as "endTime",
        o.latency,
        o.input,
        o.output,
        o.metadata,
        o.trace_id as "traceId",
        t.name as "traceName",
        o.completion_start_time as "completionStartTime",
        o.prompt_tokens as "promptTokens",
        o.completion_tokens as "completionTokens",
        o.total_tokens as "totalTokens",
        o.level,
        o.status_message as "statusMessage",
        o.version,
        o.model_id as "modelId",
        o.input_price as "inputPrice",
        o.output_price as "outputPrice",
        o.total_price as "totalPrice",
        o.calculated_input_cost as "calculatedInputCost",
        o.calculated_output_cost as "calculatedOutputCost",
        o.calculated_total_cost as "calculatedTotalCost"
      FROM observations_with_latency o
      JOIN traces t ON t.id = o.trace_id
      LEFT JOIN scores_avg AS s_avg ON s_avg.trace_id = t.id and s_avg.observation_id = o.id
      WHERE
        t.project_id = ${input.projectId}
        ${searchCondition}
        ${filterCondition}
        ${orderByCondition}
        ${pagination}
    `;

  return { rawSqlQuery, datetimeFilter, searchCondition, filterCondition };
}
