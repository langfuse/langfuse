import type Stripe from "stripe";
import { TRPCError } from "@trpc/server";
import { type OrgAuthedContext } from "@/src/server/api/trpc";
import { SpanKind } from "@opentelemetry/api";

import { env } from "@/src/env.mjs";

import { parseDbOrg } from "@langfuse/shared";
import {
  logger,
  getBillingCycleStart,
  getBillingCycleEnd,
  instrumentAsync,
  traceException,
} from "@langfuse/shared/src/server";

import {
  type Expanded,
  type ExpandedNullable,
  isExpanded,
  isExpandedOrNullable,
} from "@/src/ee/features/billing/utils/stripeExpand";
import { stripeClient as defaultStripeClient } from "@/src/ee/features/billing/utils/stripe";
import { StripeCatalogue } from "@/src/ee/features/billing/utils/stripeCatalogue";
import { createStripeClientReference } from "@/src/ee/features/billing/utils/stripeClientReference";
import { auditLog } from "@/src/features/audit-logs/auditLog";

import {
  makeIdempotencyKey,
  IdempotencyKind,
} from "@/src/ee/features/billing/utils/stripeIdempotencyKey";

import { type StripeSubscriptionMetadata } from "@/src/ee/features/billing/utils/stripeSubscriptionMetadata";

type ProductWithDefaultPrice = Expanded<Stripe.Product, "default_price">;
type SubscriptionWithSchedule = ExpandedNullable<
  Stripe.Subscription,
  "schedule"
>;
export type BillingSubscriptionInfo = {
  cancellation: {
    cancelAt: number;
  } | null;
  scheduledChange: {
    scheduleId: string;
    switchAt: number;
    newProductId?: string;
    message?: string | null;
  } | null;
  billingPeriod?: {
    start: Date;
    end: Date;
  } | null;
  discounts?: Array<{
    id: string;
    code: string | null;
    name: string | null;
    kind: "percent" | "amount";
    value: number; // percent value or amount in currency minor units (e.g. cents)
    currency: string | null;
    duration: "forever" | "once" | "repeating" | null;
    durationInMonths: number | null;
  }>;
  hasValidPaymentMethod: boolean;
};

class BillingService {
  constructor(
    private stripe: Stripe,
    private ctx: OrgAuthedContext,
  ) {}

  /** Returns true if a Price is metered (classic `usage_type` or flexible `recurring.meter`). */
  private isMetered(price: Stripe.Price | undefined): boolean {
    if (!price) return false;
    if (price.recurring?.usage_type === "metered") return true;
    if ((price.recurring as any)?.meter) return true;
    return false;
  }

