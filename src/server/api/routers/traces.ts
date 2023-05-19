import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { prisma } from "~/server/db";

export const traceRouter = createTRPCRouter({
  all: publicProcedure.query(() => {
    const traces = prisma.trace.findMany({
      orderBy: {
        timestamp: "desc",
      },
    });

    return traces;
  }),

  byId: publicProcedure.input(z.string()).query(({ input }) => {
    return prisma.trace.findUniqueOrThrow({
      where: {
        id: input,
      },
    });
  }),
});
