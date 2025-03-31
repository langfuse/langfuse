import { z } from "zod";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  filterInterface,
  type groupByInterface,
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
            // "traces-total",
            // "traces-grouped-by-name",
            // "observations-model-cost",
            "score-aggregate",
            // "traces-timeseries",
            // "observations-total-cost-by-model-timeseries",
            // Cost by type and usage by type are currently not supported in the new data model
            "observations-usage-by-type-timeseries",
            "observations-cost-by-type-timeseries",
            // "distinct-models",
            // "scores-aggregate-timeseries",
            // "observations-usage-by-users",
            // "traces-grouped-by-user",
            // "observation-latencies-aggregated",
            // "traces-latencies-aggregated",
            // "model-latencies-over-time",
            // "numeric-score-time-series",
            // "categorical-score-chart",
            // "observations-status-timeseries",
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
        // case "traces-total":
        //   const count = await getTotalTraces(
        //     input.projectId,
        //     input.filter ?? [],
        //   );
        //   return count as DatabaseRow[];
        // case "traces-grouped-by-name":
        //   return (
        //     await getTracesGroupedByName(
        //       input.projectId,
        //       dashboardColumnDefinitions,
        //       input.filter,
        //     )
        //   ).map(
        //     (row) =>
        //       ({
        //         traceName: row.name,
        //         countTraceId: row.count,
        //       }) as DatabaseRow,
        //   );
        // case "observations-model-cost":
        //   const cost = await getObservationsCostGroupedByName(
        //     input.projectId,
        //     input.filter ?? [],
        //   );
        //
        //   return cost.map((row) => ({
        //     model: row.name,
        //     sumCalculatedTotalCost: row.sum_cost_details,
        //     sumTotalTokens: row.sum_usage_details,
        //   })) as DatabaseRow[];
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
        // case "traces-timeseries":
        //   const rows = await groupTracesByTime(
        //     input.projectId,
        //     input.filter ?? [],
        //   );
        //
        //   return rows as DatabaseRow[];
        // case "observations-total-cost-by-model-timeseries":
        //   const dateTruncObs = extractTimeSeries(input.groupBy);
        //   if (!dateTruncObs) {
        //     return [];
        //   }
        //   const rowsObs = await getTotalObservationUsageByTimeByModel(
        //     input.projectId,
        //     input.filter ?? [],
        //   );
        //
        //   return rowsObs as DatabaseRow[];
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
        // case "distinct-models":
        //   const models = await getDistinctModels(
        //     input.projectId,
        //     input.filter ?? [],
        //   );
        //   return models as DatabaseRow[];
        // case "scores-aggregate-timeseries":
        //   const aggregatedScores = await getScoresAggregateOverTime(
        //     input.projectId,
        //     input.filter ?? [],
        //   );
        //
        //   return aggregatedScores as DatabaseRow[];
        // case "observations-usage-by-users":
        //   const rowsUsers = await getModelUsageByUser(
        //     input.projectId,
        //     input.filter ?? [],
        //   );
        //
        //   return rowsUsers.map((row) => ({
        //     sumTotalTokens: row.sumUsageDetails,
        //     sumCalculatedTotalCost: row.sumCostDetails,
        //     user: row.userId,
        //   })) as DatabaseRow[];
        // case "traces-grouped-by-user":
        //   const traces = await getTracesGroupedByUsers(
        //     input.projectId,
        //     input.filter ?? [],
        //     undefined,
        //     1000,
        //     0,
        //     dashboardColumnDefinitions,
        //   );
        //
        //   return traces.map((row) => ({
        //     user: row.user,
        //     countTraceId: Number(row.count),
        //   })) as DatabaseRow[];
        // case "observation-latencies-aggregated":
        //   const latencies = await getObservationLatencies(
        //     input.projectId,
        //     input.filter ?? [],
        //   );
        //
        //   return latencies.map((row) => ({
        //     name: row.name,
        //     percentile50Duration: row.p50,
        //     percentile90Duration: row.p90,
        //     percentile95Duration: row.p95,
        //     percentile99Duration: row.p99,
        //   })) as DatabaseRow[];
        // case "model-latencies-over-time":
        //   const modelLatencies = await getModelLatenciesOverTime(
        //     input.projectId,
        //     input.filter ?? [],
        //   );
        //
        //   return modelLatencies.map((row) => ({
        //     model: row.model,
        //     startTime: row.start_time,
        //     percentile50Duration: row.p50,
        //     percentile75Duration: row.p75,
        //     percentile90Duration: row.p90,
        //     percentile95Duration: row.p95,
        //     percentile99Duration: row.p99,
        //   })) as DatabaseRow[];
        // case "traces-latencies-aggregated":
        //   const traceLatencies = await getTracesLatencies(
        //     input.projectId,
        //     input.filter ?? [],
        //   );
        //
        //   return traceLatencies.map((row) => ({
        //     traceName: row.name,
        //     percentile50Duration: row.p50,
        //     percentile90Duration: row.p90,
        //     percentile95Duration: row.p95,
        //     percentile99Duration: row.p99,
        //   })) as DatabaseRow[];
        // case "numeric-score-time-series":
        //   const dateTruncNumericScoreTimeSeries = extractTimeSeries(
        //     input.groupBy,
        //   );
        //   if (!dateTruncNumericScoreTimeSeries) {
        //     return [];
        //   }
        //   const numericScoreTimeSeries = await getNumericScoreTimeSeries(
        //     input.projectId,
        //     input.filter ?? [],
        //   );
        //   return numericScoreTimeSeries as DatabaseRow[];
        // case "categorical-score-chart":
        //   const categoricalScoreTimeSeries =
        //     await getCategoricalScoreTimeSeries(
        //       input.projectId,
        //       input.filter ?? [],
        //     );
        //   return categoricalScoreTimeSeries as DatabaseRow[];
        // case "observations-status-timeseries":
        //   return (await getObservationsStatusTimeSeries(
        //     input.projectId,
        //     input.filter ?? [],
        //   )) as DatabaseRow[];
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

const extractTimeSeries = (groupBy?: z.infer<typeof groupByInterface>) => {
  const temporal = groupBy?.find((group) => {
    if (group.type === "datetime") {
      return group;
    }
  });
  return temporal?.type === "datetime" ? temporal.temporalUnit : undefined;
};

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
