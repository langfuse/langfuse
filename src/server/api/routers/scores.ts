import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";

const ScoreFilterOptions = z.object({
  traceId: z.array(z.string()).nullable(),
  id: z.array(z.string()).nullable(),
  projectId: z.string(), // Required for protectedProjectProcedure
});

export const scoresRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(ScoreFilterOptions)
    .query(async ({ input, ctx }) =>
      ctx.prisma.score.findMany({
        orderBy: {
          timestamp: "desc",
        },
        where: {
          trace: {
            projectId: input.projectId,
          },
          ...(input.traceId
            ? {
                traceId: { in: input.traceId },
              }
            : undefined),
          ...(input.id
            ? {
                id: {
                  in: input.id,
                },
              }
            : undefined),
        },
        take: 100, // TODO: pagination
      })
    ),
  availableFilterOptions: protectedProjectProcedure
    .input(ScoreFilterOptions)
    .query(async ({ input, ctx }) => {
      const filter = {
        trace: {
          projectId: input.projectId,
        },
        ...(input.id
          ? {
              id: {
                in: input.id,
              },
            }
          : undefined),
        ...(input.traceId
          ? {
              traceId: {
                in: input.traceId,
              },
            }
          : undefined),
      };

      const [ids, traceIds] = await Promise.all([
        ctx.prisma.score.groupBy({
          where: filter,
          by: ["id"],
          _count: {
            _all: true,
          },
        }),
        ctx.prisma.score.groupBy({
          where: filter,
          by: ["traceId"],
          _count: {
            _all: true,
          },
        }),
      ]);

      return [
        {
          key: "id",
          occurrences: ids.map((i) => {
            return { key: i.id, count: i._count };
          }),
        },
        {
          key: "traceId",
          occurrences: traceIds.map((i) => {
            return { key: i.traceId, count: i._count };
          }),
        },
      ];
    }),
  byId: protectedProcedure.input(z.string()).query(({ input, ctx }) =>
    ctx.prisma.score.findFirstOrThrow({
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
    })
  ),
});
