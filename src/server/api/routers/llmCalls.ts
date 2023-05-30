import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { prisma } from "~/server/db";
import { type LlmCall } from "~/utils/types";

const LLMFilterOptions = z.object({
  traceId: z.array(z.string()).nullable(),
  id: z.array(z.string()).nullable(),
});

export const llmCallRouter = createTRPCRouter({
  all: publicProcedure.input(LLMFilterOptions).query(async ({ input }) => {
    const llmCalls = (await prisma.observation.findMany({
      where: {
        type: "LLMCALL",
        ...(input.traceId
          ? {
              traceId: { in: input.traceId },
            }
          : undefined),
        ...(input.id
          ? {
              id: { in: input.id },
            }
          : undefined),
      },
      orderBy: {
        startTime: "desc",
      },
    })) as LlmCall[];

    return llmCalls;
  }),

  availableFilterOptions: publicProcedure
    .input(LLMFilterOptions)
    .query(async ({ input }) => {
      const filter = {
        ...(input.traceId
          ? {
              traceId: { in: input.traceId },
            }
          : undefined),
        ...(input.id
          ? {
              id: { in: input.id },
            }
          : undefined),
      };

      const [ids, traceIds] = await Promise.all([
        prisma.observation.groupBy({
          where: {
            type: "LLMCALL",
            ...filter,
          },
          by: ["id"],
          _count: {
            _all: true,
          },
        }),
        prisma.observation.groupBy({
          where: {
            type: "LLMCALL",
            ...filter,
          },
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

  byId: publicProcedure.input(z.string()).query(async ({ input }) => {
    // also works for other observations
    const llmCall = (await prisma.observation.findUnique({
      where: {
        id: input,
      },
    })) as LlmCall;

    const scores = await prisma.score.findMany({
      where: {
        traceId: llmCall.traceId,
      },
    });

    return { ...llmCall, scores };
  }),
});
