import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import { Prisma, type Score } from "@prisma/client";
import { paginationZod } from "@/src/utils/zod";
import { singleFilter } from "@/src/server/api/interfaces/filters";
import { filterToPrismaSql } from "@/src/features/filters/server/filterToPrisma";
import {
  type ScoreOptions,
  scoresTableCols,
} from "@/src/server/api/definitions/scoresTable";
import { v4 } from "uuid";

const ScoreFilterOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  filter: z.array(singleFilter),
});

const ScoreAllOptions = ScoreFilterOptions.extend({
  ...paginationZod,
});

export const scoresRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(ScoreAllOptions)
    .query(async ({ input, ctx }) => {
      const filterCondition = filterToPrismaSql(input.filter, scoresTableCols);
      console.log("filters: ", filterCondition);

      const scores = await ctx.prisma.$queryRaw<
        Array<Score & { traceName: string; totalCount: number }>
      >(Prisma.sql`
          SELECT
            s.id,
            s.name,
            s.value,
            s.timestamp,
            s.comment,
            s.trace_id as "traceId",
            s.observation_id as "observationId",
            t.name as "traceName",
            (count(*) OVER())::int AS "totalCount"
          FROM scores s
          JOIN traces t ON t.id = s.trace_id
          WHERE t.project_id = ${input.projectId}
          ${filterCondition}
          ORDER BY s.timestamp DESC
          LIMIT ${input.limit}
          OFFSET ${input.page * input.limit}
      `);
      return scores;
    }),
  filterOptions: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const names = await ctx.prisma.score.groupBy({
        where: {
          trace: {
            projectId: input.projectId,
          },
        },
        by: ["name"],
        _count: {
          _all: true,
        },
      });

      const res: ScoreOptions = {
        name: names.map((i) => ({ value: i.name, count: i._count._all })),
      };

      return res;
    }),
  byId: protectedProcedure.input(z.string()).query(({ input, ctx }) =>
    ctx.prisma.score.findFirstOrThrow({
      where: {
        id: input,
        ...(ctx.session.user.admin === true
          ? undefined
          : {
              trace: {
                project: {
                  members: {
                    some: {
                      userId: ctx.session.user.id,
                    },
                  },
                },
              },
            }),
      },
    }),
  ),
  expertUpsertMany: protectedProcedure
    .input(
      z.object({
        traceId: z.string(),
        observationId: z.string().optional(),
        scores: z.array(
          z.object({
            id: z.string().optional(),
            value: z.number(),
            name: z.string(),
            comment: z.string().optional(),
          }),
        ),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const trace = await ctx.prisma.trace.findFirstOrThrow({
        where: {
          id: input.traceId,
          project: {
            members: {
              some: {
                userId: ctx.session.user.id,
              },
            },
          },
        },
      });
      throwIfNoAccess({
        session: ctx.session,
        projectId: trace.projectId,
        scope: "scores:CUD",
      });

      for (const score of input.scores) {
        const scoreId = score.id ?? v4();
        await ctx.prisma.score.upsert({
          where: {
            id_traceId: {
              id: scoreId,
              traceId: input.traceId,
            },
          },
          create: {
            id: scoreId,
            trace: {
              connect: {
                id: input.traceId,
              },
            },
            ...(input.observationId
              ? {
                  observation: {
                    connect: {
                      id: input.observationId,
                    },
                  },
                }
              : undefined),
            value: score.value,
            name: score.name,
            comment: score.comment,
            type: "EXPERT",
          },
          update: {
            name: score.name,
            value: score.value,
            comment: score.comment,
            type: "EXPERT",
          },
        });
      }
    }),
  delete: protectedProcedure
    .input(z.string())
    .mutation(async ({ input, ctx }) => {
      const score = await ctx.prisma.score.findFirstOrThrow({
        where: {
          id: input,
          trace: {
            project: {
              members: {
                some: {
                  userId: ctx.session.user.id,
                },
              },
            },
          },
        },
        include: {
          trace: {
            select: {
              projectId: true,
            },
          },
        },
      });
      throwIfNoAccess({
        session: ctx.session,
        projectId: score.trace.projectId,
        scope: "scores:CUD",
      });

      return ctx.prisma.score.delete({
        where: {
          id: score.id,
        },
      });
    }),
  usedNames: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const names = await ctx.prisma.score.findMany({
        select: {
          name: true,
        },
        where: {
          trace: {
            projectId: input.projectId,
          },
        },
        distinct: ["name"],
      });

      return names.map((i) => i.name);
    }),
});
