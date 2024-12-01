import { createStripeClientReference } from "@/src/ee/features/billing/stripeClientReference";
import { stripeClient } from "@/src/ee/features/billing/utils/stripe";
import { stripeProducts } from "@/src/ee/features/billing/utils/stripeProducts";
import { env } from "@/src/env.mjs";
import { throwIfNoEntitlement } from "@/src/features/entitlements/server/hasEntitlement";
import { parseDbOrg, type Plan } from "@langfuse/shared";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
} from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";
import * as z from "zod";
import { throwIfNoOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { auditLog } from "@/src/features/audit-logs/auditLog";

const availablePlans = stripeProducts
  .filter((product) => product.checkout)
  .map((product) => product.mappedPlan);

export const cloudBillingRouter = createTRPCRouter({
  createStripeCheckoutSession: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        plan: z
          .string()
          .refine((plan) => availablePlans.includes(plan as Plan), {
            message: "Invalid plan",
          }),
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

      const org = await ctx.prisma.organization.findUnique({
        where: {
          id: input.orgId,
        },
      });
      if (!org) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Organization not found",
        });
      }

      const parsedOrg = parseDbOrg(org);
      if (parsedOrg.cloudConfig?.plan)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Cannot initialize stripe checkout for orgs that have a manual/legacy plan",
        });

      if (!stripeClient)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Stripe client not initialized",
        });

      const stripeCustomerId = parsedOrg.cloudConfig?.stripe?.customerId;
      const stripeActiveSubscriptionId =
        parsedOrg.cloudConfig?.stripe?.activeSubscriptionId;
      if (stripeActiveSubscriptionId) {
        // If the org has a customer ID, do not return checkout options, should use the billing portal instead
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Organization already has an active subscription",
        });
      }

      const checkoutProduct = stripeProducts.find(
        (product) => product.checkout && product.mappedPlan === input.plan,
      );
      if (!checkoutProduct)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Invalid plan",
        });

      const stripeUsageProduct = await stripeClient.products.retrieve(
        checkoutProduct.stripeUsageProductId,
      );
      const stripeSeatsProduct = await stripeClient.products.retrieve(
        checkoutProduct.stripeSeatsProductId,
      );

      if (!stripeUsageProduct.default_price) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Usage product does not have a default price in Stripe",
        });
      }
      if (!stripeSeatsProduct.default_price) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Seats product does not have a default price in Stripe",
        });
      }

      const currentSeatCount = await ctx.prisma.organizationMembership.count({
        where: {
          orgId: input.orgId,
        },
      });

      const returnUrl = `${env.NEXTAUTH_URL}/organization/${input.orgId}/settings`;
      const session = await stripeClient.checkout.sessions.create({
        customer: stripeCustomerId,
        line_items: [
          {
            price: stripeUsageProduct.default_price as string,
          },
          {
            price: stripeSeatsProduct.default_price as string,
            quantity: currentSeatCount,
          },
        ],
        client_reference_id:
          createStripeClientReference(input.orgId) ?? undefined,
        allow_promotion_codes: true,
        tax_id_collection: {
          enabled: true,
        },
        automatic_tax: {
          enabled: true,
        },
        consent_collection: {
          terms_of_service: "required",
        },
        ...(stripeCustomerId
          ? {
              customer_update: {
                name: "auto",
                address: "auto",
              },
            }
          : {}),
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

      auditLog({
        session: ctx.session,
        orgId: input.orgId,
        resourceType: "stripeCheckoutSession",
        resourceId: session.id,
        action: "create",
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
          code: "INTERNAL_SERVER_ERROR",
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
      let stripeSubscriptionId =
        parsedOrg.cloudConfig?.stripe?.activeSubscriptionId;
      if (!stripeCustomerId || !stripeSubscriptionId) {
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

      const organization = await ctx.prisma.organization.findUnique({
        where: {
          id: input.orgId,
        },
      });
      if (!organization) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Organization not found",
        });
      }
      const parsedOrg = parseDbOrg(organization);

      // For Stripe subscriptions, we can get usage from the Stripe Metered Billing API
      if (
        stripeClient &&
        parsedOrg.cloudConfig?.stripe?.customerId &&
        parsedOrg.cloudConfig?.stripe?.activeSubscriptionId
      ) {
        const subscription = await stripeClient.subscriptions.retrieve(
          parsedOrg.cloudConfig.stripe.activeSubscriptionId,
        );
        if (subscription) {
          const billingPeriod = {
            start: new Date(subscription.current_period_start * 1000),
            end: new Date(subscription.current_period_end * 1000),
          };

          // Get number of seats from subscription
          const seatsSubscriptionItem = subscription.items.data.find(
            (item) => !Boolean(item.plan?.meter),
          );
          const countUsers = seatsSubscriptionItem?.quantity;

          // Get metered usage information from next invoice
          const stripeInvoice = await stripeClient.invoices.retrieveUpcoming({
            subscription: parsedOrg.cloudConfig.stripe.activeSubscriptionId,
          });
          const upcomingInvoice = {
            usdAmount: stripeInvoice.amount_due / 100,
            date: new Date(stripeInvoice.period_end * 1000),
          };
          const usageInvoiceLines = stripeInvoice.lines.data.filter((line) =>
            Boolean(line.plan?.meter),
          );
          const usage = usageInvoiceLines.reduce((acc, line) => {
            if (line.quantity) {
              return acc + line.quantity;
            }
            return acc;
          }, 0);
          // get meter for usage type (events or observations)
          const meterId = usageInvoiceLines[0]?.plan?.meter;
          const meter = meterId
            ? await stripeClient.billing.meters.retrieve(meterId)
            : undefined;

          return {
            usageCount: usage,
            usageType: meter?.display_name.toLowerCase() ?? "events",
            billingPeriod,
            upcomingInvoice,
            countUsers,
          };
        }
      }

      // Free plan, usage not tracked on Stripe
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      thirtyDaysAgo.setHours(0, 0, 0, 0);

      const usageArr = await Promise.all([
        ctx.prisma.observation.count({
          where: {
            project: {
              orgId: input.orgId,
            },
            createdAt: {
              gte: thirtyDaysAgo,
            },
          },
        }),
        ctx.prisma.trace.count({
          where: {
            project: {
              orgId: input.orgId,
            },
            createdAt: {
              gte: thirtyDaysAgo,
            },
          },
        }),
        ctx.prisma.score.count({
          where: {
            project: {
              orgId: input.orgId,
            },
            createdAt: {
              gte: thirtyDaysAgo,
            },
          },
        }),
      ]);

      return {
        usageCount: usageArr.reduce((a, b) => a + b, 0),
        usageType: "events",
      };
    }),
});
