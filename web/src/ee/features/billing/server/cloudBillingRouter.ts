import { createStripeClientReference } from "@/src/ee/features/billing/stripeClientReference";
import { stripeClient } from "@/src/ee/features/billing/utils/stripe";
import {
  stripeProducts,
  stripeUsageProduct,
  isUpgrade,
} from "@/src/ee/features/billing/utils/stripeProducts";
import { env } from "@/src/env.mjs";
import { throwIfNoEntitlement } from "@/src/features/entitlements/server/hasEntitlement";
import { parseDbOrg } from "@langfuse/shared";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
} from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";
import * as z from "zod/v4";
import { throwIfNoOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import {
  getObservationCountOfProjectsSinceCreationDate,
  getScoreCountOfProjectsSinceCreationDate,
  getTraceCountOfProjectsSinceCreationDate,
  logger,
} from "@langfuse/shared/src/server";
import { UsageAlertService } from "./usageAlertService";
import type Stripe from "stripe";

const releaseExistingSubscriptionScheduleIfAny = async (
  client: Stripe,
  subscription: Stripe.Subscription,
) => {
  const schedule = await (async () => {
    if (!subscription.schedule) {
      return undefined;
    }
    if (typeof subscription.schedule === "string") {
      return await client.subscriptionSchedules.retrieve(subscription.schedule);
    }
    return subscription.schedule;
  })();

  if (!schedule) {
    return;
  }

  if (!["active", "not_started"].includes(schedule.status)) {
    logger.info(
      "cloudBilling.releaseExistingSubscriptionScheduleIfAny:scheduleNotActive (skipping release)",
      {
        scheduleId: schedule.id,
        status: schedule.status,
      },
    );
    return;
  }

  await client.subscriptionSchedules.release(schedule.id);
};

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

      try {
        const org = await ctx.prisma.organization.findUnique({
          where: {
            id: input.orgId,
          },
        });
        if (!org) {
          logger.error(
            "cloudBilling.createStripeCheckoutSession:organizationNotFound",
            { orgId: input.orgId },
          );
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Organization not found",
          });
        }

        const parsedOrg = parseDbOrg(org);
        if (parsedOrg.cloudConfig?.plan) {
          logger.error(
            "cloudBilling.createStripeCheckoutSession:planOverrideDetected",
            { orgId: input.orgId },
          );
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              "Cannot initialize stripe checkout for orgs that have a manual plan overrides",
          });
        }

        if (!stripeClient) {
          logger.error(
            "cloudBilling.createStripeCheckoutSession:stripeClientNotInitialized",
            { orgId: input.orgId },
          );
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Stripe client not initialized",
          });
        }

        const stripeCustomerId = parsedOrg.cloudConfig?.stripe?.customerId;
        const stripeActiveSubscriptionId =
          parsedOrg.cloudConfig?.stripe?.activeSubscriptionId;
        if (stripeActiveSubscriptionId) {
          logger.warn(
            "cloudBilling.createStripeCheckoutSession:activeSubscriptionExists",
            { orgId: input.orgId, stripeActiveSubscriptionId },
          );
          // If the org has a customer ID, do not return checkout options, should use the billing portal instead
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Organization already has an active subscription",
          });
        }

        if (
          !stripeProducts.some(
            (product) =>
              Boolean(product.checkout) &&
              product.stripeProductId === input.stripeProductId,
          )
        ) {
          logger.error(
            "cloudBilling.createStripeCheckoutSession:invalidStripeProductId",
            { orgId: input.orgId, stripeProductId: input.stripeProductId },
          );
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Invalid stripe product id",
          });
        }

        const product = await stripeClient.products.retrieve(
          input.stripeProductId,
        );
        if (!product.default_price) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Product does not have a default price in Stripe",
          });
        }

        const prices = await stripeClient.prices.list({
          product: input.stripeProductId,
          active: true, // Optional: only get active prices
          expand: ["data.tiers"], // Optional: include tier information for tiered prices
          limit: 100, // Adjust as needed
        });

        const defaultPrice = prices.data.find(
          (p) => p.id === product.default_price,
        );

        if (!defaultPrice) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not expand default price",
          });
        }

        // IIFE to scope optional behavior
        const lineItems = await (async () => {
          if (defaultPrice?.recurring?.usage_type === "metered") {
            // Old Setup; Price is plan and usage component (metered). No quantity required.
            return [{ price: product.default_price as string }];
          }

          const usageProductId = stripeUsageProduct.id;
          const usageProduct =
            await stripeClient.products.retrieve(usageProductId);
          if (!usageProduct.default_price) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Usage Product does not have a default price in Stripe",
            });
          }

          return [
            { price: product.default_price as string, quantity: 1 }, // the subscription plan
            { price: usageProduct.default_price as string }, // metered no quantity needed
          ];
        })();

        const returnUrl = `${env.NEXTAUTH_URL}/organization/${input.orgId}/settings`;
        const sessionConfig: Stripe.Checkout.SessionCreateParams = {
          customer: stripeCustomerId,
          line_items: lineItems,
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
          subscription_data: {
            metadata: {
              orgId: input.orgId,
              cloudRegion: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION ?? null,
            },
            billing_mode: {
              type: "flexible",
            },
          },
          metadata: {
            orgId: input.orgId,
            cloudRegion: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION ?? null,
          },
        };

        // Note: In subscription mode, Checkout automatically creates a Customer when none is provided.

        const session =
          await stripeClient.checkout.sessions.create(sessionConfig);

        if (!session.url) {
          logger.error(
            "cloudBilling.createStripeCheckoutSession:missingSessionUrl",
            { orgId: input.orgId, sessionId: session.id },
          );
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create checkout session",
          });
        }

        auditLog({
          session: ctx.session,
          orgId: input.orgId,
          resourceType: "stripeCheckoutSession",
          resourceId: session.id,
          action: "create",
        });

        return session.url;
      } catch (error) {
        logger.error("cloudBilling.createStripeCheckoutSession:error", {
          orgId: input.orgId,
          stripeProductId: input.stripeProductId,
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

      // check that product is valid
      if (
        !stripeProducts
          .filter((i) => Boolean(i.checkout))
          .map((i) => i.stripeProductId)
          .includes(input.stripeProductId)
      )
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Invalid stripe product id, product not available",
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
          message: "Cannot change plan for orgs that have a manual/legacy plan",
        });

      const stripeSubscriptionId =
        parsedOrg.cloudConfig?.stripe?.activeSubscriptionId;

      if (!stripeSubscriptionId)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Organization does not have an active subscription",
        });

      if (!stripeClient)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Stripe client not initialized",
        });

      const client = stripeClient;

      const subscription = await client.subscriptions.retrieve(
        stripeSubscriptionId,
        {
          expand: ["items.data.price", "schedule"],
        },
      );

      if (
        ["canceled", "paused", "incomplete", "incomplete_expired"].includes(
          subscription.status,
        )
      )
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Subscription is not active, current status: " +
            subscription.status,
        });

      const newProduct = await client.products.retrieve(input.stripeProductId);
      if (!newProduct.default_price)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "New product does not have a default price in Stripe",
        });

      const prices = await stripeClient.prices.list({
        product: newProduct.id,
        active: true, // Optional: only get active prices
        expand: ["data.tiers"], // Optional: include tier information for tiered prices
        limit: 100, // Adjust as needed
      });

      const newProductDefaultPrice = prices.data.find(
        (p) => p.id === newProduct.default_price,
      );

      if (!newProductDefaultPrice) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not expand default price",
        });
      }

      const isNewProductLegacy =
        newProductDefaultPrice.recurring?.usage_type === "metered";
      const isExistingSubscriptionLegacy =
        parseDbOrg(org).cloudConfig?.stripe?.isLegacySubscription === true;

      // we can only set either one of the two cancel_at or cancel_at_period_end props
      const cancellationPayload = subscription.cancel_at
        ? { cancel_at: null }
        : { cancel_at_period_end: false };

      if (isExistingSubscriptionLegacy || isNewProductLegacy) {
        // Legacy → New flow
        // Replace old single metered item with two items (plan + metered usage),
        // reset billing anchor to now and do NOT prorate. This should trigger an
        // immediate invoice for the new cycle while avoiding proration.

        // Resolve usage product default price
        const usageProduct = await client.products.retrieve(
          stripeUsageProduct.id,
        );
        if (!usageProduct.default_price)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Usage Product does not have a default price in Stripe",
          });

        const newLineItems = isNewProductLegacy
          ? [{ price: newProduct.default_price as string }] // legacy: one price for usage and plan
          : [
              // add new plan product (licensed)
              { price: newProduct.default_price as string, quantity: 1 },
              // add usage product (metered)
              { price: usageProduct.default_price as string },
            ];

        await releaseExistingSubscriptionScheduleIfAny(
          stripeClient,
          subscription,
        );

        await client.subscriptions.update(stripeSubscriptionId, {
          items: [
            // remove all current items (legacy should only have one, but be safe)
            ...subscription.items.data.map((i) => ({
              id: i.id,
              deleted: true,
            })),
            ...newLineItems,
          ],
          billing_cycle_anchor: "now",
          proration_behavior: "none",
          ...cancellationPayload,
        });

        return;
      }

      // Non-legacy flow (two-item subscriptions: plan + usage)
      // Identify plan and usage items

      if (subscription.billing_mode?.type === "classic") {
        await stripeClient.subscriptions.migrate(stripeSubscriptionId, {
          billing_mode: {
            type: "flexible",
          },
        });
      }

      const planItem = subscription.items.data.find(
        (i) => i.price.recurring?.usage_type !== "metered",
      );

      if (!planItem)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Current subscription does not contain a plan item",
        });

      const currentPlanProductId = planItem.price.product as string;
      if (
        !stripeProducts
          .map((i) => i.stripeProductId)
          .includes(currentPlanProductId)
      )
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Current plan item is not a recognized product",
        });

      const upgrading = isUpgrade(currentPlanProductId, input.stripeProductId);

      if (upgrading) {
        // Upgrade: swap the plan item price now, keep usage item as-is.
        // Prorate and invoice the proration immediately; do NOT reset billing anchor.

        // Best-effort: clear any pre-existing schedules before changing
        await releaseExistingSubscriptionScheduleIfAny(
          stripeClient,
          subscription,
        );

        await client.subscriptions.update(stripeSubscriptionId, {
          items: [
            {
              id: planItem.id,
              price: newProduct.default_price as string,
              quantity: 1,
            },
          ],
          proration_behavior: "always_invoice", // Immediately invoice proration
          // Note: Usage-based charges continue to the end of the cycle by design
          ...cancellationPayload,
        });

        return;
      }

      // Downgrade: schedule the price change at end of current billing period and
      // keep the user on the old plan until then. Leave usage item running.

      const currentPeriodEndSec =
        (subscription as any).current_period_end ?? planItem.current_period_end;

      // Build items arrays for the schedule phases

      const nextPhaseItems = subscription.items.data.map((i) => {
        const isMetered = i.price.recurring?.usage_type === "metered";
        if (i.id === planItem.id) {
          return { price: newProduct.default_price as string, quantity: 1 };
        }
        return {
          price: i.price.id,
          ...(isMetered ? {} : { quantity: i.quantity ?? 1 }),
        };
      });

      // 1. Clear any existing schedules before creating a new one
      await releaseExistingSubscriptionScheduleIfAny(
        stripeClient,
        subscription,
      );

      // 2. First create the schedule off the current subscription
      const initialSchedule = await client.subscriptionSchedules.create({
        from_subscription: stripeSubscriptionId,
      });

      // 3. Then update the schedule to the new plan
      await client.subscriptionSchedules.update(initialSchedule.id, {
        end_behavior: "release",
        phases: [
          // Keep the existing phase but set the end date to current period end
          {
            start_date: initialSchedule.phases[0].start_date,
            end_date: currentPeriodEndSec,
            items: initialSchedule.phases[0]!.items as any, // ts error
            proration_behavior: "none",
          },
          // Add new phase with the product change
          {
            start_date: currentPeriodEndSec,
            items: nextPhaseItems,
            proration_behavior: "none",
          },
        ],
        metadata: {
          orgId: input.orgId,
          reasons: "planSwitch.Downgrade",
          newProductId: input.stripeProductId, // id of the new plan
          usageProductId: stripeUsageProduct.id, // id of the usage product
          switchAt: currentPeriodEndSec,
        },
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

      const org = await ctx.prisma.organization.findUnique({
        where: { id: input.orgId },
      });
      if (!org) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Organization not found",
        });
      }
      const parsedOrg = parseDbOrg(org);
      const subscriptionId =
        parsedOrg.cloudConfig?.stripe?.activeSubscriptionId;
      if (!subscriptionId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "No active subscription to cancel",
        });
      }
      if (!stripeClient) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Stripe client not initialized",
        });
      }
      const subscription = await stripeClient.subscriptions.retrieve(
        subscriptionId,
        {
          expand: ["items.data.price", "schedule"],
        },
      );

      if (!subscription) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Subscription not found",
        });
      }

      await releaseExistingSubscriptionScheduleIfAny(
        stripeClient,
        subscription,
      );

      // Cancel at period end (classic behavior) regardless of billing mode
      const updated = await stripeClient.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
        proration_behavior: "none",
      });

      auditLog({
        session: ctx.session,
        orgId: input.orgId,
        resourceType: "organization",
        resourceId: subscriptionId,
        action: "cancel",
      });
      return { ok: true, status: updated.status } as const;
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

      const org = await ctx.prisma.organization.findUnique({
        where: { id: input.orgId },
      });
      if (!org) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Organization not found",
        });
      }
      const parsedOrg = parseDbOrg(org);
      const subscriptionId =
        parsedOrg.cloudConfig?.stripe?.activeSubscriptionId;
      if (!subscriptionId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "No active subscription to reactivate",
        });
      }
      if (!stripeClient) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Stripe client not initialized",
        });
      }

      const subscription = await stripeClient.subscriptions.retrieve(
        subscriptionId,
        {
          expand: ["items.data.price", "schedule"],
        },
      );

      if (!subscription) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Subscription not found",
        });
      }

      // we can only set either one of the two cancel_at or cancel_at_period_end props
      const cancellationPayload = subscription.cancel_at
        ? { cancel_at: null }
        : { cancel_at_period_end: false };

      await releaseExistingSubscriptionScheduleIfAny(
        stripeClient,
        subscription,
      );

      // Reactivate by turning off cancel at period end and clear cancel_at if set
      const updated = await stripeClient.subscriptions.update(subscriptionId, {
        ...cancellationPayload,
      });

      auditLog({
        session: ctx.session,
        orgId: input.orgId,
        resourceType: "organization",
        resourceId: subscriptionId,
        action: "reactivate",
      });
      return { ok: true, status: updated.status } as const;
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

      const org = await ctx.prisma.organization.findUnique({
        where: { id: input.orgId },
      });
      if (!org) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Organization not found",
        });
      }
      const parsedOrg = parseDbOrg(org);
      const subscriptionId =
        parsedOrg.cloudConfig?.stripe?.activeSubscriptionId;
      if (!subscriptionId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "No active subscription found",
        });
      }
      if (!stripeClient) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Stripe client not initialized",
        });
      }

      const subscription = await stripeClient.subscriptions.retrieve(
        subscriptionId,
        { expand: ["schedule"] },
      );

      await releaseExistingSubscriptionScheduleIfAny(
        stripeClient,
        subscription,
      );

      auditLog({
        session: ctx.session,
        orgId: input.orgId,
        resourceType: "organization",
        resourceId: subscriptionId,
        action: "clearPlanSwitchSchedule",
      });

      return { ok: true } as const;
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
        const org = await ctx.prisma.organization.findUnique({
          where: {
            id: input.orgId,
          },
        });
        if (!org) {
          logger.error("cloudBilling.getStripeCustomerPortalUrl:orgNotFound", {
            orgId: input.orgId,
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Organization not found",
          });
        }

        if (!stripeClient) {
          logger.error(
            "cloudBilling.getStripeCustomerPortalUrl:stripeClientNotInitialized",
            { orgId: input.orgId },
          );
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Stripe client not initialized",
          });
        }

        const parsedOrg = parseDbOrg(org);
        const stripeCustomerId = parsedOrg.cloudConfig?.stripe?.customerId;
        const stripeSubscriptionId =
          parsedOrg.cloudConfig?.stripe?.activeSubscriptionId;

        if (!stripeCustomerId || !stripeSubscriptionId) {
          // Do not create a new customer if the org is on a plan (assigned manually)
          logger.warn(
            "cloudBilling.getStripeCustomerPortalUrl:noCustomerOrSubscription",
            { orgId: input.orgId, stripeCustomerId, stripeSubscriptionId },
          );
          return null;
        }

        const billingPortalSession =
          await stripeClient.billingPortal.sessions.create({
            customer: stripeCustomerId,
            return_url: `${env.NEXTAUTH_URL}/organization/${input.orgId}/settings/billing`,
          });

        return billingPortalSession.url;
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
        include: {
          projects: {
            select: {
              id: true,
            },
          },
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
          {
            expand: ["items.data"],
          },
        );

        if (subscription) {
          const usageItem = subscription.items.data.find((item) => {
            return item.price.recurring?.usage_type === "metered";
          });

          if (!usageItem) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Cloud Usage Product item not found in subscription",
            });
          }

          const billingPeriod = {
            start: new Date(usageItem.current_period_start * 1000),
            end: new Date(usageItem.current_period_end * 1000),
          };

          try {
            const stripeInvoice = await stripeClient.invoices.createPreview({
              subscription: parsedOrg.cloudConfig.stripe.activeSubscriptionId,
              // Expand price details to get the full price object
              expand: ["lines.data.pricing.price_details"],
            });

            const usageInvoiceLines = stripeInvoice.lines.data.filter(
              // One line for each tier in the usage product

              // Note: any because the types from expand are not properly typed
              (line: any) => {
                const isMeteredLineItem =
                  line.pricing?.price_details?.price === usageItem.price.id;

                return isMeteredLineItem;
              },
            );
            const totalUsage = usageInvoiceLines.reduce((acc, line) => {
              if (line.quantity) {
                return acc + line.quantity;
              }
              return acc;
            }, 0);

            // get meter for usage type (units or observations)
            // Note: any because the types from expand are not properly typed
            const meterId = (
              usageInvoiceLines[0]?.pricing?.price_details?.price as any
            )?.recurring?.meter;
            const meter = meterId
              ? await stripeClient.billing.meters.retrieve(meterId)
              : undefined;

            const upcomingInvoice = {
              usdAmount: stripeInvoice.amount_due / 100,
              date: new Date(stripeInvoice.period_end * 1000),
            };

            return {
              usageCount: totalUsage,
              usageType: meter?.display_name.toLowerCase() ?? "units",
              billingPeriod,
              upcomingInvoice,
            };
          } catch (e) {
            logger.error(
              "Failed to get usage from Stripe, using usage from Clickhouse",
              {
                error: e,
              },
            );
          }
        }
      }

      // Free plan, usage not tracked on Stripe, get usage from Clickhouse
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
      };
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
      const stripeCustomerId = parsedOrg.cloudConfig?.stripe?.customerId;
      const subscriptionId =
        parsedOrg.cloudConfig?.stripe?.activeSubscriptionId;
      const currentAlerts = parsedOrg.cloudConfig?.usageAlerts;

      if (!stripeCustomerId || !subscriptionId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Organization must have a Stripe customer with active subscription to configure usage alerts",
        });
      }

      if (!stripeClient) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Stripe client not initialized",
        });
      }

      let updatedAlerts = input.usageAlerts;

      // Get the meterId for the given subscription
      const subscription =
        await stripeClient.subscriptions.retrieve(subscriptionId);
      if (!subscription) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Stripe subscription not found",
        });
      }
      const meterId = subscription.items.data.filter((subItem) =>
        Boolean(subItem.plan.meter),
      )[0]?.plan.meter;

      try {
        const updatedUsageAlertConfig = {
          enabled: updatedAlerts.enabled,
          type: "STRIPE",
          threshold: updatedAlerts.threshold,
          alertId: currentAlerts?.alertId ?? null, // Keep the existing alert ID if it exists
          meterId: meterId ?? null, // Use the meter ID from the subscription
          notifications: {
            email: updatedAlerts.notifications.email,
            recipients: updatedAlerts.notifications.recipients,
          },
        };

        // Disable the usage alert if it got disabled
        if (
          !updatedAlerts.enabled &&
          currentAlerts?.alertId &&
          currentAlerts?.enabled
        ) {
          await UsageAlertService.getInstance({
            stripeClient,
          }).deactivate({ id: currentAlerts?.alertId });
        }

        // If there is no existing alert, create a new one
        if (!currentAlerts?.alertId) {
          const alert = await UsageAlertService.getInstance({
            stripeClient,
          }).create({
            orgId: input.orgId,
            customerId: stripeCustomerId,
            meterId,
            amount: updatedAlerts.threshold,
          });
          updatedUsageAlertConfig.alertId = alert.id;
        }

        // If there is an existing alert with a different amount or meterId, replace it
        if (
          updatedAlerts.enabled &&
          currentAlerts?.alertId &&
          (currentAlerts?.threshold !== updatedAlerts.threshold ||
            currentAlerts.meterId !== meterId)
        ) {
          const alert = await UsageAlertService.getInstance({
            stripeClient,
          }).recreate({
            orgId: input.orgId,
            customerId: stripeCustomerId,
            meterId,
            existingAlertId: currentAlerts.alertId,
            amount: updatedAlerts.threshold,
          });
          updatedUsageAlertConfig.alertId = alert.id;
        }

        // If there is an existing, inactive alert, reactivate it
        if (
          updatedAlerts.enabled &&
          currentAlerts?.alertId &&
          !currentAlerts.enabled
        ) {
          await UsageAlertService.getInstance({
            stripeClient,
          }).activate({ id: currentAlerts.alertId });
        }

        // Update organization with new usage alerts configuration
        const newCloudConfig = {
          ...parsedOrg.cloudConfig,
          usageAlerts: updatedUsageAlertConfig,
        };

        const updatedOrg = await ctx.prisma.organization.update({
          where: {
            id: input.orgId,
          },
          data: {
            cloudConfig: newCloudConfig,
          },
        });

        await auditLog({
          session: ctx.session,
          orgId: input.orgId,
          resourceType: "organization",
          resourceId: input.orgId,
          action: "updateUsageAlerts",
          before: org,
          after: updatedOrg,
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
