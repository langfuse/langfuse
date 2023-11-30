import { z } from "zod";

import { sessionsViewCols } from "@/src/server/api/definitions/sessionsView";
import { filterToPrismaSql } from "@/src/features/filters/server/filterToPrisma";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { type Observation, Prisma } from "@prisma/client";
import { singleFilter } from "@/src/server/api/interfaces/filters";
import type Decimal from "decimal.js";
import { paginationZod } from "@/src/utils/zod";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";

const SessionFilterOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  searchQuery: z.string().nullable(),
  filter: z.array(singleFilter).nullable(),
  ...paginationZod,
});

export type ObservationReturnType = Omit<Observation, "input" | "output"> & {
  traceId: string;
} & { price?: Decimal };

export const sessionRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(SessionFilterOptions)
    .query(async ({ input, ctx }) => {
      const filterCondition = filterToPrismaSql(
        input.filter ?? [],
        sessionsViewCols,
      );

      const sessions = await ctx.prisma.$queryRaw<
        Array<{
          id: string;
          createdAt: Date;
          bookmarked: boolean;
          public: boolean;
          countTraces: number;
          userIds: string[];
          totalCount: number;
        }>
      >(Prisma.sql`
      SELECT
        s.id,
        s."created_at" "createdAt",
        s.bookmarked,
        s.public,
        count(t.id)::int "countTraces",
        array_agg(distinct t.user_id) "userIds",
        (count(*) OVER ())::int AS "totalCount"
      FROM trace_sessions s
      LEFT JOIN traces t ON t.session_id = s.id
      WHERE
        t."project_id" = ${input.projectId}
        AND t."session_id" IS NOT NULL
        ${filterCondition}
      GROUP BY 1, 2
      ORDER BY 2 desc
      LIMIT ${input.limit}
      OFFSET ${input.page * input.limit}
    `);
      return sessions.map((s) => ({
        ...s,
        userIds: s.userIds.filter((t) => t !== null),
      }));
    }),
  byId: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), sessionId: z.string() }))
    .query(async ({ input, ctx }) => {
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
          },
        },
      });
      if (!session) {
        throw new Error("Session not found in project");
      }

      return {
        ...session,
        users: [
          ...new Set(
            session.traces.map((t) => t.userId).filter((t) => t !== null),
          ),
        ],
      };
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
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "objects:bookmark",
      });

      const session = await ctx.prisma.traceSession.update({
        where: {
          id: input.sessionId,
          projectId: input.projectId,
        },
        data: {
          bookmarked: input.bookmarked,
        },
      });
      if (!session) {
        throw new Error("Session not found in project");
      }
      return session;
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
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "objects:publish",
      });
      return ctx.prisma.traceSession.update({
        where: {
          id: input.sessionId,
          projectId: input.projectId,
        },
        data: {
          public: input.public,
        },
      });
    }),
});
