import * as z from "zod";

import { throwIfNoOrganizationAccess } from "@/src/features/rbac";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
} from "@/src/server/api/trpc";
import { USAGE_BREAKDOWN_MAX_RANGE_MS } from "@/src/features/organization-usage/constants/usageBreakdown";
import { getOrgUsageBreakdown } from "@/src/features/organization-usage/server/usageBreakdown";

export const organizationUsageRouter = createTRPCRouter({
  breakdown: protectedOrganizationProcedure
    .input(
      z
        .object({
          orgId: z.string(),
          from: z.date(),
          to: z.date(),
        })
        .refine((input) => input.from < input.to, {
          message: "from must be before to",
        })
        .refine(
          (input) =>
            input.to.getTime() - input.from.getTime() <=
            USAGE_BREAKDOWN_MAX_RANGE_MS,
          { message: "Time range must not exceed one year" },
        ),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoOrganizationAccess({
        organizationId: input.orgId,
        scope: "organizationUsage:read",
        session: ctx.session,
      });

      return await getOrgUsageBreakdown({
        prisma: ctx.prisma,
        orgId: input.orgId,
        from: input.from,
        to: input.to,
      });
    }),
});
