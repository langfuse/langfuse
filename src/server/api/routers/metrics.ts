import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { prisma } from "~/server/db";

export const metricsRouter = createTRPCRouter({
  all: publicProcedure.query(() =>
    prisma.metric.findMany({
      orderBy: {
        timestamp: "desc",
      },
    })
  ),
  byId: publicProcedure.input(z.string()).query(({ input }) =>
    prisma.metric.findUniqueOrThrow({
      where: {
        id: input,
      },
    })
  ),
});
