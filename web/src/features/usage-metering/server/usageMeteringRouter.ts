import {
  createTRPCRouter,
  protectedOrganizationProcedure,
} from "@/src/server/api/trpc";
import * as z from "zod";

export const usageMeteringRouter = createTRPCRouter({
  last30d: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      thirtyDaysAgo.setHours(0, 0, 0, 0);

      const usage = await ctx.prisma.observation.count({
        where: {
          project: {
            orgId: input.orgId,
          },
          startTime: {
            gte: thirtyDaysAgo,
          },
        },
      });

      return usage;
    }),
});
