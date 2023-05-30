import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";

export const scoresRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input, ctx }) =>
      ctx.prisma.score.findMany({
        where: {
          trace: {
            projectId: input.projectId,
          },
        },
        orderBy: {
          timestamp: "desc",
        },
      })
    ),
  byId: protectedProcedure.input(z.string()).query(({ input, ctx }) =>
    ctx.prisma.score.findFirstOrThrow({
      where: {
        id: input,
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
    })
  ),
});
