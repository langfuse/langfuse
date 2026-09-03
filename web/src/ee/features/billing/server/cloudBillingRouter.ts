import * as z from "zod";

import { throwIfNoEntitlement } from "@/src/features/entitlements/server/hasEntitlement";

import {
  createTRPCRouter,
  protectedOrganizationProcedure,
} from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { throwIfNoOrganizationAccess } from "@/src/features/rbac";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { logger } from "@langfuse/shared/src/server";
import { type BillingProvider } from "@langfuse/shared";
import { resolveBillingService } from "./resolveBillingService";
import { isCloudBillingEnabled } from "../utils/isCloudBilling";

const PROVIDER_LABEL: Record<BillingProvider, string> = {
  stripe: "Stripe",
  clickhouse: "ClickHouse Billing",
};

/**
 * Names the provider that actually failed. Both procedures below can dispatch
 * to either provider, so a hardcoded "Stripe error:" would point on-call at
 * the wrong system for a CHB REST failure.
 */
const billingErrorMessage = (
  billingProvider: BillingProvider,
  error: unknown,
) => {
  const label = PROVIDER_LABEL[billingProvider];
  return `${label} error: ${error instanceof Error ? error.message : `Unknown ${label} error`}`;
};

export const cloudBillingRouter = createTRPCRouter({
  getSubscriptionInfo: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        opId: z.string().optional(),
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

      // Return null for non-cloud environments to avoid 500 errors
      if (!isCloudBillingEnabled()) {
        logger.info(
          "cloudBilling.getSubscriptionInfo called in non-cloud environment, returning null",
          { orgId: input.orgId },
        );
        return {
          cancellation: null,
          scheduledChange: null,
          billingPeriod: null,
          hasValidPaymentMethod: false,
          billingProvider: "stripe" as const,
        };
      }

      const { billingProvider, service } = await resolveBillingService(
        ctx,
        input.orgId,
      );
      const res = await service.getSubscriptionInfo(input.orgId);
      return { ...res, billingProvider };
    }),
  createStripeCheckoutSession: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        stripeProductId: z.string(),
        opId: z.string().optional(),
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

      if (!isCloudBillingEnabled()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Cloud billing is not available in this environment. This feature requires NEXT_PUBLIC_LANGFUSE_CLOUD_REGION to be configured.",
        });
      }

      const { service } = await resolveBillingService(ctx, input.orgId);

      // opId is forwarded: the CHB path keys its checkout request on it, so
      // dropping it would send a concurrent retry to CHB with no idempotency
      // key and orphan a CH organization. Stripe stays byte-identical because
      // its createCheckoutSession ignores the argument.
      const url = await service.createCheckoutSession(
        input.orgId,
        input.stripeProductId,
        input.opId,
      );

      auditLog({
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
        opId: z.string().optional(),
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

      if (!isCloudBillingEnabled()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Cloud billing is not available in this environment. This feature requires NEXT_PUBLIC_LANGFUSE_CLOUD_REGION to be configured.",
        });
      }

      const { service } = await resolveBillingService(ctx, input.orgId);

      // opId is intentionally not forwarded: the Stripe path never received
      // it here, and §4.2 keeps Stripe behavior byte-identical.
      await service.changePlan(input.orgId, input.stripeProductId);
    }),
  cancelStripeSubscription: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        opId: z.string().optional(),
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

      if (!isCloudBillingEnabled()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Cloud billing is not available in this environment. This feature requires NEXT_PUBLIC_LANGFUSE_CLOUD_REGION to be configured.",
        });
      }

      const { service } = await resolveBillingService(ctx, input.orgId);

      await service.cancel(input.orgId, input.opId);

      return { ok: true } as const;
    }),
  reactivateStripeSubscription: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        opId: z.string().optional(),
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

      if (!isCloudBillingEnabled()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Cloud billing is not available in this environment. This feature requires NEXT_PUBLIC_LANGFUSE_CLOUD_REGION to be configured.",
        });
      }

      const { service } = await resolveBillingService(ctx, input.orgId);

      await service.reactivate(input.orgId, input.opId);

      return { ok: true } as const;
    }),
  clearPlanSwitchSchedule: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string(), opId: z.string().optional() }))
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

      if (!isCloudBillingEnabled()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Cloud billing is not available in this environment. This feature requires NEXT_PUBLIC_LANGFUSE_CLOUD_REGION to be configured.",
        });
      }

      const { service } = await resolveBillingService(ctx, input.orgId);

      await service.clearPlanSwitchSchedule(input.orgId, input.opId);

      return { ok: true } as const;
    }),
  getStripeCustomerPortalUrl: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        opId: z.string().optional(),
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

      if (!isCloudBillingEnabled()) {
        logger.info(
          "cloudBilling.getStripeCustomerPortalUrl called in non-cloud environment, returning null",
          { orgId: input.orgId },
        );
        return null;
      }

      // Resolved outside the try so the catch can label the failure with the
      // provider that actually failed. `ChbApiError` extends `Error`, not
      // `TRPCError`, so a CHB REST failure reaches the wrapper below.
      let billingProvider: BillingProvider = "stripe";
      try {
        const resolved = await resolveBillingService(ctx, input.orgId);
        billingProvider = resolved.billingProvider;
        return await resolved.service.getCustomerPortalUrl(input.orgId);
      } catch (error) {
        logger.error("cloudBilling.getStripeCustomerPortalUrl:error", {
          orgId: input.orgId,
          billingProvider,
          error,
        });
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: billingErrorMessage(billingProvider, error),
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

      if (!isCloudBillingEnabled()) {
        logger.info(
          "cloudBilling.getInvoices called in non-cloud environment, returning empty",
          { orgId: input.orgId },
        );
        return { invoices: [], hasMore: false, cursors: {} };
      }

      let billingProvider: BillingProvider = "stripe";
      try {
        const resolved = await resolveBillingService(ctx, input.orgId);
        billingProvider = resolved.billingProvider;
        return await resolved.service.getInvoices(input.orgId, {
          limit: input.limit,
          startingAfter: input.startingAfter,
          endingBefore: input.endingBefore,
        });
      } catch (error) {
        logger.error("cloudBilling.getInvoices:error", {
          orgId: input.orgId,
          billingProvider,
          error,
        });
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: billingErrorMessage(billingProvider, error),
          cause: error as Error,
        });
      }
    }),
  getUsage: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        opId: z.string().optional(),
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

      // Return null for non-cloud environments to avoid 500 errors
      if (!isCloudBillingEnabled()) {
        logger.info(
          "cloudBilling.getUsage called in non-cloud environment, returning null",
          { orgId: input.orgId },
        );
        return null;
      }

      const { service } = await resolveBillingService(ctx, input.orgId);

      return await service.getUsage(input.orgId);
    }),
  applyPromotionCode: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        code: z.string().min(1),
        opId: z.string().optional(),
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

      if (!isCloudBillingEnabled()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Cloud billing is not available in this environment. This feature requires NEXT_PUBLIC_LANGFUSE_CLOUD_REGION to be configured.",
        });
      }

      const { service } = await resolveBillingService(ctx, input.orgId);

      const result = await service.applyPromotionCode(
        input.orgId,
        input.code,
        input.opId,
      );

      return result;
    }),
});
