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
  getTotalTraces,
  getTracesGroupedByName,
  getObservationsCostGroupedByName,
  getScoreAggregate,
  getObservationUsageByTime,
  groupTracesByTime,
  getDistinctModels,
  getScoresAggregateOverTime,
  getTracesGroupedByUsers,
  getModelUsageByUser,
  getModelLatenciesOverTime,
  getObservationLatencies,
  getTracesLatencies,
  getNumericScoreHistogram,
  getNumericScoreTimeSeries,
  getCategoricalScoreTimeSeries,
  getObservationsStatusTimeSeries,
  extractFromAndToTimestampsFromFilter,
  logger,
} from "@langfuse/shared/src/server";
import { type DatabaseRow } from "@/src/server/api/services/sqlInterface";
import { dashboardColumnDefinitions } from "@langfuse/shared";

export const dashboardRouter = createTRPCRouter({
  chart: protectedProjectProcedure
    .input(
      sqlInterface.extend({
        projectId: z.string(),
        filter: filterInterface.optional(),
        queryName: z
          .enum([
            "traces-total",
            "traces-grouped-by-name",
            "observations-model-cost",
            "score-aggregate",
            "traces-timeseries",
            "observations-usage-timeseries",
            "distinct-models",
            "scores-aggregate-timeseries",
            "observations-usage-by-users",
            "traces-grouped-by-user",
            "observation-latencies-aggregated",
            "traces-latencies-aggregated",
            "model-latencies-over-time",
            "numeric-score-time-series",
            "categorical-score-chart",
            "observations-status-timeseries",
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
        case "traces-total":
          const count = await getTotalTraces(
            input.projectId,
            input.filter ?? [],
          );
          return count as DatabaseRow[];
        case "traces-grouped-by-name":
          return (
            await getTracesGroupedByName(
              input.projectId,
              dashboardColumnDefinitions,
              input.filter,
            )
          ).map(
            (row) =>
              ({
                traceName: row.name,
                countTraceId: row.count,
              }) as DatabaseRow,
          );
        case "observations-model-cost":
          const cost = await getObservationsCostGroupedByName(
            input.projectId,
            input.filter ?? [],
          );

          return cost.map((row) => ({
            model: row.name,
            sumCalculatedTotalCost: row.sum_cost_details,
            sumTotalTokens: row.sum_usage_details,
          })) as DatabaseRow[];
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

        case "traces-timeseries":
          const rows = await groupTracesByTime(
            input.projectId,
            input.filter ?? [],
          );

          return rows as DatabaseRow[];
        case "observations-usage-timeseries":
          const dateTruncObs = extractTimeSeries(input.groupBy);
          if (!dateTruncObs) {
            return [];
          }
          const rowsObs = await getObservationUsageByTime(
            input.projectId,
            input.filter ?? [],
          );

          return rowsObs.map((row) => ({
            startTime: row.start_time,
            units: row.units,
            cost: row.cost,
            model: row.provided_model_name,
          })) as DatabaseRow[];

        case "distinct-models":
          const models = await getDistinctModels(
            input.projectId,
            input.filter ?? [],
          );
          return models as DatabaseRow[];

        case "scores-aggregate-timeseries":
          const aggregatedScores = await getScoresAggregateOverTime(
            input.projectId,
            input.filter ?? [],
          );

          return aggregatedScores as DatabaseRow[];

        case "observations-usage-by-users":
          const rowsUsers = await getModelUsageByUser(
            input.projectId,
            input.filter ?? [],
          );

          return rowsUsers.map((row) => ({
            sumTotalTokens: row.sumUsageDetails,
            sumCalculatedTotalCost: row.sumCostDetails,
            user: row.userId,
          })) as DatabaseRow[];

        case "traces-grouped-by-user":
          const traces = await getTracesGroupedByUsers(
            input.projectId,
            input.filter ?? [],
            undefined,
            1000,
            0,
            dashboardColumnDefinitions,
          );

          return traces.map((row) => ({
            user: row.user,
            countTraceId: Number(row.count),
          })) as DatabaseRow[];
        case "observation-latencies-aggregated":
          const latencies = await getObservationLatencies(
            input.projectId,
            input.filter ?? [],
          );

          return latencies.map((row) => ({
            name: row.name,
            percentile50Duration: row.p50,
            percentile90Duration: row.p90,
            percentile95Duration: row.p95,
            percentile99Duration: row.p99,
          })) as DatabaseRow[];
        case "model-latencies-over-time":
          const modelLatencies = await getModelLatenciesOverTime(
            input.projectId,
            input.filter ?? [],
          );

          return modelLatencies.map((row) => ({
            model: row.model,
            startTime: row.start_time,
            percentile50Duration: row.p50,
            percentile75Duration: row.p75,
            percentile90Duration: row.p90,
            percentile95Duration: row.p95,
            percentile99Duration: row.p99,
          })) as DatabaseRow[];
        case "traces-latencies-aggregated":
          const traceLatencies = await getTracesLatencies(
            input.projectId,
            input.filter ?? [],
          );

          return traceLatencies.map((row) => ({
            traceName: row.name,
            percentile50Duration: row.p50,
            percentile90Duration: row.p90,
            percentile95Duration: row.p95,
            percentile99Duration: row.p99,
          })) as DatabaseRow[];
        case "numeric-score-time-series":
          const dateTruncNumericScoreTimeSeries = extractTimeSeries(
            input.groupBy,
          );
          if (!dateTruncNumericScoreTimeSeries) {
            return [];
          }
          const numericScoreTimeSeries = await getNumericScoreTimeSeries(
            input.projectId,
            input.filter ?? [],
          );
          return numericScoreTimeSeries as DatabaseRow[];
        case "categorical-score-chart":
          const categoricalScoreTimeSeries =
            await getCategoricalScoreTimeSeries(
              input.projectId,
              input.filter ?? [],
            );
          return categoricalScoreTimeSeries as DatabaseRow[];
        case "observations-status-timeseries":
          return (await getObservationsStatusTimeSeries(
            input.projectId,
            input.filter ?? [],
          )) as DatabaseRow[];

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
});

const extractTimeSeries = (groupBy?: z.infer<typeof groupByInterface>) => {
  const temporal = groupBy?.find((group) => {
    if (group.type === "datetime") {
      return group;
    }
  });
  return temporal?.type === "datetime" ? temporal.temporalUnit : undefined;
};
