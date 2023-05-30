import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { prisma } from "~/server/db";

const ScoreFilterOptions = z.object({
  traceId: z.array(z.string()).nullable(),
  id: z.array(z.string()).nullable(),
});

export const scoresRouter = createTRPCRouter({
  all: publicProcedure.input(ScoreFilterOptions).query(async ({ input }) => {
    return await prisma.score.findMany({
      orderBy: {
        timestamp: "desc",
      },
      where: {
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
    });
  }),
  availableFilterOptions: publicProcedure
    .input(ScoreFilterOptions)
    .query(async ({ input }) => {
      const filter = {
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
        await prisma.score.groupBy({
          where: filter,
          by: ["id"],
          _count: {
            _all: true,
          },
        }),

        await prisma.score.groupBy({
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
  byId: publicProcedure.input(z.string()).query(({ input }) =>
    prisma.score.findUniqueOrThrow({
      where: {
        id: input,
      },
    })
  ),
});