  private async getParsedOrg(orgId: string) {
    const org = await this.ctx.prisma.organization.findUnique({
      where: { id: orgId },
    });
    if (!org) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Organization not found",
      });
    }
    return {
      org,
      parsedOrg: parseDbOrg(org),
    } as const;
  }

  private async getParsedOrgWithProjects(orgId: string) {
    const org = await this.ctx.prisma.organization.findUnique({
      where: { id: orgId },
      include: { projects: { select: { id: true } } },
    });
    if (!org) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Organization not found",
      });
    }
    return { org, parsedOrg: parseDbOrg(org) };
  }

  private async retrieveSubscriptionWithScheduleAndDiscounts(
    client: Stripe,
    subscriptionId: string,
  ): Promise<SubscriptionWithSchedule> {
    return await instrumentAsync(
      { name: "stripe.subscription.retrieve", spanKind: SpanKind.CLIENT },
      async (span) => {
        span.setAttribute("stripe.subscription_id", subscriptionId);

        const subscription = await client.subscriptions.retrieve(
          subscriptionId,
          {
            expand: [
              "schedule",
              // Expand discounts for promotion code display
              "discounts",
              "discounts.coupon",
              "discounts.promotion_code",
            ],
          },
        );

        const schedule = subscription.schedule;

        if (!isExpandedOrNullable(schedule)) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Stripe Error: Could not expand schedule on subscription ${subscriptionId}`,
          });
        }

        // Note: Discounts - We cannot easily type arrays here, so we leave it to the calling component to type it

        return { ...subscription, schedule: schedule };
      },
    );
  }

  private async retrieveProductWithDefaultPrice(
    client: Stripe,
    productId: string,
  ): Promise<ProductWithDefaultPrice> {
    return await instrumentAsync(
      { name: "stripe.product.retrieve", spanKind: SpanKind.CLIENT },
      async (span) => {
        span.setAttribute("stripe.product_id", productId);

        const product = await client.products.retrieve(productId, {
          expand: ["default_price"],
        });

        const defaultPrice = product.default_price;

        if (!isExpanded(defaultPrice)) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Stripe Error: Could not expand default_price on product ${productId}`,
          });
        }

        return { ...product, default_price: defaultPrice };
      },
    );
  }

  private async retrieveInvoiceList(
    stripeCustomerId: string,
    limit: number,
    startingAfter?: string,
    endingBefore?: string,
  ) {
    return await instrumentAsync(
      { name: "stripe.invoices.list", spanKind: SpanKind.CLIENT },
      async (span) => {
        span.setAttributes({
          "stripe.customer_id": stripeCustomerId,
          limit: limit,
        });

        const client = this.stripe;

        // Note: We assume each stripe Customer has only one subscription
        // if this changes, we need to update the code to not leak other subscriptions

        const result = await client.invoices.list({
          customer: stripeCustomerId,
          limit: limit,
          starting_after: startingAfter,
          ending_before: endingBefore,
        });

        return result;
      },
    );
  }

  private async createInvoicePreview(
    client: Stripe,
    stripeCustomerId: string,
    subscriptionId: string,
  ) {
    return await instrumentAsync(
      { name: "stripe.invoice.preview", spanKind: SpanKind.CLIENT },
      async (span) => {
        span.setAttributes({
          "stripe.customer_id": stripeCustomerId,
          "stripe.subscription_id": subscriptionId,
        });

        const subscription =
          await client.subscriptions.retrieve(subscriptionId);

        const canCreateInvoicePreview = [
          "active",
          "past_due",
          "trialing",
          "unpaid",
        ].includes(subscription.status);

        if (!canCreateInvoicePreview) {
          return null;
        }

        return await client.invoices.createPreview({
          customer: stripeCustomerId,
          subscription: subscriptionId,
        });
      },
    );
  }

  private async releaseExistingSubscriptionScheduleIfAny(
    subscription: SubscriptionWithSchedule,
    opId?: string,
  ) {
    return await instrumentAsync(
      {
        name: "stripe.subscriptionSchedule.release",
        spanKind: SpanKind.CLIENT,
      },
      async (span) => {
        const client = this.stripe;
        const schedule = subscription.schedule;

        if (!schedule) {
          return; // no schedule to release
        }

        span.setAttributes({
          "stripe.schedule_id": schedule.id,
          schedule_status: schedule.status,
        });

        if (!["active", "not_started"].includes(schedule.status)) {
          logger.info(
            "stripeBillingService.releaseExistingSubscriptionScheduleIfAny:scheduleNotActive (skipping release)",
            {
              scheduleId: schedule.id,
              status: schedule.status,
            },
          );
          return;
        }
        const idempotencyKey = makeIdempotencyKey({
          kind: IdempotencyKind.enum["subscription.schedule.release"],
          fields: { scheduleId: schedule.id },
          opId,
        });
        logger.info("stripeBillingService.subscription.schedule.release", {
          scheduleId: schedule.id,
          status: schedule.status,
          idempotencyKey,
          opId,
          userId: this.ctx.session.user?.id,
          userEmail: this.ctx.session.user?.email,
        });
        await client.subscriptionSchedules.release(
          schedule.id,
          {},
          {
            idempotencyKey: makeIdempotencyKey({
              kind: IdempotencyKind.enum["subscription.schedule.release"],
              fields: { scheduleId: schedule.id },
              opId,
            }),
          },
        );
      },
    );
  }

  // ================================================
  // === Public methods ===
  // ================================================

  // Returned shape for getSubscriptionInfo

  /**
   * Fetch live subscription info from Stripe for cancellation and upcoming plan changes.
   * Does not persist anything to the database.
   */
  async getSubscriptionInfo(orgId: string): Promise<BillingSubscriptionInfo> {
    return await instrumentAsync(
      { name: "stripe.subscription.getInfo", spanKind: SpanKind.CLIENT },
      async (span) => {
        const client = this.stripe;

        const { org, parsedOrg } = await this.getParsedOrg(orgId);

        span.setAttributes({
          "langfuse.org.id": parsedOrg.id,
          "stripe.operation": "get_subscription_info",
        });

        const subscriptionId =
          parsedOrg.cloudConfig?.stripe?.activeSubscriptionId;

        if (!subscriptionId) {
          // No active subscription (Hobby plan) → calculate billing period from cached data
          const now = new Date();
          const billingCycleStart = getBillingCycleStart(org, now);
          const billingCycleEnd = getBillingCycleEnd(org, now);

          return {
            cancellation: null,
            scheduledChange: null,
            billingPeriod: {
              start: billingCycleStart,
              end: billingCycleEnd,
            },
            hasValidPaymentMethod: false,
          };
        }

        const subscription =
          await this.retrieveSubscriptionWithScheduleAndDiscounts(
            client,
            subscriptionId,
          );

        // Cancellation info (supports classic and flexible billing)
        const nowSec = Math.floor(Date.now() / 1000);

        let cancellation: { cancelAt: number } | null = null;

        if (
          typeof subscription.cancel_at === "number" &&
          subscription.cancel_at > nowSec
        ) {
          cancellation = {
            cancelAt: subscription.cancel_at,
          };
        } else if (subscription.cancel_at_period_end === true) {
          const end = subscription.items.data[0].current_period_end;
          if (typeof end === "number" && end > nowSec) {
            cancellation = {
              cancelAt: end,
            };
          }
        }

        // Current billing period (based on first subscription item)
        const firstItem = subscription.items?.data?.[0];
        const billingPeriod =
          firstItem &&
          typeof firstItem.current_period_start === "number" &&
          typeof firstItem.current_period_end === "number"
            ? {
                start: new Date(firstItem.current_period_start * 1000),
                end: new Date(firstItem.current_period_end * 1000),
              }
            : null;

        // Next scheduled change from subscription schedule phases
        let scheduledChange: {
          scheduleId: string;
          switchAt: number;
          newProductId?: string;
          message?: string | null;
        } | null = null;

        const schedule = subscription.schedule;
        if (schedule && ["active", "not_started"].includes(schedule.status)) {
          // Retrieve schedule with expanded prices to identify non-metered plan item
          const fullSchedule = await client.subscriptionSchedules.retrieve(
            schedule.id,
            { expand: ["phases.items.price"] },
          );

          const phases = fullSchedule.phases ?? [];
          const nextPhase = phases.find((p) => (p.start_date ?? 0) > nowSec);

          if (nextPhase) {
            // identify the plan (non-metered) item to expose the product id
            const nonMeteredItem = (nextPhase.items ?? []).find((it) => {
              if (!isExpanded(it.price)) {
                logger.warn(
                  "StripeBillingService.getSubscriptionInfo:stripe.subscription.schedule.nextPhase.item.price.notExpanded",
                  {
                    userId: this.ctx.session.user?.id,
                    userEmail: this.ctx.session.user?.email,
                    customerId: parsedOrg.cloudConfig?.stripe?.customerId,
                    subscriptionId:
                      parsedOrg.cloudConfig?.stripe?.activeSubscriptionId,
                    orgId: parsedOrg.id,
                    scheduleId: fullSchedule.id,
                    priceId: it.price,
                  },
                );
                return false;
              }

              if (it.price?.deleted) {
                logger.warn(
                  "StripeBillingService.getSubscriptionInfo:stripe.subscription.schedule.nextPhase.item.price.deleted",
                  {
                    userId: this.ctx.session.user?.id,
                    userEmail: this.ctx.session.user?.email,
                    customerId: parsedOrg.cloudConfig?.stripe?.customerId,
                    subscriptionId:
                      parsedOrg.cloudConfig?.stripe?.activeSubscriptionId,
                    orgId: parsedOrg.id,
                    scheduleId: fullSchedule.id,
                    priceId: it.price,
                  },
                );
                return false;
              }

              return !this.isMetered(it.price);
            });

            let newProductId: string | undefined = undefined;
            if (nonMeteredItem) {
              const price = nonMeteredItem.price as Stripe.Price | undefined;
              if (price?.product) {
                newProductId =
                  typeof price.product === "string"
                    ? price.product
                    : price.product.id;
              }
            }

            scheduledChange = {
              scheduleId: fullSchedule.id,
              switchAt: nextPhase.start_date as number,
              newProductId,
              message: fullSchedule.metadata?.message ?? null, // shows up in the users UI
            };
          }
        }

        // Active discounts / promotion codes
        const discounts = subscription.discounts
          .map((discount) => {
            if (!isExpandedOrNullable(discount)) {
              return null;
            }

            const coupon = discount.coupon;
            const promotion_code = discount.promotion_code;

            if (!isExpandedOrNullable(coupon)) {
              return null;
            }

            if (!isExpandedOrNullable(promotion_code)) {
              return null;
            }

            const amountOff = coupon?.amount_off;
            const percentOff = coupon?.percent_off;
            const kind: "percent" | "amount" =
              percentOff !== null ? "percent" : "amount";

            const value =
              kind === "percent" ? (percentOff ?? 0) : (amountOff ?? 0);

            return {
              id: discount.id,
              code: promotion_code?.code ?? null,
              name: coupon?.name,
              kind,
              value,
              currency: coupon?.currency,
              duration: coupon?.duration,
              durationInMonths: coupon?.duration_in_months,
            };
          })
          .filter((d) => d !== null);

        // Check if customer has a valid payment method
        let hasValidPaymentMethod = false;
        try {
          const customerId =
            typeof subscription.customer === "string"
              ? subscription.customer
              : subscription.customer.id;

          const paymentMethods = await client.customers.listPaymentMethods(
            customerId,
            { limit: 1 },
          );

          hasValidPaymentMethod = paymentMethods.data.length > 0;
        } catch (error) {
          logger.error(
            "StripeBillingService.getSubscriptionInfo:failed to check payment method",
            {
              userId: this.ctx.session.user?.id,
              userEmail: this.ctx.session.user?.email,
              customerId:
                typeof subscription.customer === "string"
                  ? subscription.customer
                  : subscription.customer.id,
              subscriptionId:
                parsedOrg.cloudConfig?.stripe?.activeSubscriptionId,
              orgId: parsedOrg.id,
              error,
            },
          );
          traceException(error);
          // Default to false if there's an error checking
          hasValidPaymentMethod = false;
        }

        return {
          cancellation,
          scheduledChange,
          billingPeriod,
          discounts,
          hasValidPaymentMethod,
        };
      },
    );
  }

  /**
   * Get a Stripe Billing Portal session URL for an organization.
   *
   * Throws when the organization lacks a Stripe customer or active subscription.
   *
   * @param orgId Organization id
   * @returns Hosted portal URL (string)
   */
  async getCustomerPortalUrl(orgId: string) {
    return await instrumentAsync(
      { name: "stripe.billingPortal.create", spanKind: SpanKind.CLIENT },
      async (span) => {
        const client = this.stripe;

        const { parsedOrg } = await this.getParsedOrg(orgId);
        const stripeCustomerId = parsedOrg.cloudConfig?.stripe?.customerId;
        const stripeSubscriptionId =
          parsedOrg.cloudConfig?.stripe?.activeSubscriptionId;

        if (!stripeCustomerId || !stripeSubscriptionId) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "No stripe customer or subscription found",
          });
        }

        span.setAttributes({
          "stripe.customer_id": stripeCustomerId,
          "stripe.subscription_id": stripeSubscriptionId,
          "langfuse.org.id": parsedOrg.id,
          "langfuse.user.id": this.ctx.session.user.id,
        });

        try {
          const billingPortalSession =
            await client.billingPortal.sessions.create({
              customer: stripeCustomerId,
              return_url: `${env.NEXTAUTH_URL}/organization/${orgId}/settings/billing`,
            });

          return billingPortalSession.url;
        } catch (error: any) {
          logger.error("stripeBillingService.billingPortal.create:failed", {
            customerId: stripeCustomerId,
            subscriptionId: stripeSubscriptionId,
            orgId: parsedOrg.id,
            userId: this.ctx.session.user.id,
            error,
            stripeRequestId: error?.requestId,
            stripeErrorType: error?.type,
            stripeErrorCode: error?.code,
          });
          traceException(error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to create billing portal session: ${error?.message || "Unknown error"}`,
            cause: error,
          });
        }
      },
    );
  }

  /**
   * Create a Stripe Checkout session to start a subscription for the given product.
   * Validates product against the catalogue and handles legacy vs new plan setup.
   *
   * @param orgId Organization id
   * @param stripeProductId Stripe Product id for the subscription plan
   * @returns Redirect URL to Stripe Checkout
   */
  async createCheckoutSession(orgId: string, stripeProductId: string) {
    return await instrumentAsync(
      { name: "stripe.checkout.create", spanKind: SpanKind.CLIENT },
      async (span) => {
        const client = this.stripe;

        const { parsedOrg } = await this.getParsedOrg(orgId);

        if (parsedOrg.cloudConfig?.plan) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              "Cannot initialize stripe checkout for orgs that have a manual plan override",
          });
        }

        if (!StripeCatalogue.isValidCheckoutProduct(stripeProductId)) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Invalid stripe product id",
          });
        }

        span.setAttributes({
          "stripe.product_id": stripeProductId,
          "langfuse.org.id": parsedOrg.id,
          "langfuse.user.id": this.ctx.session.user.id,
          "stripe.operation": "checkout_create",
        });

        const product = await this.retrieveProductWithDefaultPrice(
          client,
          stripeProductId,
        );

        // TODO: Cleanup after all customers are migrated to the new system
        const lineItems = await (async () => {
          const isLegacyProduct = this.isMetered(product.default_price);

          if (isLegacyProduct) {
            return [{ price: product.default_price.id }];
          }

          const usageProduct = await this.retrieveProductWithDefaultPrice(
            client,
            StripeCatalogue.usageProductId(),
          );

          return [
            { price: product.default_price.id, quantity: 1 },
            { price: usageProduct.default_price.id },
          ];
        })();

        const returnUrl = `${env.NEXTAUTH_URL}/organization/${orgId}/settings/billing`;
        const stripeCustomerId =
          parsedOrg.cloudConfig?.stripe?.customerId ?? undefined;
        const clientReferenceId = createStripeClientReference(orgId);
        const subscriptionMetadata: StripeSubscriptionMetadata = {
          orgId: orgId,
          cloudRegion: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
        };

        const sessionConfig: Stripe.Checkout.SessionCreateParams = {
          customer: stripeCustomerId ?? undefined,
          line_items: lineItems,
          client_reference_id: clientReferenceId,
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
          payment_method_collection: "if_required",
          billing_address_collection: "required",
          success_url: returnUrl,
          cancel_url: returnUrl,
          mode: "subscription",
          subscription_data: {
            // Note: metadata should always be treated as optional since
            // we cannot rely on it being set (e.g., manual subscription creation in stripe)
            metadata: subscriptionMetadata,
            billing_mode: {
              type: "flexible",
            },
          },
        };

        logger.info("stripeBillingService.checkout.session.create", {
          customerId: stripeCustomerId,
          productId: stripeProductId,
          userId: this.ctx.session.user.id,
          userEmail: this.ctx.session.user.email,
        });

        try {
          const session = await client.checkout.sessions.create(sessionConfig);

          if (!session.url) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to create checkout session",
            });
          }

          void auditLog({
            session: this.ctx.session,
            orgId: parsedOrg.id,
            resourceType: "organization",
            resourceId: parsedOrg.id,
            action: "BillingService.createCheckoutSession",
            before: parsedOrg.cloudConfig,
          });

          return session.url;
        } catch (error: any) {
          logger.error("stripeBillingService.checkout.session.create:failed", {
            customerId: stripeCustomerId,
            productId: stripeProductId,
            orgId: parsedOrg.id,
            userId: this.ctx.session.user.id,
            error,
            stripeRequestId: error?.requestId,
            stripeErrorType: error?.type,
            stripeErrorCode: error?.code,
          });
          traceException(error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to create checkout session: ${error?.message || "Unknown error"}`,
            cause: error,
          });
        }
      },
    );
  }

  /**
   * Change an organization's active subscription to a new product.
   *
   * Behavior:
   * - Upgrades: immediate price swap with proration invoiced now
   * - Downgrades: create a subscription schedule to switch at period end
   * - Legacy: replace single metered item with plan+usage or vice versa
   *
   * @param orgId Organization id
   * @param newProductId Stripe Product id to switch to
   */
  async changePlan(orgId: string, newProductId: string, opId?: string) {
    return await instrumentAsync(
      { name: "stripe.subscription.changePlan", spanKind: SpanKind.CLIENT },
      async (span) => {
        const client = this.stripe;

        const { parsedOrg } = await this.getParsedOrg(orgId);

        if (parsedOrg.cloudConfig?.plan)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              "Cannot change plan for orgs that have a manually set plan",
          });

        const stripeSubscriptionId =
          parsedOrg.cloudConfig?.stripe?.activeSubscriptionId;

        if (!stripeSubscriptionId)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Organization does not have an active subscription",
          });

        span.setAttributes({
          "stripe.subscription_id": stripeSubscriptionId,
          "stripe.new_product_id": newProductId,
          "langfuse.org.id": parsedOrg.id,
          "langfuse.user.id": this.ctx.session.user.id,
          "stripe.operation": "change_plan",
        });

        const subscription =
          await this.retrieveSubscriptionWithScheduleAndDiscounts(
            client,
            stripeSubscriptionId,
          );

        if (
          ["canceled", "paused", "incomplete", "incomplete_expired"].includes(
            subscription.status,
          )
        ) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              "Subscription is not active, current status: " +
              subscription.status,
          });
        }

        if (!StripeCatalogue.isValidCheckoutProduct(newProductId)) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Invalid stripe product id for new product",
          });
        }

        const newProduct = await this.retrieveProductWithDefaultPrice(
          client,
          newProductId,
        );

        // If the users changes the plan, we want to cancel any pending cancellations
        const cancellationPayload = subscription.cancel_at
          ? { cancel_at: null }
          : { cancel_at_period_end: false };

        // [A] Legacy Plan Setup: Switch from / to legacy plans
        // ------------------------------------------------------------------------------------------------
        // TODO: Cleanup after all customers are migrated to the new system
        const isNewProductLegacy =
          newProduct.default_price.recurring?.usage_type === "metered";
        const isExistingSubscriptionLegacy =
          parsedOrg.cloudConfig?.stripe?.isLegacySubscription === true;

        if (isExistingSubscriptionLegacy || isNewProductLegacy) {
          const usageProduct = await this.retrieveProductWithDefaultPrice(
            client,
            StripeCatalogue.usageProductId(),
          );

          const newLineItems = isNewProductLegacy
            ? [{ price: newProduct.default_price.id }]
            : [
                { price: newProduct.default_price.id, quantity: 1 },
                { price: usageProduct.default_price.id },
              ];

          await this.releaseExistingSubscriptionScheduleIfAny(
            subscription,
            opId,
          );
          const legacyUpdateKey = makeIdempotencyKey({
            kind: IdempotencyKind.enum["subscription.update.product"],
            fields: {
              subscriptionId: stripeSubscriptionId,
              to: newProduct.default_price.id,
            },
            opId,
          });
          logger.info("stripeBillingService.subscription.update.product", {
            subscriptionId: stripeSubscriptionId,
            fromProductId: subscription.items.data[0]?.price.product,
            toProductId: newProduct.default_price.id,
            isLegacy: true,
            idempotencyKey: legacyUpdateKey,
            opId,
            userId: this.ctx.session.user?.id,
            userEmail: this.ctx.session.user.email,
          });
          await client.subscriptions.update(
            stripeSubscriptionId,
            {
              items: [
                ...subscription.items.data.map((i) => ({
                  id: i.id,
                  deleted: true,
                })),
                ...newLineItems,
              ],
              billing_cycle_anchor: "now",
              proration_behavior: "none",
              ...cancellationPayload,
            },
            { idempotencyKey: legacyUpdateKey },
          );

          void auditLog({
            session: this.ctx.session,
            orgId: parsedOrg.id,
            resourceType: "organization",
            resourceId: parsedOrg.id,
            action: "BillingService.changePlan",
            before: parsedOrg.cloudConfig,
            after: "webhook",
          });
          return;
        }
        // [A] End ----------------------------------------------------------------------------------------

        // Helper to migrate all users who are still on classic over to flexible billing
        if (subscription.billing_mode?.type === "classic") {
          const migrateKey = makeIdempotencyKey({
            kind: IdempotencyKind.enum["subscription.migrate.flexible"],
            fields: { subscriptionId: stripeSubscriptionId },
            opId,
          });
          logger.info("stripeBillingService.subscription.migrate.flexible", {
            customerId: subscription.customer,
            subscriptionId: stripeSubscriptionId,
            idempotencyKey: migrateKey,
            orgId: parsedOrg.id,
            opId,
            userId: this.ctx.session.user.id,
            userEmail: this.ctx.session.user.email,
          });
          await client.subscriptions.migrate(
            stripeSubscriptionId,
            { billing_mode: { type: "flexible" } },
            { idempotencyKey: migrateKey },
          );
        }

        // [B] New Plan Setup: Switch between new plans
        // ------------------------------------------------------------------------------------------------
        const subscriptionProductItem = subscription.items.data.find(
          (i) => i.price.recurring?.usage_type !== "metered",
        );
        if (!subscriptionProductItem)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Current subscription does not contain a plan item",
          });

        const currentSubscriptionProductId =
          typeof subscriptionProductItem.price.product === "string"
            ? subscriptionProductItem.price.product
            : subscriptionProductItem.price.product.id;

        if (
          !StripeCatalogue.isValidCheckoutProduct(currentSubscriptionProductId)
        ) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              "Invalid stripe product id for existing subscription product",
          });
        }

        const upgrading = StripeCatalogue.isUpgrade(
          currentSubscriptionProductId,
          newProductId,
        );

        // [B.1] Upgrade Path: Switch from lower to higher plan (-> Prorated immediate switch)
        // -----------------------------------------------------
        if (upgrading) {
          await this.releaseExistingSubscriptionScheduleIfAny(
            subscription,
            opId,
          );

          const upgradeKey = makeIdempotencyKey({
            kind: IdempotencyKind.enum["subscription.update.product"],
            fields: {
              subscriptionId: stripeSubscriptionId,
              to: newProduct.default_price.id,
            },
            opId,
          });
          logger.info("stripeBillingService.subscription.update.product", {
            customerId: subscription.customer,
            subscriptionId: stripeSubscriptionId,
            fromProductId: currentSubscriptionProductId,
            toProductId: newProductId,
            orgId: parsedOrg.id,
            isUpgrade: true,
            idempotencyKey: upgradeKey,
            opId,
            userId: this.ctx.session.user.id,
            userEmail: this.ctx.session.user.email,
          });
          await client.subscriptions.update(
            stripeSubscriptionId,
            {
              items: [
                {
                  id: subscriptionProductItem.id, // the old item to replace
                  price: newProduct.default_price.id, // price identifies the product
                  quantity: 1,
                },
                // usage items stays the same
              ],
              proration_behavior: "always_invoice",
              ...cancellationPayload,
            },
            { idempotencyKey: upgradeKey },
          );

          void auditLog({
            session: this.ctx.session,
            orgId: parsedOrg.id,
            resourceType: "organization",
            resourceId: parsedOrg.id,
            action: "BillingService.changePlan",
            before: parsedOrg.cloudConfig,
            after: "webhook",
          });

          return;
        }

        // [B.2] Downgrade Path: Switch from higher to lower plan (-> Subscription Schedule)
        // -----------------------------------------------------
        const currentPeriodEndSec = subscriptionProductItem.current_period_end;

        const nextPhaseItems = subscription.items.data.map((i) => {
          const isMetered = this.isMetered(i.price);

          // replace the subscription product item with the new product
          if (i.id === subscriptionProductItem.id) {
            return { price: newProduct.default_price.id, quantity: 1 };
          }

          // keep the existing items
          return {
            price: i.price.id,
            ...(isMetered ? {} : { quantity: i.quantity ?? 1 }),
          };
        });

        await this.releaseExistingSubscriptionScheduleIfAny(subscription, opId);

        const createScheduleKey = makeIdempotencyKey({
          kind: IdempotencyKind.enum["subscription.schedule.create.fromSub"],
          fields: { subscriptionId: stripeSubscriptionId },
          opId,
        });
        logger.info(
          "stripeBillingService.subscription.schedule.create.fromSub",
          {
            subscriptionId: stripeSubscriptionId,
            idempotencyKey: createScheduleKey,
            opId,
            userId: this.ctx.session.user.id,
            userEmail: this.ctx.session.user.email,
          },
        );
        const initialSchedule = await client.subscriptionSchedules.create(
          {
            from_subscription: stripeSubscriptionId,
          },
          { idempotencyKey: createScheduleKey },
        ); // not possible to set any items here, if we use from_subscription

        const existingDiscounts = initialSchedule.phases[0]?.discounts || [];
        const newDiscounts = existingDiscounts.map((discount) => {
          if (discount.coupon) {
            return {
              coupon:
                typeof discount.coupon === "string"
                  ? discount.coupon
                  : discount.coupon.id,
            };
          } else if (discount.promotion_code) {
            return {
              promotion_code:
                typeof discount.promotion_code === "string"
                  ? discount.promotion_code
                  : discount.promotion_code.id,
            };
          } else if (discount.discount) {
            return {
              discount:
                typeof discount.discount === "string"
                  ? discount.discount
                  : discount.discount.id,
            };
          }
          return {};
        });

        const updateScheduleKey = makeIdempotencyKey({
          kind: IdempotencyKind.enum["subscription.schedule.update"],
          fields: { scheduleId: initialSchedule.id },
          opId,
        });
        logger.info("stripeBillingService.subscription.schedule.update", {
          scheduleId: initialSchedule.id,
          customerId: subscription.customer,
          orgId: parsedOrg.id,
          subscriptionId: stripeSubscriptionId,
          fromProductId: currentSubscriptionProductId,
          toProductId: newProductId,
          switchAt: currentPeriodEndSec,
          idempotencyKey: updateScheduleKey,
          opId,
          userId: this.ctx.session.user.id,
          userEmail: this.ctx.session.user.email,
        });
        await client.subscriptionSchedules.update(
          initialSchedule.id,
          {
            end_behavior: "release",
            phases: [
              {
                start_date: initialSchedule.phases[0].start_date,
                end_date: currentPeriodEndSec,
                items: initialSchedule.phases[0]!.items as any,
                proration_behavior: "none",
              },
              {
                start_date: currentPeriodEndSec,
                end_date: currentPeriodEndSec + 120, // trigger the schedule release 120 seconds after it was applied
                items: nextPhaseItems,
                proration_behavior: "none",
                discounts: newDiscounts,
              },
            ],
            // TODO: Cleanup – discontinue metadata for functional purposes
            metadata: {
              subscriptionId: stripeSubscriptionId,
              reason: "planSwitch.Downgrade",
              newProductId,
              usageProductId: StripeCatalogue.usageProductId(),
              switchAt: currentPeriodEndSec,
              orgId,
            },
          },
          { idempotencyKey: updateScheduleKey },
        );

        void auditLog({
          session: this.ctx.session,
          orgId: parsedOrg.id,
          resourceType: "organization",
          resourceId: parsedOrg.id,
          action: "BillingService.changePlan",
          before: parsedOrg.cloudConfig,
          after: "webhook",
        });

        return;
        // [B] End ----------------------------------------------------------------------------------------
      },
    );
  }

  /**
   * Cancel the active subscription at period end. Releases any pending schedules first.
   *
   * @param orgId Organization id
   */
  async cancel(orgId: string, opId?: string) {
    return await instrumentAsync(
      { name: "stripe.subscription.cancel", spanKind: SpanKind.CLIENT },
      async (span) => {
        const client = this.stripe;

        const { parsedOrg } = await this.getParsedOrg(orgId);

        const subscriptionId =
          parsedOrg.cloudConfig?.stripe?.activeSubscriptionId;
        if (!subscriptionId)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "No active subscription to cancel",
          });

        // Set span attributes for context
        span.setAttributes({
          "stripe.subscription_id": subscriptionId,
          "langfuse.org.id": parsedOrg.id,
          "stripe.operation": "cancel_at_period_end",
          "langfuse.user.id": this.ctx.session.user.id,
        });

        const subscription =
          await this.retrieveSubscriptionWithScheduleAndDiscounts(
            client,
            subscriptionId,
          );

        // If the user cancels the subscription, we want to release the existing schedule
        await this.releaseExistingSubscriptionScheduleIfAny(subscription, opId);

        const cancelKey = makeIdempotencyKey({
          kind: IdempotencyKind.enum["subscription.cancelAtPeriodEnd"],
          fields: { subscriptionId },
          opId,
        });
        logger.info("stripeBillingService.subscription.cancelAtPeriodEnd", {
          subscriptionId,
          idempotencyKey: cancelKey,
          opId,
          userId: this.ctx.session.user.id,
          userEmail: this.ctx.session.user.email,
        });

        try {
          await client.subscriptions.update(
            subscriptionId,
            {
              cancel_at_period_end: true,
              proration_behavior: "none",
            },
            { idempotencyKey: cancelKey },
          );
        } catch (error: any) {
          logger.error(
            "stripeBillingService.subscription.cancelAtPeriodEnd:failed",
            {
              subscriptionId,
              orgId: parsedOrg.id,
              userId: this.ctx.session.user.id,
              userEmail: this.ctx.session.user.email,
              idempotencyKey: cancelKey,
              error,
              stripeRequestId: error?.requestId,
              stripeErrorType: error?.type,
              stripeErrorCode: error?.code,
            },
          );
          traceException(error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to cancel subscription: ${error?.message || "Unknown error"}`,
            cause: error,
          });
        }

        void auditLog({
          session: this.ctx.session,
          orgId: parsedOrg.id,
          resourceType: "organization",
          resourceId: parsedOrg.id,
          action: "BillingService.cancel",
          before: parsedOrg.cloudConfig,
          after: "webhook",
        });

        return {
          status: "success",
        };
      },
    );
  }

  /**
   * Reactivate a subscription by clearing cancellation flags and releasing pre-existing schedules.
   *
   * @param orgId Organization id
   */
  async reactivate(orgId: string, opId?: string) {
    return await instrumentAsync(
      { name: "stripe.subscription.reactivate", spanKind: SpanKind.CLIENT },
      async (span) => {
        const client = this.stripe;

        const { parsedOrg } = await this.getParsedOrg(orgId);

        const subscriptionId =
          parsedOrg.cloudConfig?.stripe?.activeSubscriptionId;
        if (!subscriptionId)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "No active subscription to reactivate",
          });

        span.setAttributes({
          "stripe.subscription_id": subscriptionId,
          "langfuse.org.id": parsedOrg.id,
          "langfuse.user.id": this.ctx.session.user.id,
          "stripe.operation": "reactivate",
        });

        const subscription =
          await this.retrieveSubscriptionWithScheduleAndDiscounts(
            client,
            subscriptionId,
          );

        // If the user reactivates the subscription, we want to remove the cancellation
        const cancellationPayload = subscription.cancel_at
          ? { cancel_at: null }
          : { cancel_at_period_end: false };

        // If the user has any pending schedule, we want to release it
        await this.releaseExistingSubscriptionScheduleIfAny(subscription, opId);

        const reactivateKey = makeIdempotencyKey({
          kind: IdempotencyKind.enum["subscription.reactivate"],
          fields: { subscriptionId },
          opId,
        });
        logger.info("stripeBillingService.subscription.reactivate", {
          subscriptionId,
          idempotencyKey: reactivateKey,
          opId,
          userId: this.ctx.session.user.id,
          userEmail: this.ctx.session.user.email,
        });

        try {
          await client.subscriptions.update(
            subscriptionId,
            {
              ...cancellationPayload,
            },
            { idempotencyKey: reactivateKey },
          );
        } catch (error: any) {
          logger.error("stripeBillingService.subscription.reactivate:failed", {
            subscriptionId,
            orgId: parsedOrg.id,
            userId: this.ctx.session.user.id,
            idempotencyKey: reactivateKey,
            error,
            stripeRequestId: error?.requestId,
            stripeErrorType: error?.type,
            stripeErrorCode: error?.code,
          });
          traceException(error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to reactivate subscription: ${error?.message || "Unknown error"}`,
            cause: error,
          });
        }

        void auditLog({
          session: this.ctx.session,
          orgId: parsedOrg.id,
          resourceType: "organization",
          resourceId: parsedOrg.id,
          action: "BillingService.reactivate",
          before: parsedOrg.cloudConfig,
          after: "webhook",
        });

        return {
          status: "success",
        };
      },
    );
  }

  /**
   * Cancel the active subscription immediately and generate a final invoice.
   * - Releases any active/not-started schedules first
   * - Invoices outstanding usage now
   * - No proration is applied
   *
   * Designed for destructive flows (e.g., org deletion). If no active
   * subscription exists, this method is a no-op and returns success.
   */
  async cancelImmediatelyAndInvoice(orgId: string, opId?: string) {
    return await instrumentAsync(
      {
        name: "stripe.subscription.cancelImmediately",
        spanKind: SpanKind.CLIENT,
      },
      async (span) => {
        const client = this.stripe;

        const { parsedOrg } = await this.getParsedOrg(orgId);

        const subscriptionId =
          parsedOrg.cloudConfig?.stripe?.activeSubscriptionId;
        if (!subscriptionId) {
          logger.info(
            "stripeBillingService.subscription.cancel.now:noop.noActiveSubscription",
            {
              orgId,
            },
          );
          return { status: "noop" as const };
        }

        span.setAttributes({
          "stripe.subscription_id": subscriptionId,
          "langfuse.org.id": parsedOrg.id,
          "langfuse.user.id": this.ctx.session.user?.id ?? "system",
          "stripe.operation": "cancel_immediately",
        });

        const subscription =
          await this.retrieveSubscriptionWithScheduleAndDiscounts(
            client,
            subscriptionId,
          );

        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer.id;
        span.setAttribute("stripe.customer_id", customerId);

        // Release any pending schedule before immediate cancel
        await this.releaseExistingSubscriptionScheduleIfAny(subscription, opId);

        const cancelNowKey = makeIdempotencyKey({
          kind: IdempotencyKind.enum["subscription.cancel.now"],
          fields: { subscriptionId },
          opId,
        });

        logger.info("stripeBillingService.subscription.cancel.now", {
          subscriptionId,
          customerId: subscription.customer,
          orgId,
          idempotencyKey: cancelNowKey,
          opId,
          userId: this.ctx.session.user?.id,
          userEmail: this.ctx.session.user?.email,
        });

        try {
          await client.subscriptions.cancel(
            subscriptionId,
            {
              invoice_now: true,
              prorate: false,
            } as any,
            { idempotencyKey: cancelNowKey },
          );
        } catch (error: any) {
          logger.error("stripeBillingService.subscription.cancel.now:failed", {
            subscriptionId,
            customerId,
            orgId: parsedOrg.id,
            userId: this.ctx.session.user?.id,
            idempotencyKey: cancelNowKey,
            error,
            stripeRequestId: error?.requestId,
            stripeErrorType: error?.type,
            stripeErrorCode: error?.code,
          });
          traceException(error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to cancel subscription immediately: ${error?.message || "Unknown error"}`,
            cause: error,
          });
        }

        void auditLog({
          session: this.ctx.session,
          orgId: parsedOrg.id,
          resourceType: "organization",
          resourceId: parsedOrg.id,
          action: "BillingService.cancelImmediatelyAndInvoice",
          before: parsedOrg.cloudConfig,
          after: "webhook",
        });

        return { status: "success" as const };
      },
    );
  }

  /**
   * Clear any active or not-started subscription schedule for the org's subscription.
   *
   * @param orgId Organization id
   */
  async clearPlanSwitchSchedule(orgId: string, opId?: string) {
    return await instrumentAsync(
      { name: "stripe.subscription.clearSchedule", spanKind: SpanKind.CLIENT },
      async (span) => {
        const client = this.stripe;

        const { parsedOrg } = await this.getParsedOrg(orgId);

        const subscriptionId =
          parsedOrg.cloudConfig?.stripe?.activeSubscriptionId;
        if (!subscriptionId)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "No active subscription found",
          });

        span.setAttributes({
          "stripe.subscription_id": subscriptionId,
          "langfuse.org.id": parsedOrg.id,
          "langfuse.user.id": this.ctx.session.user.id,
          "stripe.operation": "clear_schedule",
        });

        const subscription =
          await this.retrieveSubscriptionWithScheduleAndDiscounts(
            client,
            subscriptionId,
          );

        await this.releaseExistingSubscriptionScheduleIfAny(subscription, opId);

        void auditLog({
          session: this.ctx.session,
          orgId: parsedOrg.id,
          resourceType: "organization",
          resourceId: parsedOrg.id,
          action: "BillingService.clearPlanSwitchSchedule",
          before: parsedOrg.cloudConfig,
          after: "webhook",
        });

        return {
          status: "success",
        };
      },
    );
  }

  /**
   * List invoices for an organization and return rows enriched with a usage/subscription breakdown.
   * Includes a preview row for the upcoming invoice as the first entry when no cursors are provided.
   *
   * @param orgId Organization id
   * @param pagination limit + optional Stripe cursors
   */
  async getInvoices(
    orgId: string,
    pagination: {
      limit: number;
      startingAfter?: string;
      endingBefore?: string;
    },
  ) {
    return await instrumentAsync(
      { name: "stripe.invoices.list", spanKind: SpanKind.CLIENT },
      async (span) => {
        const client = this.stripe;

        const { parsedOrg } = await this.getParsedOrg(orgId);

        const stripeCustomerId = parsedOrg.cloudConfig?.stripe?.customerId;
        const stripeSubscriptionId =
          parsedOrg.cloudConfig?.stripe?.activeSubscriptionId;
        if (!stripeCustomerId) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "No stripe customer or subscription found",
          });
        }

        span.setAttributes({
          "stripe.customer_id": stripeCustomerId,
          "langfuse.org.id": parsedOrg.id,
          "stripe.operation": "list_invoices",
          "pagination.limit": pagination.limit,
        });

        // retrieve all invoices for the customer (also past subscriptions when cancelled)
        const list = await this.retrieveInvoiceList(
          stripeCustomerId,
          pagination.limit,
          pagination.startingAfter,
          pagination.endingBefore,
        );

        const preview = stripeSubscriptionId
          ? await this.createInvoicePreview(
              client,
              stripeCustomerId,
              stripeSubscriptionId,
            )
          : null;

        const priceCache = new Map<string, Stripe.Price>();

        // Anonymous function to get the price from Stripe or the emepheral cache here.
        // In practice a customer will have at least two prices, and maybe a few more.
        const getPrice = async (priceId: string): Promise<Stripe.Price> => {
          const cached = priceCache.get(priceId);
          if (cached) {
            return cached;
          }

          const p = await client.prices.retrieve(priceId, {
            expand: ["tiers"],
          });

          priceCache.set(priceId, p);

          return p;
        };

        type InvoiceTableRow = {
          id: string | null | undefined;
          number: string | null | undefined;
          status: string | null | undefined;
          currency: string;
          created: number;
          hostedInvoiceUrl: string | null | undefined;
          invoicePdfUrl: string | null | undefined;
          breakdown: {
            subscriptionCents: number;
            usageCents: number;
            discountCents: number;
            taxCents: number;
            totalCents: number;
          };
        };

        // Anonymous function to map the invoice to a row
        const mapInvoiceToTableRow = async (
          invoice: Stripe.Invoice,
        ): Promise<InvoiceTableRow> => {
          const lines = invoice.lines?.data ?? [];

          let subscriptionCents = 0;
          let usageCents = 0;

          for (const l of lines) {
            const amount = typeof l.amount === "number" ? l.amount : 0;

            const priceId = l.pricing?.price_details?.price;

            if (!priceId) {
              logger.error("Failed to get price for line item", { line: l });
              continue;
            }

            const price = await getPrice(priceId);

            const isMetered = this.isMetered(price);
            if (isMetered) {
              // For legacy prices, figure out what items go into usage vs base-fee
              // [a] ------------------
              const unitPrice = l.pricing?.unit_amount_decimal;
              let lineUsageCents = 0;

              if (typeof unitPrice == "number") {
                lineUsageCents = (l.quantity ?? 0) * unitPrice;
              } else if (typeof unitPrice == "string") {
                const unitPriceFromString = Number(unitPrice);
                if (unitPriceFromString >= 0) {
                  // >=0 takes care of NaN
                  lineUsageCents = (l.quantity ?? 0) * unitPriceFromString;
                }
              }

              const flatFeeAmount = l.amount - lineUsageCents;
              const unitPriceAmount = lineUsageCents;
              // [a] end ------------------

              // Add flat amounts to subscription costs
              subscriptionCents += flatFeeAmount;
              // Add unit amounts to usage costs
              usageCents += unitPriceAmount;
            } else {
              subscriptionCents += amount;
            }
          }

          const discountCents = Array.isArray(
            (invoice as any).total_discount_amounts,
          )
            ? (invoice as any).total_discount_amounts.reduce(
                (acc: number, d: any) => acc + (d.amount ?? 0),
                0,
              )
            : 0;

          const taxCents = Array.isArray(invoice.total_taxes)
            ? invoice.total_taxes.reduce(
                (acc: number, t: any) => acc + (t.amount ?? 0),
                0,
              )
            : 0;
          const totalCents =
            (typeof invoice.total === "number"
              ? invoice.total
              : invoice.amount_due) ?? 0;

          return {
            id: invoice.id,
            number: invoice.number,
            status: invoice.status,
            currency: invoice.currency?.toUpperCase() ?? "USD",
            created: invoice.created * 1000,
            hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
            invoicePdfUrl: invoice.invoice_pdf ?? null,
            breakdown: {
              subscriptionCents,
              usageCents,
              discountCents: 0 - discountCents,
              taxCents,
              totalCents,
            },
          };
        };

        const previewRow = preview ? await mapInvoiceToTableRow(preview) : null;

        const invoices = await Promise.all(
          list.data.map((inv) => mapInvoiceToTableRow(inv)),
        );

        const isFirstPage =
          !pagination.startingAfter && !pagination.endingBefore;

        const showPreviewRow = isFirstPage && previewRow;

        if (showPreviewRow) {
          const shouldTruncate = invoices.length === pagination.limit;

          // remove the last item to account for the preview row
          const modifiedInvoiceRows = shouldTruncate
            ? [
                previewRow,
                ...invoices.slice(0, Math.max(0, pagination.limit - 1)),
              ]
            : [previewRow, ...invoices];

          return {
            invoices: modifiedInvoiceRows,
            hasMore: list.has_more || shouldTruncate, // if we truncated the list there is at least one more element to show
            cursors: {
              next:
                modifiedInvoiceRows.length > 1
                  ? modifiedInvoiceRows[modifiedInvoiceRows.length - 1]!.id
                  : undefined, // last real invoice id
              prev: invoices.length ? invoices[0]!.id : undefined, // first real invoice id
            },
          };
        }

        return {
          invoices: invoices,
          hasMore: list.has_more,
          cursors: {
            next:
              list.has_more && invoices.length
                ? invoices[invoices.length - 1]!.id
                : undefined,
            prev: invoices.length ? invoices[0]!.id : undefined,
          },
        };
      },
    );
  }

  /**
   * Compute usage for the current billing period.
   *
   * Primary source: Stripe invoice preview for the metered usage item.
   * Fallback: Clickhouse aggregate of traces/observations/scores for the last 30 days.
   *
   * @param orgId Organization id
   */
  async getUsage(orgId: string) {
    return await instrumentAsync(
      { name: "stripe.billing.getUsage", spanKind: SpanKind.CLIENT },
      async (span) => {
        const client = this.stripe;

        const { org, parsedOrg } = await this.getParsedOrgWithProjects(orgId);

        span.setAttributes({
          "langfuse.org.id": parsedOrg.id,
          "stripe.operation": "get_usage",
        });

        const stripeCustomerId = parsedOrg.cloudConfig?.stripe?.customerId;
        const stripeSubscriptionId =
          parsedOrg.cloudConfig?.stripe?.activeSubscriptionId;

        // [A] We have a user with an active subscription -> get usage from Stripe
        // ------------------------------------------------------------------------------------------------
        if (stripeCustomerId && stripeSubscriptionId) {
          span.setAttributes({
            "stripe.customer_id": stripeCustomerId,
            "stripe.subscription_id": stripeSubscriptionId,
          });

          try {
            const subscription =
              await this.retrieveSubscriptionWithScheduleAndDiscounts(
                client,
                stripeSubscriptionId,
              );

            const usageItem = subscription.items.data.find((item) =>
              this.isMetered(item.price),
            );

            if (!usageItem) {
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message:
                  "Metered Cloud Usage Product item not found in subscription",
              });
            }

            // 1. Get the total usage off the preview Invoice
            const previewInvoice = await this.createInvoicePreview(
              client,
              stripeCustomerId,
              stripeSubscriptionId,
            );

            if (!previewInvoice) {
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Preview invoice not found",
              });
            }

            const usageInvoiceLines = previewInvoice.lines.data.filter(
              (line: any) => {
                const isMeteredLineItem =
                  line.pricing?.price_details?.price === usageItem.price.id;
                return isMeteredLineItem;
              },
            );
            const totalUsage = usageInvoiceLines.reduce((acc, line) => {
              if (line.quantity) return acc + line.quantity;
              return acc;
            }, 0);

            // 2. Get the meter to show the correct billing label
            const meterId = usageItem.price.recurring?.meter;

            if (!meterId) {
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Meter ID not found for metered usage item",
              });
            }

            const meter = await client.billing.meters.retrieve(meterId);

            if (!meter) {
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Meter not found for metered usage item",
              });
            }

            // 3. Set the billing period
            const billingPeriod = {
              start: new Date(usageItem.current_period_start * 1000),
              end: new Date(usageItem.current_period_end * 1000),
            };

            return {
              usageCount: totalUsage,
              usageType: meter?.display_name.toLowerCase() ?? "units",
              billingPeriod,
            };
          } catch (e) {
            logger.error(
              "Failed to get usage from Stripe, using usage from Clickhouse",
              { error: e },
            );
            traceException(e);
          }
        }
        // [A] End ----------------------------------------------------------------------------------------
        // [B] We have no active subscription -> get usage from cached Organization data (likely hobby plan or fallback)
        // ------------------------------------------------------------------------------------------------

        // Use cached usage data populated by background job (runs every 60 minutes)
        const cachedUsage = org.cloudCurrentCycleUsage ?? 0;

        // Calculate billing period using the billing cycle anchor
        const now = new Date();
        const billingCycleStart = getBillingCycleStart(org, now);
        const billingCycleEnd = getBillingCycleEnd(org, now);

        return {
          usageCount: cachedUsage,
          usageType: "units",
          billingPeriod: {
            start: billingCycleStart,
            end: billingCycleEnd,
          },
        };
        // [B] End ----------------------------------------------------------------------------------------
      },
    );
  }

  /**
   * Apply a promotion code to the organization's active Stripe subscription.
   * Preserves existing discounts and adds the new promotion code if valid and not already applied.
   */
  async applyPromotionCode(orgId: string, code: string, opId?: string) {
    return await instrumentAsync(
      { name: "stripe.subscription.applyPromotion", spanKind: SpanKind.CLIENT },
      async (span) => {
        const client = this.stripe;

        const { parsedOrg } = await this.getParsedOrg(orgId);

        const subscriptionId =
          parsedOrg.cloudConfig?.stripe?.activeSubscriptionId;
        if (!subscriptionId)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Organization does not have an active subscription",
          });

        span.setAttributes({
          "stripe.subscription_id": subscriptionId,
          "langfuse.org.id": parsedOrg.id,
          "langfuse.user.id": this.ctx.session.user?.id ?? "system",
          "stripe.operation": "apply_promotion",
          "stripe.promotion_code": code,
        });

        // Validate the promotion code exists and is active
        const promoList = await client.promotionCodes.list({
          code,
          active: true,
          limit: 1,
        });

        const promo = promoList.data[0];
        if (!promo) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid or expired promotion code",
          });
        }

        const subscription =
          await this.retrieveSubscriptionWithScheduleAndDiscounts(
            client,
            subscriptionId,
          );

        // Avoid adding duplicate promotion codes
        const alreadyApplied = (subscription.discounts || []).some((d) => {
          if (!isExpandedOrNullable(d)) return false;
          const pc = d.promotion_code;
          if (!isExpandedOrNullable(pc) || pc === null) return false;
          // match by id or code
          return (
            (typeof pc === "string" && pc === promo.id) ||
            (typeof pc !== "string" && (pc.id === promo.id || pc.code === code))
          );
        });

        if (alreadyApplied) {
          return { ok: true as const };
        }

        // Preserve existing discounts similar to schedule update logic
        const existingDiscounts = (subscription.discounts || [])
          .map((discount) => {
            if (!isExpandedOrNullable(discount)) return undefined;

            const coupon = discount.coupon;
            const promotionCode = discount.promotion_code;

            if (isExpandedOrNullable(coupon) && coupon) {
              const couponId = typeof coupon === "string" ? coupon : coupon.id;
              return {
                coupon: couponId,
              } as Stripe.SubscriptionUpdateParams.Discount;
            }

            if (isExpandedOrNullable(promotionCode) && promotionCode) {
              const promoId =
                typeof promotionCode === "string"
                  ? promotionCode
                  : promotionCode.id;
              return {
                promotion_code: promoId,
              } as Stripe.SubscriptionUpdateParams.Discount;
            }

            return undefined;
          })
          .filter(
            (d): d is Stripe.SubscriptionUpdateParams.Discount =>
              d !== undefined,
          );

        const idempotencyKey = makeIdempotencyKey({
          kind: IdempotencyKind.enum["subscription.update.discounts.add"],
          fields: { subscriptionId, promotionCodeId: promo.id },
          opId,
        });

        logger.info("stripeBillingService.subscription.update.discounts.add", {
          subscriptionId,
          customerId: subscription.customer,
          orgId: parsedOrg.id,
          promotionCodeId: promo.id,
          idempotencyKey,
          opId,
          userId: this.ctx.session.user?.id,
          userEmail: this.ctx.session.user?.email,
        });

        try {
          await client.subscriptions.update(
            subscriptionId,
            {
              discounts: [...existingDiscounts, { promotion_code: promo.id }],
              proration_behavior: "none",
            },
            { idempotencyKey },
          );
        } catch (error: any) {
          logger.error(
            "StripeBillingService.applyPromotionCode:stripe.subscription.update.failed",
            {
              userId: this.ctx.session.user?.id,
              userEmail: this.ctx.session.user?.email,
              customerId: subscription.customer,
              subscriptionId,
              orgId: parsedOrg.id,
              promotionCodeId: promo.id,
              error,
              stripeRequestId: error?.requestId,
              stripeErrorType: error?.type,
              stripeErrorCode: error?.code,
            },
          );
          traceException(error);

          // Provide user-friendly error message
          let errorMessage = "Failed to apply promotion code";

          if (error?.message?.includes("prior transactions")) {
            errorMessage = "Promotion code only valid for new customers";
          } else if (error?.message) {
            errorMessage = error.message;
          }

          throw new TRPCError({
            code: "BAD_REQUEST",
            message: errorMessage,
          });
        }

        void auditLog({
          session: this.ctx.session,
          orgId: parsedOrg.id,
          resourceType: "organization",
          resourceId: parsedOrg.id,
          action: "BillingService.applyPromotionCode",
          before: parsedOrg.cloudConfig,
          after: "webhook",
        });

        return { ok: true as const };
      },
    );
  }
}

/**
 * Creates a BillingService instance from a TRPC context.
 * This is the preferred way to create a BillingService in router endpoints.
 */
export const createBillingServiceFromContext = (ctx: OrgAuthedContext) => {
  if (!defaultStripeClient) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Stripe client not initialized",
    });
  }
  return new BillingService(defaultStripeClient, ctx);
};
