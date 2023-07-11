import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { type Generation } from "@/src/utils/types";

const GenerationFilterOptions = z.object({
  traceId: z.array(z.string()).nullable(),
  projectId: z.string(), // Required for protectedProjectProcedure
});

export const generationsRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(GenerationFilterOptions)
    .query(async ({ input, ctx }) => {
      const generations = (await ctx.prisma.observation.findMany({
        where: {
          type: "GENERATION",
          trace: {
            projectId: input.projectId,
          },
          ...(input.traceId
            ? {
                traceId: { in: input.traceId },
              }
            : undefined),
        },
        orderBy: {
          startTime: "desc",
        },
        take: 100, // TODO: pagination
      })) as Generation[];

      return generations;
    }),

  availableFilterOptions: protectedProjectProcedure
    .input(GenerationFilterOptions)
    .query(async ({ input, ctx }) => {
      const filter = {
        trace: {
          projectId: input.projectId,
        },
        ...(input.traceId
          ? {
              traceId: { in: input.traceId },
            }
          : undefined),
      };

      const traceIds = await ctx.prisma.observation.groupBy({
        where: {
          type: "GENERATION",
          ...filter,
        },
        by: ["traceId"],
        _count: {
          _all: true,
        },
      });

      return [
        {
          key: "traceId",
          occurrences: traceIds.map((i) => {
            return { key: i.traceId, count: i._count };
          }),
        },
      ];
    }),
  byId: protectedProcedure.input(z.string()).query(async ({ input, ctx }) => {
    // also works for other observations
    const generation = (await ctx.prisma.observation.findFirstOrThrow({
      where: {
        id: input,
        type: "GENERATION",
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
    })) as Generation;

    // No need to check for permissions as user has access to the trace
    const scores = await ctx.prisma.score.findMany({
      where: {
        traceId: generation.traceId,
      },
    });

    return { ...generation, scores };
  }),
});
