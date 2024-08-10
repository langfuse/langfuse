import { hasEntitlement } from "@/src/features/entitlements/server/hasEntitlement";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
} from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";
import * as z from "zod";

export const usageMeteringRouter = createTRPCRouter({
  last30d: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      if (
        !hasEntitlement({
          entitlement: "cloud-usage-metering",
          sessionUser: ctx.session.user,
          orgId: input.orgId,
        })
      )
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Missing cloud-usage-metering entitlement",
        });

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
