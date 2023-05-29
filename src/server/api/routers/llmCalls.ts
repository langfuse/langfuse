import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/src/server/api/trpc";
import { prisma } from "@/src/server/db";
import { type LlmCall } from "@/src/utils/types";

export const llmCallRouter = createTRPCRouter({
  all: protectedProcedure.query(async () => {
    const llmCalls = (await prisma.observation.findMany({
      where: {
        type: "LLMCALL",
      },
      orderBy: {
        startTime: "desc",
      },
    })) as LlmCall[];

    return llmCalls;
  }),

  byId: protectedProcedure.input(z.string()).query(async ({ input }) => {
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
