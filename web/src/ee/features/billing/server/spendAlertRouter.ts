import * as z from "zod/v4";

import { throwIfNoEntitlement } from "@/src/features/entitlements/server/hasEntitlement";

import {
  createTRPCRouter,
  protectedOrganizationProcedure,
} from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { throwIfNoOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { auditLog } from "@/src/features/audit-logs/auditLog";

export const spendAlertRouter = createTRPCRouter({
  getSpendAlerts: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoEntitlement({
        entitlement: "cloud-billing",
        sessionUser: ctx.session.user,
        orgId: input.orgId,
      });
      throwIfNoOrganizationAccess({
        organizationId: input.orgId,
        scope: "langfuseCloudBilling:CRUD",
        session: ctx.session,
      });

      const spendAlerts = await ctx.prisma.cloudSpendAlert.findMany({
        where: {
          orgId: input.orgId,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      return spendAlerts;
    }),

  createSpendAlert: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        title: z.string().min(1).max(100),
        threshold: z.number().positive().max(1000000), // Max $1M USD
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoEntitlement({
        entitlement: "cloud-billing",
        sessionUser: ctx.session.user,
        orgId: input.orgId,
      });
      throwIfNoOrganizationAccess({
        organizationId: input.orgId,
        scope: "langfuseCloudBilling:CRUD",
        session: ctx.session,
      });

      const spendAlert = await ctx.prisma.cloudSpendAlert.create({
        data: {
          orgId: input.orgId,
          title: input.title,
          threshold: input.threshold,
        },
      });

      await auditLog({
        session: ctx.session,
        orgId: input.orgId,
        resourceType: "cloudSpendAlert",
        resourceId: spendAlert.id,
        action: "create",
        after: spendAlert,
      });

      return spendAlert;
    }),

  updateSpendAlert: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        id: z.string(),
        title: z.string().min(1).max(100).optional(),
        threshold: z.number().positive().max(1000000).optional(), // Max $1M USD
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoEntitlement({
        entitlement: "cloud-billing",
        sessionUser: ctx.session.user,
        orgId: input.orgId,
      });
      throwIfNoOrganizationAccess({
        organizationId: input.orgId,
        scope: "langfuseCloudBilling:CRUD",
        session: ctx.session,
      });

      // Check if spend alert exists and belongs to the organization
      const existingAlert = await ctx.prisma.cloudSpendAlert.findFirst({
        where: {
          id: input.id,
          orgId: input.orgId,
        },
      });

      if (!existingAlert) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Spend alert not found",
        });
      }

      const updateData: { title?: string; threshold?: number } = {};
      if (input.title !== undefined) updateData.title = input.title;
      if (input.threshold !== undefined) updateData.threshold = input.threshold;

      const updatedAlert = await ctx.prisma.cloudSpendAlert.update({
        where: { id: input.id },
        data: updateData,
      });

      await auditLog({
        session: ctx.session,
        orgId: input.orgId,
        resourceType: "cloudSpendAlert",
        resourceId: updatedAlert.id,
        action: "update",
        before: existingAlert,
        after: updatedAlert,
      });

      return updatedAlert;
    }),

  deleteSpendAlert: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        id: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoEntitlement({
        entitlement: "cloud-billing",
        sessionUser: ctx.session.user,
        orgId: input.orgId,
      });
      throwIfNoOrganizationAccess({
        organizationId: input.orgId,
        scope: "langfuseCloudBilling:CRUD",
        session: ctx.session,
      });

      // Check if spend alert exists and belongs to the organization
      const existingAlert = await ctx.prisma.cloudSpendAlert.findFirst({
        where: {
          id: input.id,
          orgId: input.orgId,
        },
      });

      if (!existingAlert) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Spend alert not found",
        });
      }

      await ctx.prisma.cloudSpendAlert.delete({
        where: { id: input.id },
      });

      await auditLog({
        session: ctx.session,
        orgId: input.orgId,
        resourceType: "cloudSpendAlert",
        resourceId: input.id,
        action: "delete",
        before: existingAlert,
      });

      return { success: true };
    }),
});
