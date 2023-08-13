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
          projectId: input.projectId,
          traceId: {
            not: null,
            ...(input.traceId
              ? {
                  in: input.traceId,
                }
              : undefined),
          },
        },
        orderBy: {
          startTime: "desc",
        },
        take: 100, // TODO: pagination
      })) as Array<
        Generation & {
          traceId: string;
        }
      >;

      return generations;
    }),

  availableFilterOptions: protectedProjectProcedure
    .input(GenerationFilterOptions)
    .query(async ({ input, ctx }) => {
      const filter = {
        projectId: input.projectId,
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
          occurrences: traceIds
            .filter((i) => i.traceId !== null)
            .map((i) => {
              return { key: i.traceId ?? "null", count: i._count };
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
        Project: {
          members: {
            some: {
              userId: ctx.session.user.id,
            },
          },
        },
      },
    })) as Generation;

    const scores = generation.traceId
      ? await ctx.prisma.score.findMany({
          where: {
            traceId: generation.traceId,
          },
        })
      : [];

    return { ...generation, scores };
  }),
});
