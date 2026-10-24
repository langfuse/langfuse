import { env } from "@/src/env.mjs";
import { auditLog } from "@/src/features/audit-logs/server";
import { throwIfNoEntitlement } from "@/src/features/entitlements/server";
import { throwIfNoOrganizationAccess } from "@/src/features/rbac";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
} from "@/src/server/api/trpc";
import { invalidateCachedOrgApiKeys } from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import * as z from "zod";

export const accessAuditLogRouter = createTRPCRouter({
  // The org's opt-in only takes effect in "org" mode; in "enforced" and
  // "disabled" the instance decides, so the setting is read-only.
  setEnabled: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string(), enabled: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organization:update",
      });
      throwIfNoEntitlement({
        entitlement: "audit-logs",
        sessionUser: ctx.session.user,
        orgId: input.orgId,
      });
      if (env.LANGFUSE_AUDIT_LOG_ACCESS_EVENTS !== "org") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Access logging is set by the instance administrator.",
        });
      }

      const before = await ctx.prisma.organization.findUnique({
        where: { id: input.orgId },
        select: { accessAuditLogEnabled: true },
      });
      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organization not found",
        });
      }
      const after = await ctx.prisma.organization.update({
        where: { id: input.orgId },
        data: { accessAuditLogEnabled: input.enabled },
        select: { accessAuditLogEnabled: true },
      });

      await auditLog({
        session: ctx.session,
        resourceType: "organization",
        resourceId: input.orgId,
        action: "update",
        before,
        after,
      });

      // Cached API keys carry the opt-in, so public API and MCP reads pick up
      // the change on their next request.
      await invalidateCachedOrgApiKeys(input.orgId);

      return after;
    }),
});
