import * as z from "zod/v4";

import { stripeClient } from "@/src/ee/features/billing/utils/stripe";

import { throwIfNoEntitlement } from "@/src/features/entitlements/server/hasEntitlement";

import { parseDbOrg } from "@langfuse/shared";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
} from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { throwIfNoOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import {
  getObservationCountOfProjectsSinceCreationDate,
  getScoreCountOfProjectsSinceCreationDate,
  getTraceCountOfProjectsSinceCreationDate,
  logger,
} from "@langfuse/shared/src/server";
import { createBillingService } from "./BillingService";

export const cloudBillingRouter = createTRPCRouter({
  createStripeCheckoutSession: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        stripeProductId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoOrganizationAccess({
        organizationId: input.orgId,
        scope: "langfuseCloudBilling:CRUD",
        session: ctx.session,
      });
      throwIfNoEntitlement({
        entitlement: "cloud-billing",
        sessionUser: ctx.session.user,
        orgId: input.orgId,
      });

      const url = await createBillingService({
        prisma: ctx.prisma,
        stripe: stripeClient,
      }).createCheckoutSession(input.orgId, input.stripeProductId);

      void auditLog({
        session: ctx.session,
        orgId: input.orgId,
        resourceType: "organization",
        resourceId: input.orgId,
        action: "BillingService.createStripeCheckoutSession",
      });

      return url;
    }),
  changeStripeSubscriptionProduct: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        stripeProductId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoOrganizationAccess({
        organizationId: input.orgId,
        scope: "langfuseCloudBilling:CRUD",
        session: ctx.session,
      });
      throwIfNoEntitlement({
        entitlement: "cloud-billing",
        sessionUser: ctx.session.user,
        orgId: input.orgId,
      });

      const { auditInfo } = await createBillingService({
        prisma: ctx.prisma,
        stripe: stripeClient,
      }).changePlan(input.orgId, input.stripeProductId);

      void auditLog({
        session: ctx.session,
        orgId: input.orgId,
        resourceType: "organization",
        resourceId: input.orgId,
        action: "BillingService.changePlan",
        before: auditInfo.before,
        after: auditInfo.after,
      });
    }),
  cancelStripeSubscription: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoOrganizationAccess({
        organizationId: input.orgId,
        scope: "langfuseCloudBilling:CRUD",
        session: ctx.session,
      });
      throwIfNoEntitlement({
        entitlement: "cloud-billing",
        sessionUser: ctx.session.user,
        orgId: input.orgId,
      });

      const { auditInfo, status } = await createBillingService({
        prisma: ctx.prisma,
        stripe: stripeClient,
      }).cancel(input.orgId);

      void auditLog({
        session: ctx.session,
        orgId: input.orgId,
        resourceType: "organization",
        resourceId: input.orgId,
        action: "BillingService.cancel",
        before: auditInfo.before,
        after: auditInfo.after,
      });

      return { ok: true, status: status } as const;
    }),
  reactivateStripeSubscription: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoOrganizationAccess({
        organizationId: input.orgId,
        scope: "langfuseCloudBilling:CRUD",
        session: ctx.session,
      });
      throwIfNoEntitlement({
        entitlement: "cloud-billing",
        sessionUser: ctx.session.user,
        orgId: input.orgId,
      });

      const { auditInfo, status } = await createBillingService({
        prisma: ctx.prisma,
        stripe: stripeClient,
      }).reactivate(input.orgId);

      void auditLog({
        session: ctx.session,
        orgId: input.orgId,
        resourceType: "organization",
        resourceId: input.orgId,
        action: "BillingService.reactivate",
        before: auditInfo.before,
        after: auditInfo.after,
      });

      return { ok: true, status: status } as const;
    }),
  clearPlanSwitchSchedule: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      throwIfNoOrganizationAccess({
        organizationId: input.orgId,
        scope: "langfuseCloudBilling:CRUD",
        session: ctx.session,
      });
      throwIfNoEntitlement({
        entitlement: "cloud-billing",
        sessionUser: ctx.session.user,
        orgId: input.orgId,
      });

      const { auditInfo, status } = await createBillingService({
        prisma: ctx.prisma,
        stripe: stripeClient,
      }).clearPlanSwitchSchedule(input.orgId);

      void auditLog({
        session: ctx.session,
        orgId: input.orgId,
        resourceType: "organization",
        resourceId: input.orgId,
        action: "BillingService.clearPlanSwitchSchedule",
        before: auditInfo.before,
        after: auditInfo.after,
      });

      return { ok: true, status: status } as const;
    }),
  getStripeCustomerPortalUrl: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
      }),
    )
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

      try {
        return await createBillingService({
          prisma: ctx.prisma,
          stripe: stripeClient,
        }).getCustomerPortalUrl(input.orgId);
      } catch (error) {
        logger.error("cloudBilling.getStripeCustomerPortalUrl:error", {
          orgId: input.orgId,
          error,
        });
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Stripe error: ${error instanceof Error ? error.message : "Unknown Stripe error"}`,
          cause: error as Error,
        });
      }
    }),
  getInvoices: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        limit: z.number().int().min(1).max(100).default(10),
        startingAfter: z.string().optional(),
        endingBefore: z.string().optional(),
      }),
    )
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

      try {
        return await createBillingService({
          prisma: ctx.prisma,
          stripe: stripeClient,
        }).getInvoices(input.orgId, {
          limit: input.limit,
          startingAfter: input.startingAfter,
          endingBefore: input.endingBefore,
        });
      } catch (error) {
        logger.error("cloudBilling.getInvoices:error", {
          orgId: input.orgId,
          error,
        });
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Stripe error: ${error instanceof Error ? error.message : "Unknown Stripe error"}`,
          cause: error as Error,
        });
      }
    }),
  getUsage: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
      }),
    )
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

      const res = await createBillingService({
        prisma: ctx.prisma,
        stripe: stripeClient,
      }).getUsage(input.orgId);
      if (res.usageCount !== 0) return res as any;
      // Fallback to Clickhouse when Stripe usage is not available
      const organization = await ctx.prisma.organization.findUnique({
        where: { id: input.orgId },
        include: { projects: { select: { id: true } } },
      });
      if (!organization)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Organization not found",
        });
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      thirtyDaysAgo.setHours(0, 0, 0, 0);
      const projectIds = organization.projects.map((p) => p.id);
      const [countTraces, countObservations, countScores] = await Promise.all([
        getTraceCountOfProjectsSinceCreationDate({
          projectIds,
          start: thirtyDaysAgo,
        }),
        getObservationCountOfProjectsSinceCreationDate({
          projectIds,
          start: thirtyDaysAgo,
        }),
        getScoreCountOfProjectsSinceCreationDate({
          projectIds,
          start: thirtyDaysAgo,
        }),
      ]);
      return {
        usageCount: countTraces + countObservations + countScores,
        usageType: "units",
      } as const;
    }),
  getUsageAlerts: protectedOrganizationProcedure
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

      const org = await ctx.prisma.organization.findUnique({
        where: {
          id: input.orgId,
        },
      });
      if (!org) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organization not found",
        });
      }

      const parsedOrg = parseDbOrg(org);
      return parsedOrg.cloudConfig?.usageAlerts || null;
    }),
  upsertUsageAlerts: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        usageAlerts: z.object({
          enabled: z.boolean(),
          threshold: z.number().int().positive(),
          notifications: z.object({
            email: z.boolean().default(true),
            recipients: z.array(z.string().email()),
          }),
        }),
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

      try {
        const orgBefore = await ctx.prisma.organization.findUnique({
          where: { id: input.orgId },
        });
        const updatedAlerts = await createBillingService({
          prisma: ctx.prisma,
          stripe: stripeClient,
        }).upsertUsageAlerts(input.orgId, input.usageAlerts);
        const orgAfter = await ctx.prisma.organization.findUnique({
          where: { id: input.orgId },
        });
        void auditLog({
          session: ctx.session,
          orgId: input.orgId,
          resourceType: "organization",
          resourceId: input.orgId,
          action: "updateUsageAlerts",
          before: orgBefore!,
          after: orgAfter!,
        });
        return updatedAlerts;
      } catch (error) {
        logger.error("Failed to update usage alerts", {
          error,
          orgId: input.orgId,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update usage alerts",
        });
      }
    }),
});
