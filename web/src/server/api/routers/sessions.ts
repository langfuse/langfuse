import { z } from "zod";
import {
  createTRPCRouter,
  protectedProjectProcedure,
  protectedGetSessionProcedure,
} from "@/src/server/api/trpc";
import {
  singleFilter,
  tableColumnsToSqlFilterAndPrefix,
} from "@langfuse/shared";
import { Prisma } from "@langfuse/shared/src/db";
import { paginationZod } from "@langfuse/shared";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import { TRPCError } from "@trpc/server";
import { orderBy } from "@langfuse/shared";
import { orderByToPrismaSql } from "@/src/features/orderBy/server/orderByToPrisma";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import type Decimal from "decimal.js";
import {
  type SessionOptions,
  sessionsViewCols,
} from "@/src/server/api/definitions/sessionsView";

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
        const filterCondition = tableColumnsToSqlFilterAndPrefix(
          input.filter ?? [],
          sessionsViewCols,
          "sessions",
        );

        const orderByCondition = orderByToPrismaSql(
          input.orderBy,
          sessionsViewCols,
        );

        const sessions = await ctx.prisma.$queryRaw<
          Array<{
            id: string;
            createdAt: Date;
            bookmarked: boolean;
            public: boolean;
            countTraces: number;
            userIds: (string | null)[] | null;
            totalCount: number;
            sessionDuration: number | null;
            inputCost: Decimal;
            outputCost: Decimal;
            totalCost: Decimal;
            promptTokens: number;
            completionTokens: number;
            totalTokens: number;
          }>
        >(Prisma.sql`
        SELECT
        s.id,
        s. "created_at" AS "createdAt",
        s.bookmarked,
        s.public,
        t. "userIds",
        t. "countTraces",
        o. "sessionDuration",
        o. "totalCost" AS "totalCost",
        o. "inputCost" AS "inputCost",
        o. "outputCost" AS "outputCost",
        o. "promptTokens" AS "promptTokens",
        o. "completionTokens" AS "completionTokens",
        o. "totalTokens" AS "totalTokens",
        (count(*) OVER ())::int AS "totalCount"
      FROM
        trace_sessions AS s
        LEFT JOIN LATERAL (
          SELECT
            t.session_id,
            MAX(t. "timestamp") AS "max_timestamp",
            MIN(t. "timestamp") AS "min_timestamp",
            array_agg(t.id) AS "traceIds",
            array_agg(DISTINCT t.user_id) AS "userIds",
            count(t.id)::int AS "countTraces"
          FROM
            traces t
          WHERE
            t.project_id = ${input.projectId}
            AND t.session_id = s.id
          GROUP BY
            t.session_id) AS t ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            EXTRACT(EPOCH FROM COALESCE(MAX(o. "end_time"), MAX(o. "start_time"), t. "max_timestamp")) - EXTRACT(EPOCH FROM COALESCE(MIN(o. "start_time"), t. "min_timestamp"))::double precision AS "sessionDuration",
            SUM(COALESCE(o. "calculated_input_cost", 0)) AS "inputCost",
            SUM(COALESCE(o. "calculated_output_cost", 0)) AS "outputCost",
            SUM(COALESCE(o. "calculated_total_cost", 0)) AS "totalCost",
            SUM(o.prompt_tokens) AS "promptTokens",
            SUM(o.completion_tokens) AS "completionTokens",
            SUM(o.total_tokens) AS "totalTokens"
          FROM
            observations_view o
          WHERE
            o.project_id = ${input.projectId}
            AND o.trace_id = ANY (t. "traceIds")) AS o ON TRUE
      WHERE
        s. "project_id" = ${input.projectId}
        ${filterCondition}
      ${orderByCondition}
      LIMIT ${input.limit}
      OFFSET ${input.page * input.limit}
    `);
        return sessions.map((s) => ({
          ...s,
          userIds: (s.userIds?.filter((t) => t !== null) ?? []) as string[],
        }));
      } catch (e) {
        console.error(e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "unable to get sessions",
        });
      }
    }),
  filterOptions: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const userIds: { value: string; count: number }[] = await ctx.prisma
        .$queryRaw`
      SELECT traces.user_id as value, COUNT(traces.user_id)::int as count
      FROM traces
      WHERE traces.session_id IS NOT NULL
      AND traces.project_id = ${input.projectId}
      GROUP BY traces.user_id;
    `;
      const res: SessionOptions = {
        userIds: userIds,
      };
      return res;
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

        const scores = await ctx.prisma.score.findMany({
          where: {
            traceId: {
              in: session.traces.map((t) => t.id),
            },
            projectId: input.projectId,
          },
        });

        const totalCostQuery = Prisma.sql`
        SELECT
          SUM(COALESCE(o."calculated_total_cost", 0)) AS "totalCost"
        FROM observations_view o
        JOIN traces t ON t.id = o.trace_id
        WHERE
          t."session_id" = ${input.sessionId}
          AND t."project_id" = ${input.projectId}
      `;

        const [costData] =
          await ctx.prisma.$queryRaw<Array<{ totalCost: number }>>(
            totalCostQuery,
          );

        return {
          ...session,
          traces: session.traces.map((t) => ({
            ...t,
            scores: scores.filter((s) => s.traceId === t.id),
          })),
          totalCost: costData?.totalCost ?? 0,
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
        throwIfNoAccess({
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
        throwIfNoAccess({
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
