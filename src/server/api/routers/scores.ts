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
  create: protectedProcedure
    .input(
      z.object({
        traceId: z.string(),
        value: z.number(),
        name: z.string(),
        comment: z.string().optional(),
        observationId: z.string().optional(),
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

      return ctx.prisma.score.create({
        data: {
          trace: {
            connect: {
              id: trace.id,
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
          value: input.value,
          name: input.name,
          comment: input.comment,
        },
      });
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        value: z.number(),
        comment: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const score = await ctx.prisma.score.findFirstOrThrow({
        where: {
          id: input.id,
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

      return ctx.prisma.score.update({
        where: {
          id: score.id,
        },
        data: {
          value: input.value,
          comment: input.comment,
        },
      });
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
});
