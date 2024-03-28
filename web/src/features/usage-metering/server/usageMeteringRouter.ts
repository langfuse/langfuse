import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import * as z from "zod";

export const usageMeteringRouter = createTRPCRouter({
  last30d: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      thirtyDaysAgo.setHours(0, 0, 0, 0);

      const usage = await ctx.prisma.observation.count({
        where: {
          projectId: input.projectId,

          startTime: {
            gte: thirtyDaysAgo,
          },
        },
      });

      return usage;
    }),
});
