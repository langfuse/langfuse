import { createStripeClientReference } from "@/src/ee/features/billing/stripeClientReference";
import { stripeClient } from "@/src/ee/features/billing/utils/stripe";
import { stripeProducts } from "@/src/ee/features/billing/utils/stripeProducts";
import { env } from "@/src/env.mjs";
import { throwIfNoEntitlement } from "@/src/features/entitlements/server/hasEntitlement";
import { parseDbOrg } from "@/src/features/organizations/utils/parseDbOrg";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
} from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";
import * as z from "zod";

export const cloudBillingRouter = createTRPCRouter({
  createStripeCheckoutSession: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        stripeProductId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoEntitlement({
        entitlement: "cloud-billing",
        sessionUser: ctx.session.user,
        orgId: input.orgId,
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

      if (!stripeClient)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Stripe client not initialized",
        });

      const parsedOrg = parseDbOrg(org);
      const stripeCustomerId = parsedOrg.cloudConfig?.stripe?.customerId;
      const stripeActiveSubscriptionId =
        parsedOrg.cloudConfig?.stripe?.activeSubscriptionId;
      if (stripeActiveSubscriptionId) {
        // If the org has a customer ID, do not return checkout options, should use the billing portal instead
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Organization already has an active subscription",
        });
      }

      if (
        !stripeProducts.some(
          (product) =>
            Boolean(product.checkout) &&
            product.stripeProductId === input.stripeProductId,
        )
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid stripe product id",
        });

      const product = await stripeClient.products.retrieve(
        input.stripeProductId,
      );
      if (!product.default_price) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Product does not have a default price in Stripe",
        });
      }

      const returnUrl = `${env.NEXTAUTH_URL}/organization/${input.orgId}/settings/billing`;
      const session = await stripeClient.checkout.sessions.create({
        customer: stripeCustomerId,
        line_items: [
          {
            price: product.default_price as string,
          },
        ],
        client_reference_id:
          createStripeClientReference(input.orgId) ?? undefined,
        allow_promotion_codes: true,
        tax_id_collection: {
          enabled: true,
        },
        consent_collection: {
          terms_of_service: "required",
        },
        custom_fields: [
          {
            key: "business_name",
            label: {
              type: "custom",
              custom: "Business Name",
            },
            type: "text",
            text: {},
            optional: true,
          },
        ],
        customer_update: {
          name: "auto",
          address: "auto",
        },
        billing_address_collection: "required",
        success_url: returnUrl,
        cancel_url: returnUrl,
        mode: "subscription",
        metadata: {
          orgId: input.orgId,
          cloudRegion: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION ?? null,
        },
      });

      if (!session.url)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create checkout session",
        });

      return session.url;
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
      // TODO: add billing scope

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

      if (!stripeClient)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Stripe client not initialized",
        });

      const parsedOrg = parseDbOrg(org);
      let stripeCustomerId = parsedOrg.cloudConfig?.stripe?.customerId;
      if (!stripeCustomerId) {
        // Do not create a new customer if the org is on a plan (assigned manually)
        return null;
      }

      const billingPortalSession =
        await stripeClient.billingPortal.sessions.create({
          customer: stripeCustomerId,
          return_url: `${env.NEXTAUTH_URL}/organization/${input.orgId}/settings/billing`,
        });

      return billingPortalSession.url;
    }),
  last30dUsage: protectedOrganizationProcedure
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
