import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { type LlmCall } from "@/src/utils/types";

const LLMFilterOptions = z.object({
  traceId: z.array(z.string()).nullable(),
  id: z.array(z.string()).nullable(),
  projectId: z.string(), // Required for protectedProjectProcedure
});

export const llmCallRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(LLMFilterOptions)
    .query(async ({ input, ctx }) => {
      const llmCalls = (await ctx.prisma.observation.findMany({
        where: {
          type: "LLMCALL",
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

  availableFilterOptions: protectedProjectProcedure
    .input(LLMFilterOptions)
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
        ...(input.id
          ? {
              id: { in: input.id },
            }
          : undefined),
      };

      const [ids, traceIds] = await Promise.all([
        ctx.prisma.observation.groupBy({
          where: {
            type: "LLMCALL",
            ...filter,
          },
          by: ["id"],
          _count: {
            _all: true,
          },
        }),
        ctx.prisma.observation.groupBy({
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
  byId: protectedProcedure.input(z.string()).query(async ({ input, ctx }) => {
    // also works for other observations
    const llmCall = (await ctx.prisma.observation.findFirstOrThrow({
      where: {
        id: input,
        type: "LLMCALL",
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
    })) as LlmCall;

    // No need to check for permissions as user has access to the trace
    const scores = await ctx.prisma.score.findMany({
      where: {
        traceId: llmCall.traceId,
      },
    });

    return { ...llmCall, scores };
  }),
});
