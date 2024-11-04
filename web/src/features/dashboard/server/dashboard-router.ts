import { z } from "zod";
import { isClickhouseEligible } from "@/src/server/utils/checkClickhouseAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { executeQuery } from "@/src/server/api/services/queryBuilder";
import {
  filterInterface,
  sqlInterface,
} from "@/src/server/api/services/sqlInterface";
import { createHistogramData } from "@/src/features/dashboard/lib/score-analytics-utils";
import { TRPCError } from "@trpc/server";
import {
  getTotalTraces,
  getTracesGroupedByName,
  getObservationsCostGroupedByName,
  getScoreAggregate,
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
