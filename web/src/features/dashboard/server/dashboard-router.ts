import { z } from "zod";
import { isClickhouseEligible } from "@/src/server/utils/checkClickhouseAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { executeQuery } from "@/src/server/api/services/queryBuilder";
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
} from "@langfuse/shared/src/server";
import { type DatabaseRow } from "@/src/server/api/services/queryBuilder";
import { dashboardColumnDefinitions } from "@langfuse/shared";

export const dashboardRouter = createTRPCRouter({
  chart: protectedProjectProcedure
    .input(
      sqlInterface.extend({
        projectId: z.string(),
        filter: filterInterface.optional(),
        queryClickhouse: z.boolean().default(false),
        queryName: z
          .enum([
            "traces-total",
            "traces-grouped-by-name",
            "observations-model-cost",
            "score-aggregate",
            "traces-timeseries",
            "observations-usage-timeseries",
            "distinct-models",
          ])
          .nullish(),
      }),
    )
    .query(async ({ input, ctx }) => {
      if (input.queryClickhouse && !isClickhouseEligible(ctx.session.user)) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Not eligible to query clickhouse",
        });
      }

      if (!input.queryClickhouse) {
        return await executeQuery(ctx.prisma, input.projectId, input);
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
          const dateTrunc = extractTimeSeries(input.groupBy);
          if (!dateTrunc) {
            return [];
          }
          const rows = await groupTracesByTime(
            input.projectId,
            input.filter ?? [],
            dateTrunc,
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
            dateTruncObs,
          );

          return rowsObs.map((row) => ({
            startTime: row.start_time,
            sumTotalTokens: row.sum_usage_details,
            sumCalculatedTotalCost: row.sum_cost_details,
            model: row.provided_model_name,
          })) as DatabaseRow[];

        case "distinct-models":
          const models = await getDistinctModels(
            input.projectId,
            input.filter ?? [],
          );
          return models as DatabaseRow[];

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
    .query(async ({ input, ctx }) => {
      const data = await executeQuery(ctx.prisma, input.projectId, input);
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
