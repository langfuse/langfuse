import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import * as z from "zod";

export const usageMeteringRouter = createTRPCRouter({
  currentMonth: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const startOfThisMonth = new Date();
      startOfThisMonth.setDate(1);
      startOfThisMonth.setHours(0, 0, 0, 0);

      const usage = await ctx.prisma.observation.count({
        where: {
          projectId: input.projectId,

          createdAt: {
            gte: startOfThisMonth,
          },
        },
      });

      return usage;
    }),
});
