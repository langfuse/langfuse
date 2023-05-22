import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { prisma } from "~/server/db";
import { type LlmCall } from "~/utils/types";

export const llmCallRouter = createTRPCRouter({
  all: publicProcedure.query(async () => {
    const llmCalls = (await prisma.observation.findMany({
      where: {
        type: "LLMCALL",
      },
      orderBy: {
        startTime: "desc",
      },
    })) as LlmCall[];

    console.log(llmCalls);

    return llmCalls;
  }),

  byId: publicProcedure.input(z.string()).query(async ({ input }) => {
    // also works for other observations
    const llmCall = (await prisma.observation.findUnique({
      where: {
        id: input,
      },
    })) as LlmCall;

    const metrics = await prisma.metric.findMany({
      where: {
        traceId: llmCall.traceId,
      },
    });

    return { ...llmCall, metrics };
  }),
});
