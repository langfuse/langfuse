import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { prisma } from "~/server/db";

export const dashboardRouter = createTRPCRouter({
  byId: publicProcedure.input(z.string()).query(({ input }) =>
    prisma.score.findUniqueOrThrow({
      where: {
        id: input,
      },
    })
  ),
});
