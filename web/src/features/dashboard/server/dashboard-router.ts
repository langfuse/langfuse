import { z } from "zod";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  filterInterface,
  sqlInterface,
} from "@/src/server/api/services/sqlInterface";
import { createHistogramData } from "@/src/features/dashboard/lib/score-analytics-utils";
import { TRPCError } from "@trpc/server";
import {
  getScoreAggregate,
  getNumericScoreHistogram,
  extractFromAndToTimestampsFromFilter,
  logger,
  getObservationCostByTypeByTime,
  getObservationUsageByTypeByTime,
  queryClickhouse,
} from "@langfuse/shared/src/server";
import { type DatabaseRow } from "@/src/server/api/services/sqlInterface";
import { QueryBuilder } from "@/src/features/query/server/queryBuilder";
import {
  type QueryType,
  query as customQuery,
} from "@/src/features/query/types";

export const dashboardRouter = createTRPCRouter({
  chart: protectedProjectProcedure
    .input(
      sqlInterface.extend({
        projectId: z.string(),
        filter: filterInterface.optional(),
        queryName: z
          .enum([
            // Current score table is weird and does not fit into new model. Keep around as is until we decide what to do with it.
            "score-aggregate",
            // Cost by type and usage by type are currently not supported in the new data model.
            "observations-usage-by-type-timeseries",
            "observations-cost-by-type-timeseries",
          ])
          .nullish(),
      }),
    )
    .query(async ({ input }) => {
      const [from, to] = extractFromAndToTimestampsFromFilter(input.filter);

      if (from.value > to.value) {
        logger.error(
          `from > to, returning empty result: from=${from}, to=${to}`,
        );
        return [];
      }

      switch (input.queryName) {
        case "score-aggregate":
          const scores = await getScoreAggregate(
            input.projectId,
            input.filter ?? [],
          );
          return scores.map((row) => ({
            scoreName: row.name,
            scoreSource: row.source,
            scoreDataType: row.data_type,
            avgValue: row.avg_value,
            countScoreId: Number(row.count),
          })) as DatabaseRow[];
        case "observations-usage-by-type-timeseries":
          const rowsObsType = await getObservationUsageByTypeByTime(
            input.projectId,
            input.filter ?? [],
          );
          return rowsObsType as DatabaseRow[];
        case "observations-cost-by-type-timeseries":
          const rowsObsCostByType = await getObservationCostByTypeByTime(
            input.projectId,
            input.filter ?? [],
          );
          return rowsObsCostByType as DatabaseRow[];
        default:
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Query not found",
          });
      }
    }),
  scoreHistogram: protectedProjectProcedure
    .input(
      sqlInterface.extend({
        projectId: z.string(),
        filter: filterInterface.optional(),
      }),
    )
    .query(async ({ input }) => {
      const data = await getNumericScoreHistogram(
        input.projectId,
        input.filter ?? [],
        input.limit ?? 10000,
      );
      return createHistogramData(data);
    }),
  executeQuery: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        query: customQuery,
      }),
    )
    .query(async ({ input }) => {
      return executeQuery(input.projectId, input.query as QueryType);
    }),
});

/**
 * Execute a query using the QueryBuilder.
 *
 * @param projectId - The project ID
 * @param query - The query configuration as defined in QueryType
 * @returns The query result data
 */
export async function executeQuery(
  projectId: string,
  query: QueryType,
): Promise<Array<Record<string, unknown>>> {
  try {
    const { query: compiledQuery, parameters } = new QueryBuilder().build(
      query,
      projectId,
    );

    const result = await queryClickhouse<Record<string, unknown>>({
      query: compiledQuery,
      params: parameters,
      clickhouseConfigs: {
        clickhouse_settings: {
          date_time_output_format: "iso",
        },
      },
      tags: {
        feature: "custom-queries",
        type: query.view,
        kind: "analytic",
        projectId,
      },
    });
    return result;
  } catch (error) {
    logger.error("Error executing query", error, { projectId, query });
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to execute query",
      cause: error,
    });
  }
}
