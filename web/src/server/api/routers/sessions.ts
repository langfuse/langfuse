import { z } from "zod";

import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedGetSessionProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  filterAndValidateDbScoreList,
  createSessionsAllQuery,
  orderBy,
  paginationZod,
  type SessionOptions,
  singleFilter,
  timeFilter,
  datetimeFilterToPrismaSql,
} from "@langfuse/shared";
import { Prisma } from "@langfuse/shared/src/db";
import { TRPCError } from "@trpc/server";

import type Decimal from "decimal.js";
import { traceException } from "@langfuse/shared/src/server";
const SessionFilterOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  filter: z.array(singleFilter).nullable(),
  orderBy: orderBy,
  ...paginationZod,
});

export const sessionRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(SessionFilterOptions)
    .query(async ({ input, ctx }) => {
      try {
        const sessions = await ctx.prisma.$queryRaw<
          Array<{
            id: string;
            createdAt: Date;
            bookmarked: boolean;
            public: boolean;
          }>
        >(
          createSessionsAllQuery(
            Prisma.sql`
              s.id,
              s."created_at" AS "createdAt",
              s.bookmarked,
              s.public
            `,
            input,
          ),
        );

        return {
          sessions,
        };
      } catch (e) {
        console.error(e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "unable to get sessions",
        });
      }
    }),
  countAll: protectedProjectProcedure
    .input(SessionFilterOptions)
    .query(async ({ input, ctx }) => {
      try {
        const inputForTotal: z.infer<typeof SessionFilterOptions> = {
          filter: input.filter,
          projectId: input.projectId,
          orderBy: null,
          limit: 1,
          page: 0,
        };

        const totalCount = await ctx.prisma.$queryRaw<
          Array<{
            totalCount: number;
          }>
        >(
          createSessionsAllQuery(
            Prisma.sql`
                count(*)::int as "totalCount"
              `,
            inputForTotal,
            {
              ignoreOrderBy: true,
            },
          ),
        );

        return {
          totalCount: totalCount[0].totalCount,
        };
      } catch (e) {
        console.error(e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "unable to get session count",
        });
      }
    }),
  metrics: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        sessionIds: z.array(z.string()),
      }),
    )
    .query(async ({ input, ctx }) => {
      try {
        if (input.sessionIds.length === 0) return [];
        const inputForMetrics: z.infer<typeof SessionFilterOptions> = {
          filter: [],
          projectId: input.projectId,
          orderBy: null,
          limit: 10000, // no limit
          page: 0,
        };

        const metrics = await ctx.prisma.$queryRaw<
          Array<{
            id: string;
            countTraces: number;
            userIds: (string | null)[] | null;
            sessionDuration: number | null;
            inputCost: Decimal;
            outputCost: Decimal;
            totalCost: Decimal;
            promptTokens: number;
            completionTokens: number;
            totalTokens: number;
            traceTags: string[];
          }>
        >(
          createSessionsAllQuery(
            Prisma.sql`
              s.id,
              t."userIds",
              t."countTraces",
              o."sessionDuration",
              o."totalCost" AS "totalCost",
              o."inputCost" AS "inputCost",
              o."outputCost" AS "outputCost",
              o."promptTokens" AS "promptTokens",
              o."completionTokens" AS "completionTokens",
              o."totalTokens" AS "totalTokens",
              t."tags" AS "traceTags"
            `,
            inputForMetrics,
            {
              ignoreOrderBy: true,
              sessionIdList: input.sessionIds,
            },
          ),
        );

        return metrics.map((row) => ({
          ...row,
          userIds: (row.userIds?.filter((t) => t !== null) ?? []) as string[],
          traceTags: (row.traceTags?.filter((t) => t !== null) ??
            []) as string[],
        }));
      } catch (e) {
        console.error(e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "unable to get session metrics",
        });
      }
    }),
  filterOptions: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        timestampFilter: timeFilter.optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      try {
        const { timestampFilter } = input;
        const rawTimestampFilter =
          timestampFilter && timestampFilter.type === "datetime"
            ? datetimeFilterToPrismaSql(
                "timestamp",
                timestampFilter.operator,
                timestampFilter.value,
              )
            : Prisma.empty;
        const [userIds, tags] = await Promise.all([
          ctx.prisma.$queryRaw<Array<{ value: string }>>(Prisma.sql`
            SELECT 
              traces.user_id AS value
            FROM traces
            WHERE 
              traces.session_id IS NOT NULL
              AND traces.user_id IS NOT NULL
              AND traces.project_id = ${input.projectId} ${rawTimestampFilter}
            GROUP BY traces.user_id 
            ORDER BY traces.user_id ASC
            LIMIT 1000;
          `),
          ctx.prisma.$queryRaw<
            Array<{
              value: string;
            }>
          >(Prisma.sql`
            SELECT DISTINCT tag AS value
            FROM traces t
            JOIN observations o ON o.trace_id = t.id,
            UNNEST(t.tags) AS tag
            WHERE o.type = 'GENERATION'
              AND o.project_id = ${input.projectId}
              AND t.project_id = ${input.projectId} ${rawTimestampFilter}
            LIMIT 1000;
          `),
        ]);

        const res: SessionOptions = {
          userIds: userIds,
          tags: tags,
        };
        return res;
      } catch (e) {
        console.error(e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "unable to get session filter options",
        });
      }
    }),
  byId: protectedGetSessionProcedure
    .input(z.object({ projectId: z.string(), sessionId: z.string() }))
    .query(async ({ input, ctx }) => {
      try {
        const session = await ctx.prisma.traceSession.findFirst({
          where: {
            id: input.sessionId,
            projectId: input.projectId,
          },
          include: {
            traces: {
              orderBy: {
                timestamp: "asc",
              },
              select: {
                id: true,
                userId: true,
                name: true,
                timestamp: true,
              },
            },
          },
        });
        if (!session) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Session not found in project",
          });
        }

        const totalCostQuery = Prisma.sql`
          SELECT
            SUM(COALESCE(o."calculated_total_cost", 0)) AS "totalCost"
          FROM observations_view o
          JOIN traces t ON t.id = o.trace_id
          WHERE
            t."session_id" = ${input.sessionId}
            AND t."project_id" = ${input.projectId}
        `;

        const [scores, costData] = await Promise.all([
          ctx.prisma.score.findMany({
            where: {
              traceId: {
                in: session.traces.map((t) => t.id),
              },
              projectId: input.projectId,
            },
          }),
          // costData
          ctx.prisma.$queryRaw<Array<{ totalCost: number }>>(totalCostQuery),
        ]);

        const validatedScores = filterAndValidateDbScoreList(
          scores,
          traceException,
        );

        return {
          ...session,
          traces: session.traces.map((t) => ({
            ...t,
            scores: validatedScores.filter((s) => s.traceId === t.id),
          })),
          totalCost: costData[0].totalCost ?? 0,
          users: [
            ...new Set(
              session.traces.map((t) => t.userId).filter((t) => t !== null),
            ),
          ],
        };
      } catch (e) {
        console.error(e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "unable to get session",
        });
      }
    }),
  bookmark: protectedProjectProcedure
    .input(
      z.object({
        sessionId: z.string(),
        projectId: z.string(),
        bookmarked: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "objects:bookmark",
        });

        await auditLog({
          session: ctx.session,
          resourceType: "session",
          resourceId: input.sessionId,
          action: "bookmark",
          after: input.bookmarked,
        });

        const session = await ctx.prisma.traceSession.update({
          where: {
            id_projectId: {
              id: input.sessionId,
              projectId: input.projectId,
            },
          },
          data: {
            bookmarked: input.bookmarked,
          },
        });
        return session;
      } catch (error) {
        console.error(error);
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2025" // Record to update not found
        )
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Session not found in project",
          });
        else {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
          });
        }
      }
    }),
  publish: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        sessionId: z.string(),
        public: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "objects:publish",
        });
        await auditLog({
          session: ctx.session,
          resourceType: "session",
          resourceId: input.sessionId,
          action: "publish",
          after: input.public,
        });
        return ctx.prisma.traceSession.update({
          where: {
            id_projectId: {
              id: input.sessionId,
              projectId: input.projectId,
            },
          },
          data: {
            public: input.public,
          },
        });
      } catch (e) {
        console.error(e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "unable to publish session",
        });
      }
    }),
});
