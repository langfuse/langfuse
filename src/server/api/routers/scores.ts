import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/src/server/api/trpc";
import { prisma } from "@/src/server/db";

export const scoresRouter = createTRPCRouter({
  all: protectedProcedure.query(() =>
    prisma.score.findMany({
      orderBy: {
        timestamp: "desc",
      },
    })
  ),
  byId: protectedProcedure.input(z.string()).query(({ input }) =>
    prisma.score.findUniqueOrThrow({
      where: {
        id: input,
      },
    })
  ),
});
