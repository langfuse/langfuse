import { createTRPCRouter, protectedProcedure } from "@/src/server/api/trpc";
import { z } from "zod";

export const observationsRouter = createTRPCRouter({
  byId: protectedProcedure.input(z.string()).query(async ({ input, ctx }) => {
    // also works for other observations
    const generation = await ctx.prisma.observation.findFirstOrThrow({
      where: {
        id: input,
        ...(ctx.session.user.admin === true
          ? undefined
          : {
              project: {
                members: {
                  some: {
                    userId: ctx.session.user.id,
                  },
                },
              },
            }),
      },
    });

    const scores = generation.traceId
      ? await ctx.prisma.score.findMany({
          where: {
            traceId: generation.traceId,
          },
        })
      : [];

    return { ...generation, scores };
  }),
});
