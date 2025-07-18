import { createStripeClientReference } from "@/src/ee/features/billing/stripeClientReference";
import { stripeClient } from "@/src/ee/features/billing/utils/stripe";
import { stripeProducts } from "@/src/ee/features/billing/utils/stripeProducts";
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

      if (
        !stripeProducts.some(
          (product) =>
            Boolean(product.checkout) &&
            product.stripeProductId === input.stripeProductId,
        )
      )
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Invalid stripe product id",
        });

      const product = await stripeClient.products.retrieve(
        input.stripeProductId,
      );
      if (!product.default_price) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Product does not have a default price in Stripe",
        });
      }

      const returnUrl = `${env.NEXTAUTH_URL}/organization/${input.orgId}/settings`;
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

      const subscription =
        await stripeClient.subscriptions.retrieve(stripeSubscriptionId);

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

      if (subscription.items.data.length !== 1)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Subscription has multiple items",
        });

      const item = subscription.items.data[0];

      if (
        !stripeProducts
          .map((i) => i.stripeProductId)
          .includes(item.price.product as string)
      )
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Current subscription product is not a valid product",
        });

      const newProduct = await stripeClient.products.retrieve(
        input.stripeProductId,
      );
      if (!newProduct.default_price)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "New product does not have a default price in Stripe",
        });

      await stripeClient.subscriptions.update(stripeSubscriptionId, {
        items: [
          // remove current product from subscription
          {
            id: item.id,
            deleted: true,
          },
          // add new product to subscription
          {
            price: newProduct.default_price as string,
          },
        ],
        // reset billing cycle which causes immediate invoice for existing plan
        billing_cycle_anchor: "now",
        proration_behavior: "none",
      });
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
        );
        if (subscription) {
          const billingPeriod = {
            start: new Date(subscription.current_period_start * 1000),
            end: new Date(subscription.current_period_end * 1000),
          };

          try {
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
            // get meter for usage type (units or observations)
            const meterId = usageInvoiceLines[0]?.plan?.meter;
            const meter = meterId
              ? await stripeClient.billing.meters.retrieve(meterId)
              : undefined;

            return {
              usageCount: usage,
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
