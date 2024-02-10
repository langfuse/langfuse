import { z } from "zod";

import { sessionsViewCols } from "@/src/server/api/definitions/sessionsView";
import { filterToPrismaSql } from "@/src/features/filters/server/filterToPrisma";
import {
  createTRPCRouter,
  protectedProjectProcedure,
  protectedGetSessionProcedure,
} from "@/src/server/api/trpc";
import { Prisma } from "@prisma/client";
import { singleFilter } from "@/src/server/api/interfaces/filters";
import { paginationZod } from "@/src/utils/zod";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import { TRPCError } from "@trpc/server";
import { orderBy } from "@/src/server/api/interfaces/orderBy";
import { orderByToPrismaSql } from "@/src/features/orderBy/server/orderByToPrisma";

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
        const filterCondition = filterToPrismaSql(
          input.filter ?? [],
          sessionsViewCols,
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
          }>
        >(Prisma.sql`
      WITH observation_metrics AS (
        SELECT
          t.session_id,
          EXTRACT(EPOCH FROM COALESCE(MAX(o."end_time"), MAX(o."start_time"), MAX(t.timestamp))) - EXTRACT(EPOCH FROM COALESCE(MIN(o."start_time"), MIN(t.timestamp)))::double precision AS "sessionDuration"
        FROM traces t
        LEFT JOIN observations o ON o.trace_id = t.id
        WHERE
          t."project_id" = ${input.projectId}
          AND session_id IS NOT NULL
        GROUP BY 1
      ),
      trace_metrics AS (
        SELECT
          session_id,
          array_agg(distinct t.user_id) "userIds",
          count(t.id)::int "countTraces"
        FROM traces t
        WHERE
          t."project_id" = ${input.projectId}
          AND session_id IS NOT NULL
        GROUP BY 1
      )

      SELECT
        s.id,
        s."created_at" "createdAt",
        s.bookmarked,
        s.public,
        t."userIds",
        t."countTraces",
        o."sessionDuration",
        (count(*) OVER ())::int AS "totalCount"
      FROM trace_sessions s
      LEFT JOIN trace_metrics t ON t.session_id = s.id
      LEFT JOIN observation_metrics o ON o.session_id = s.id
      WHERE
        s."project_id" = ${input.projectId}
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
              include: {
                scores: true,
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

        return {
          ...session,
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
