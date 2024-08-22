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
        projectId: z.string(), // required for protectedGetTraceProcedure
      }),
    )
    .query(async ({ input, ctx }) => {
      const [observation, scores] = await Promise.all([
        ctx.prisma.observation.findFirstOrThrow({
          where: {
            id: input.observationId,
            traceId: input.traceId,
            projectId: input.projectId,
          },
        }),
        ctx.prisma.score.findMany({
          where: {
            traceId: input.traceId,
            projectId: input.projectId,
          },
        }),
      ]);

      return { ...observation, scores: scores ?? [] };
    }),
});
