import { z } from "zod";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  dateTimeAggregationOptions,
  dateTimeAggregationSettings,
} from "@/src/features/dashboard/lib/timeseries-aggregation";
import { PrismaClient } from "@prisma/client";


function ms(agg: string): number {
  const match = agg.match(/^(\d+)\s+(\w+)$/);
  if (match) {
    const value = parseInt(match[1] ?? "", 10);
    const unit = match[2];
    switch (unit) {
      case "second":
      case "seconds":
        return value * 1000;
      case "minute":
      case "minutes":
        return value * 60 * 1000;
      case "hour":
      case "hours":
        return value * 60 * 60 * 1000;
      case "day":
      case "days":
        return value * 24 * 60 * 60 * 1000;
      case "week":
      case "weeks":
        return value * 7 * 24 * 60 * 60 * 1000;
      case "month":
      case "months":
        return value * 30 * 24 * 60 * 60 * 1000;
      case "year":
      case "years":
        return value * 365 * 24 * 60 * 60 * 1000;
      default:
        throw new Error(`Invalid aggregation interval: ${agg}`);
    }
  } else {
    throw new Error(`Invalid aggregation interval: ${agg}`);
  }
}

export const keyAnalyticsRouter = createTRPCRouter({
  uniqueSchools: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        agg: z.enum(dateTimeAggregationOptions),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { projectId, agg } = input;
      // Perform the raw query to get the count of unique schools
      const uniqueSchools = await ctx.prisma.$queryRawUnsafe<
        { count: bigint }[]
      >(
        `
          SELECT COUNT(DISTINCT metadata->>'organisation_id') AS count
          FROM traces
          WHERE metadata->>'organisation_id' IS NOT NULL
          AND project_id = $1
          AND timestamp > NOW() - INTERVAL '${agg}'
        `,
        projectId,
      );
      // Log the result for debugging purposes
      console.log("uniqueSchools: ", uniqueSchools);
      // Return the count. Convert bigint to number if necessary.
      return Number(uniqueSchools[0]?.count ?? 0);
    }),

  popularOrganisationCategories: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        agg: z.enum(dateTimeAggregationOptions),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { projectId, agg } = input;

      const interval = `INTERVAL '${agg}'`;

      const [popularCategoriesByUsers, popularCategoriesByTraces] =
        await Promise.all([
          ctx.prisma.$queryRawUnsafe<
            Array<{
              category: string;
              userCount: number;
            }>
          >(
            `
            SELECT 
              metadata->>'organisation_phase_category' AS category,
              COUNT(DISTINCT metadata->>'user_id') AS "userCount"
            FROM traces
            WHERE 
              project_id = $1 AND
              metadata->>'organisation_phase_category' IS NOT NULL AND
              timestamp > NOW() - ${interval}
            GROUP BY metadata->>'organisation_phase_category'
            ORDER BY "userCount" DESC
            `,
            projectId,
          ),
          ctx.prisma.$queryRawUnsafe<
            Array<{
              category: string;
              traceCount: number;
            }>
          >(
            `
            SELECT 
              metadata->>'organisation_phase_category' AS category,
              COUNT(*) AS "traceCount"
            FROM traces
            WHERE 
              project_id = $1 AND
              metadata->>'organisation_phase_category' IS NOT NULL AND
              timestamp > NOW() - ${interval}
            GROUP BY metadata->>'organisation_phase_category'
            ORDER BY "traceCount" DESC
            `,
            projectId,
          ),
        ]);

      return {
        popularCategoriesByUsers,
        popularCategoriesByTraces,
      };
    }),
  averageSchoolSize: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        agg: z.enum(dateTimeAggregationOptions),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { projectId, agg } = input;
      const averageSize = await ctx.prisma.$queryRawUnsafe<{ avg: number }[]>(`
        SELECT AVG((metadata->>'organisation_total_pupils')::int) AS avg
        FROM traces
        WHERE 
          project_id = ${projectId} AND
          metadata->>'organisation_total_pupils' IS NOT NULL AND
          timestamp > NOW() - INTERVAL '${agg}'
      `);
      return averageSize[0]?.avg ?? 0;
    }),

  popularSchoolByUsers: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        agg: z.enum(dateTimeAggregationOptions),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { projectId, agg } = input;
      return await ctx.prisma.$queryRawUnsafe<
        Array<{ organisation_name: string; userCount: number }>
      >(
        `
      SELECT 
        metadata->>'organisation_name' AS organisation_name,
        COUNT(DISTINCT metadata->>'user_id') AS userCount
      FROM traces
      WHERE 
        project_id = $1 AND
        metadata->>'organisation_name' IS NOT NULL AND
        timestamp > NOW() - INTERVAL '${agg}'
      GROUP BY metadata->>'organisation_name'
      ORDER BY userCount DESC
      LIMIT 1
      `,
        projectId,
      );
    }),

  popularSchoolByMessages: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        agg: z.enum(dateTimeAggregationOptions),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { projectId, agg } = input;
      const popularSchool = await ctx.prisma.$queryRawUnsafe<
        Array<{ organisation_id: string; messageCount: number; cost: number }>
      >(`
        SELECT 
          metadata->>'organisation_id' AS organisation_id,
          COUNT(*) AS messageCount,
          SUM(total_cost) AS cost
        FROM traces
        WHERE 
          project_id = ${projectId} AND
          metadata->>'organisation_id' IS NOT NULL AND
          timestamp > NOW() - INTERVAL '${agg}'
        GROUP BY metadata->>'organisation_id'
        ORDER BY messageCount DESC
        LIMIT 1
      `);
      return popularSchool;
    }),
  popularSchoolByTraces: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        agg: z.enum(dateTimeAggregationOptions),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { projectId, agg } = input;
      return await ctx.prisma.$queryRawUnsafe<
        Array<{ organisation_name: string; traceCount: number }>
      >(
        `
        SELECT 
          metadata->>'organisation_name' AS organisation_name,
          COUNT(*) AS traceCount
        FROM traces
        WHERE 
          project_id = $1 AND
          metadata->>'organisation_name' IS NOT NULL AND
          timestamp > NOW() - INTERVAL '${agg}'
        GROUP BY metadata->>'organisation_name'
        ORDER BY traceCount DESC
        LIMIT 10
        `,
        projectId,
      );
    }),
  popularUserRoles: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        agg: z.enum(dateTimeAggregationOptions),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { projectId, agg } = input;
      const [popularRolesByUsers, popularRolesByTraces, totalUsers] =
        await Promise.all([
          ctx.prisma.$queryRawUnsafe<
            Array<{
              user_role: string;
              userCount: number;
            }>
          >(
            `
          SELECT
            metadata->>'user_role' AS user_role,
            COUNT(DISTINCT metadata->>'user_id') AS "userCount"
          FROM traces
          WHERE
            project_id = $1 AND
            metadata->>'user_role' IS NOT NULL AND
            timestamp > NOW() - INTERVAL '${agg}'
          GROUP BY metadata->>'user_role'
          ORDER BY "userCount" DESC
          `,
            projectId,
          ),
          ctx.prisma.$queryRawUnsafe<
            Array<{
              user_role: string;
              traceCount: number;
            }>
          >(
            `
          SELECT
            metadata->>'user_role' AS user_role,
            COUNT(*) AS "traceCount"
          FROM traces
          WHERE
            project_id = $1 AND
            metadata->>'user_role' IS NOT NULL AND
            timestamp > NOW() - INTERVAL '${agg}'
          GROUP BY metadata->>'user_role'
          ORDER BY "traceCount" DESC
          `,
            projectId,
          ),
          ctx.prisma.$queryRawUnsafe<[{ totalUsers: bigint }]>(
            `
          SELECT COUNT(DISTINCT metadata->>'user_id') AS "totalUsers"
          FROM traces
          WHERE project_id = $1 AND timestamp > NOW() - INTERVAL '${agg}'
          `,
            projectId,
          ),
        ]);

      return {
        popularRolesByUsers,
        popularRolesByTraces,
        totalUsers: totalUsers[0]?.totalUsers?.toString() ?? "0",
      };
    }),

  featureUsage: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        agg: z.enum(dateTimeAggregationOptions),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { projectId, agg } = input;
      return await ctx.prisma.$queryRawUnsafe<
        Array<{ traceName: string; count: number }>
      >(
        `
        SELECT 
          name AS "traceName",
          COUNT(*) AS count
        FROM traces
        WHERE 
          project_id = $1 AND
          timestamp > NOW() - INTERVAL '${agg}'
        GROUP BY name
        ORDER BY count DESC
        `,
        projectId,
      );
    }),

  featureUsageTimeSeries: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        agg: z.enum(dateTimeAggregationOptions),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { projectId, agg } = input;

      const interval = `INTERVAL '${agg}'`;
      const date_trunc = dateTimeAggregationSettings[agg].date_trunc;

      const featureUsageTimeSeries = await ctx.prisma.$queryRawUnsafe<
        Array<{
          timestamp: Date;
          featureName: string;
          count: number;
        }>
      >(
        `
        SELECT
          date_trunc('${date_trunc}', timestamp) AS "timestamp",
          name AS "featureName",
          COUNT(*) AS count
        FROM traces
        WHERE
          project_id = $1 AND
          timestamp > NOW() - ${interval}
        GROUP BY "timestamp", "featureName"
        ORDER BY "timestamp" ASC
        `,
        projectId,
      );

      return featureUsageTimeSeries;
    }),

  averageFeatureCosts: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        agg: z.enum(dateTimeAggregationOptions),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { projectId, agg } = input;

      const averageFeatureCosts = await ctx.prisma.$queryRaw<
        Array<{
          traceName: string;
          averageCost: number;
        }>
      >`
      WITH trace_total_costs AS (
        SELECT
          t.id AS trace_id,
          t.name AS trace_name,
          COALESCE(
            SUM(
              CASE
                WHEN p.token_type = 'PROMPT' THEN o.prompt_tokens * p.price / 1000
                WHEN p.token_type = 'COMPLETION' THEN o.completion_tokens * p.price / 1000
                ELSE 0
              END
            ),
            0
          ) AS total_cost
        FROM traces t
        LEFT JOIN observations o ON t.id = o.trace_id
        LEFT JOIN pricings p ON o.model = p.model_name
        WHERE t.project_id = ${projectId}
          AND t.timestamp > NOW() - INTERVAL ${ms(agg)}
        GROUP BY t.id, t.name
      ),
      trace_average_costs AS (
        SELECT
          trace_name,
          AVG(total_cost) AS average_cost
        FROM trace_total_costs
        GROUP BY trace_name
      )
      SELECT
        trace_name AS "traceName",
        average_cost AS "averageCost"
      FROM trace_average_costs
      ORDER BY "averageCost" DESC;
    `;

      return averageFeatureCosts.map((cost) => ({
        ...cost,
        averageCost: cost.averageCost
          ? parseFloat(cost.averageCost.toFixed(4))
          : 0,
      }));
    }),

  averageCostPerUser: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        agg: z.enum(dateTimeAggregationOptions),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { projectId, agg } = input;

      // Retrieve costs associated with each user, compute real-time
      const averageCostPerUser = await ctx.prisma.$queryRaw<
        Array<{
          userId: string;
          averageCost: number;
        }>
      >`
      WITH user_total_costs AS (
        SELECT
          metadata->>'user_id' AS user_id,
          COALESCE(
            SUM(
              CASE
                WHEN p.token_type = 'PROMPT' THEN o.prompt_tokens * p.price / 1000
                WHEN p.token_type = 'COMPLETION' THEN o.completion_tokens * p.price / 1000
                ELSE 0
              END
            ),
            0
          ) AS total_cost
        FROM traces t
        LEFT JOIN observations o ON t.id = o.trace_id
        LEFT JOIN pricings p ON o.model = p.model_name
        WHERE t.project_id = ${projectId}
          AND t.timestamp > NOW() - INTERVAL ${ms(agg)}
        GROUP BY metadata->>'user_id'
      ),
      user_average_costs AS (
        SELECT
          user_id AS "userId",
          AVG(total_cost) AS average_cost
        FROM user_total_costs
        GROUP BY user_id
      )
      SELECT
        "userId",
        average_cost AS "averageCost"
      FROM user_average_costs
      ORDER BY "averageCost" DESC;
    `;

      // Map and round averageCost for each user
      return averageCostPerUser.map((cost) => ({
        ...cost,
        averageCost: cost.averageCost
          ? parseFloat(cost.averageCost.toFixed(4))
          : 0,
      }));
    }),

  averageCostPerOrganization: protectedProjectProcedure
  .input(
    z.object({
      projectId: z.string(),
      agg: z.enum(dateTimeAggregationOptions),
    }),
  )
  .query(async ({ input, ctx }) => {
    const { projectId, agg } = input;

    const averageCostPerOrganization = await ctx.prisma.$queryRaw<
      Array<{
        organisationId: string;
        organisationName: string;
        averageCost: number;
      }>
    >`
    WITH trace_total_costs AS (
      SELECT
        t.id AS trace_id,
        t.metadata->>'organisation_id' AS organisation_id,
        t.metadata->>'organisation_name' AS organisation_name,
        COALESCE(
          SUM(
            CASE
              WHEN p.token_type = 'PROMPT' THEN o.prompt_tokens * p.price / 1000
              WHEN p.token_type = 'COMPLETION' THEN o.completion_tokens * p.price / 1000
              ELSE 0
            END
          ),
          0
        ) AS total_cost
      FROM traces t
      LEFT JOIN observations o ON t.id = o.trace_id
      LEFT JOIN pricings p ON o.model = p.model_name
      WHERE t.project_id = ${projectId}
        AND t.timestamp > NOW() - INTERVAL ms(${agg})
      GROUP BY t.id, t.metadata->>'organisation_id', t.metadata->>'organisation_name'
    ),
    organisation_average_costs AS (
      SELECT
        organisation_id,
        organisation_name,
        AVG(total_cost) AS average_cost
      FROM trace_total_costs
      GROUP BY organisation_id, organisation_name
    )
    SELECT
      organisation_id AS "organisationId",
      organisation_name AS "organisationName",
      average_cost AS "averageCost"
    FROM organisation_average_costs
    ORDER BY "averageCost" DESC;
  `;

    return averageCostPerOrganization.map((cost) => ({
      ...cost,
      averageCost: cost.averageCost
        ? parseFloat(cost.averageCost.toFixed(4))
        : 0,
    }));
  }),
});
