import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { type LlmCall } from "@/src/utils/types";

export const llmCallRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      const llmCalls = (await ctx.prisma.observation.findMany({
        where: {
          type: "LLMCALL",
          trace: {
            projectId: input.projectId,
          },
        },
        orderBy: {
          startTime: "desc",
        },
      })) as LlmCall[];

      return llmCalls;
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
