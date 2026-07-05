import {
  createTRPCRouter,
  protectedOrganizationProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import {
  INSTANCE_HEALTH_TIME_RANGES,
  type InstanceHealthTimeRange,
} from "@/src/features/instance-health/types";
import { getInstanceHealth } from "@/src/features/instance-health/server/instanceHealthService";
import { env } from "@/src/env.mjs";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const instanceHealthRouter = createTRPCRouter({
  get: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        timeRange: z
          .enum(INSTANCE_HEALTH_TIME_RANGES)
          .default("now" satisfies InstanceHealthTimeRange),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Not found" });
      }

      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organization:update",
      });

      return getInstanceHealth({
        prisma: ctx.prisma,
        timeRange: input.timeRange,
      });
    }),
});
