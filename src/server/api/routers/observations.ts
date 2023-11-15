import {
  createTRPCRouter,
  protectedGetTraceProcedure,
} from "@/src/server/api/trpc";
import { z } from "zod";

export const observationsRouter = createTRPCRouter({
  byId: protectedGetTraceProcedure
    .input(
      z.object({
        observationId: z.string(),
        traceId: z.string(), // required for protectedGetTraceProcedure
      }),
    )
    .query(async ({ input, ctx }) => {
      // also works for other observations
      const generation = await ctx.prisma.observation.findFirstOrThrow({
        where: {
          id: input.observationId,
          traceId: input.traceId,
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
