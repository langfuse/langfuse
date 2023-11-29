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
          startedAt: Date;
          countTraces: number;
          userId: string[];
          totalCount: number;
        }>
      >(Prisma.sql`
      SELECT
        session_id "id",
        min("timestamp") "startedAt",
        count(id)::int "countTraces",
        array_agg(distinct user_id) "userId",
        (count(*) OVER ())::int AS "totalCount"
      FROM traces t
      WHERE 
        t."project_id" = ${input.projectId}
        AND t."session_id" IS NOT NULL
        ${filterCondition}
      GROUP BY 1
      ORDER BY 2 desc
      LIMIT ${input.limit}
      OFFSET ${input.page * input.limit}
    `);
      return sessions;
    }),
  byId: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), sessionId: z.string() }))
    .query(async ({ input, ctx }) => {
      const traces = await ctx.prisma.trace.findMany({
        where: {
          sessionId: input.sessionId,
          projectId: input.projectId,
        },
        orderBy: {
          timestamp: "asc",
        },
      });

      return {
        traces,
        users: [
          ...new Set(traces.map((t) => t.userId).filter((t) => t !== null)),
        ],
      };
    }),
});
