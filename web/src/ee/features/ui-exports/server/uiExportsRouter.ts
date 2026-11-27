import { isUiExportsDisabledByInstance } from "@/src/ee/features/ui-exports/server/uiExports";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoEntitlement } from "@/src/features/entitlements/server/hasEntitlement";
import { throwIfNoOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
} from "@/src/server/api/trpc";
import { ForbiddenError, LangfuseNotFoundError } from "@langfuse/shared";
import * as z from "zod";

export const uiExportsRouter = createTRPCRouter({
  // Turning UI exports off needs the entitlement; turning them back on works on
  // every plan, so an org that downgraded can still lift its own restriction.
  setDisabled: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string(), disabled: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organization:update",
      });
      if (input.disabled) {
        throwIfNoEntitlement({
          entitlement: "public-sharing-controls",
          sessionUser: ctx.session.user,
          orgId: input.orgId,
        });
      }
      if (isUiExportsDisabledByInstance()) {
        throw new ForbiddenError(
          "UI exports are disabled by the instance administrator.",
        );
      }

      const before = await ctx.prisma.organization.findUnique({
        where: { id: input.orgId },
        select: { uiExportsDisabled: true },
      });
      if (!before) {
        throw new LangfuseNotFoundError("Organization not found");
      }
      const after = await ctx.prisma.organization.update({
        where: { id: input.orgId },
        data: { uiExportsDisabled: input.disabled },
        select: { uiExportsDisabled: true },
      });

      await auditLog({
        session: ctx.session,
        resourceType: "organization",
        resourceId: input.orgId,
        action: "update",
        before,
        after,
      });

      return after;
    }),
});
