import {
  datetimeFilterToPrismaSql,
  tableColumnsToSqlFilterAndPrefix,
  observationsTableCols,
} from "@langfuse/shared";
import { orderByToPrismaSql } from "@langfuse/shared";
import { type ObservationView, Prisma } from "@langfuse/shared/src/db";
import { prisma } from "@langfuse/shared/src/db";
import { type GetAllGenerationsInput } from "../getAllQuery";

type AdditionalObservationFields = {
  traceName: string | null;
  promptName: string | null;
  promptVersion: string | null;
};

export type FullObservations = Array<
  AdditionalObservationFields & ObservationView
>;

export type IOOmittedObservations = Array<
  Omit<ObservationView, "input" | "output"> & AdditionalObservationFields
>;

export async function getAllGenerations({
  input,
  selectIO,
}: {
  input: GetAllGenerationsInput;
  selectIO: boolean;
}) {
  const searchCondition = input.searchQuery
    ? Prisma.sql`AND (
        o."id" ILIKE ${`%${input.searchQuery}%`} OR
        o."name" ILIKE ${`%${input.searchQuery}%`} OR
        o."model" ILIKE ${`%${input.searchQuery}%`} OR
        t."name" ILIKE ${`%${input.searchQuery}%`}
      )`
    : Prisma.empty;

  const filterCondition = tableColumnsToSqlFilterAndPrefix(
    input.filter,
    observationsTableCols,
    "observations",
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

  const query = Prisma.sql`
      WITH scores_avg AS (
        SELECT
          trace_id,
          observation_id,
          jsonb_object_agg(name::text, avg_value::double precision) AS scores_avg
        FROM (
          SELECT
            trace_id,
            observation_id,
            name,
            avg(value) avg_value,
            comment
          FROM
            scores
          WHERE
            project_id = ${input.projectId}
          GROUP BY
            1,
            2,
            3,
            5
          ORDER BY
            1) tmp
        GROUP BY
          1, 2
      )
      SELECT
        o.id,
        o.name,
        o.model,
        o."modelParameters",
        o.start_time as "startTime",
        o.end_time as "endTime",
        ${selectIO ? Prisma.sql`o.input, o.output,` : Prisma.empty} 
        o.metadata,
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
        p.version as "promptVersion"
      FROM observations_view o
      JOIN traces t ON t.id = o.trace_id AND t.project_id = ${input.projectId}
      LEFT JOIN scores_avg AS s_avg ON s_avg.trace_id = t.id and s_avg.observation_id = o.id
      LEFT JOIN prompts p ON p.id = o.prompt_id AND p.project_id = ${input.projectId}
      WHERE
        o.project_id = ${input.projectId}
        AND o.type = 'GENERATION'
        ${datetimeFilter}
        ${searchCondition}
        ${filterCondition}
        ${orderByCondition}
      LIMIT ${input.limit} OFFSET ${input.page * input.limit}
    `;

  const generations: FullObservations | IOOmittedObservations = selectIO
    ? await prisma.$queryRaw(query)
    : await prisma.$queryRaw(query);

  const scores = await prisma.score.findMany({
    where: {
      projectId: input.projectId,
      observationId: {
        in: generations.map((gen) => gen.id),
      },
    },
  });

  const fullGenerations = generations.map((generation) => {
    const filteredScores = scores.filter(
      (s) => s.observationId === generation.id,
    );
    return {
      ...generation,
      scores: filteredScores,
    };
  });

  return {
    generations: fullGenerations,
    datetimeFilter,
    searchCondition,
    filterCondition,
  };
}
