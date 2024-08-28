import { aggregateScores } from "@/src/features/scores/lib/aggregateScores";
import {
  datetimeFilterToPrismaSql,
  filterAndValidateDbScoreList,
  observationsTableCols,
  orderByToPrismaSql,
  tableColumnsToSqlFilterAndPrefix,
} from "@langfuse/shared";
import { type ObservationView, Prisma, prisma } from "@langfuse/shared/src/db";

import { type GetAllGenerationsInput } from "../getAllQueries";
import { traceException } from "@langfuse/shared/src/server";

type AdditionalObservationFields = {
  traceName: string | null;
  promptName: string | null;
  promptVersion: string | null;
  traceTags: Array<string>;
};

export type FullObservations = Array<
  AdditionalObservationFields & ObservationView
>;

export type IOAndMetadataOmittedObservations = Array<
  Omit<ObservationView, "input" | "output" | "metadata"> &
    AdditionalObservationFields
>;

export function parseGetAllGenerationsInput(input: GetAllGenerationsInput) {
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
    (f) => f.column === "Start Time" && f.type === "datetime",
  );
  const datetimeFilter =
    startTimeFilter && startTimeFilter.type === "datetime"
      ? datetimeFilterToPrismaSql(
          "start_time",
          startTimeFilter.operator,
          startTimeFilter.value,
        )
      : Prisma.empty;

  return {
    searchCondition,
    filterCondition,
    orderByCondition,
    datetimeFilter,
  };
}

export async function getAllGenerations({
  input,
  selectIOAndMetadata,
}: {
  input: GetAllGenerationsInput;
  selectIOAndMetadata: boolean;
}) {
  const { searchCondition, filterCondition, orderByCondition, datetimeFilter } =
    parseGetAllGenerationsInput(input);

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
          AND scores."data_type" IN ('NUMERIC', 'BOOLEAN')
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

  const generations: FullObservations | IOAndMetadataOmittedObservations =
    selectIOAndMetadata
      ? ((await prisma.$queryRaw(query)) as FullObservations)
      : ((await prisma.$queryRaw(query)) as IOAndMetadataOmittedObservations);

  const scores = await prisma.score.findMany({
    where: {
      projectId: input.projectId,
      observationId: {
        in: generations.map((gen) => gen.id),
      },
    },
  });
  const validatedScores = filterAndValidateDbScoreList(scores, traceException);

  const fullGenerations = generations.map((generation) => {
    const filteredScores = aggregateScores(
      validatedScores.filter((s) => s.observationId === generation.id),
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
