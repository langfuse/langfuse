import type Stripe from "stripe";
import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";

import { env } from "@/src/env.mjs";

import { parseDbOrg } from "@langfuse/shared";
import {
  getTraceCountOfProjectsSinceCreationDate,
  getObservationCountOfProjectsSinceCreationDate,
  getScoreCountOfProjectsSinceCreationDate,
  logger,
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

import { UsageAlertService } from "./usageAlertService";

type ProductWithDefaultPrice = Expanded<Stripe.Product, "default_price">;
type SubscriptionWithSchedule = ExpandedNullable<
  Stripe.Subscription,
  "schedule"
>;

/**
 * BillingService centralizes Stripe + Prisma billing orchestration.
 *
 * Design principles:
 * - Dependencies (Stripe, Prisma) are injected for testability and to avoid global state.
 * - Methods are side-effectful but deterministic and validate preconditions.
 * - Errors are surfaced as TRPCError to keep the router thin and consistent.
 */
export class BillingService {
  constructor(private deps: { prisma: PrismaClient; stripe?: Stripe }) {}

  private get stripe(): Stripe {
    const s = this.deps.stripe ?? (defaultStripeClient as Stripe | null);
    if (!s) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Stripe client not initialized",
      });
    }
    return s;
  }

  private async getParsedOrg(orgId: string) {
    const org = await this.deps.prisma.organization.findUnique({
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
    const org = await this.deps.prisma.organization.findUnique({
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

  private async retrieveSubscriptionWithSchedule(
    client: Stripe,
    subscriptionId: string,
  ): Promise<SubscriptionWithSchedule> {
    const subscription = await client.subscriptions.retrieve(subscriptionId, {
      expand: ["schedule"],
    });

    const schedule = subscription.schedule;

    if (!isExpandedOrNullable(schedule)) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Stripe Error: Could not expand schedule on subscription ${subscriptionId}`,
      });
    }

    return { ...subscription, schedule: schedule };
  }

  private async retrieveProductWithDefaultPrice(
    client: Stripe,
    productId: string,
  ): Promise<ProductWithDefaultPrice> {
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
  }

  private async retrieveInvoiceList(
    client: Stripe,
    stripeCustomerId: string,
    subscriptionId: string,
    limit: number,
    startingAfter?: string,
    endingBefore?: string,
  ) {
    return await client.invoices.list({
      customer: stripeCustomerId,
      subscription: subscriptionId, // one customer may have multiple subscriptions (one per org)
      limit: limit,
      starting_after: startingAfter,
      ending_before: endingBefore,
      expand: ["data.lines", "data.lines.data.price"],
    });
  }

  private async createInvoicePreview(
    client: Stripe,
    stripeCustomerId: string,
    subscriptionId: string,
  ) {
    return await client.invoices.createPreview({
      customer: stripeCustomerId,
      subscription: subscriptionId,
    });
  }

  private async releaseExistingSubscriptionScheduleIfAny(
    subscription: SubscriptionWithSchedule,
  ) {
    const client = this.stripe;
    const schedule = subscription.schedule;

    if (!schedule) {
      return; // no schedule to release
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
  }

  // ================================================
  // === Public methods ===
  // ================================================

  /**
   * Get a Stripe Billing Portal session URL for an organization.
   *
   * Throws when the organization lacks a Stripe customer or active subscription.
   *
   * @param orgId Organization id
   * @returns Hosted portal URL (string)
   */
  async getCustomerPortalUrl(orgId: string) {
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

    const billingPortalSession = await client.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${env.NEXTAUTH_URL}/organization/${orgId}/settings/billing`,
    });

    return billingPortalSession.url;
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

    const product = await this.retrieveProductWithDefaultPrice(
      client,
      stripeProductId,
    );

    // TODO: Cleanup after all customers are migrated to the new system
    const lineItems = await (async () => {
      const isLegacyProduct =
        product.default_price.recurring?.usage_type === "metered";

      if (isLegacyProduct) {
        return [{ price: product.default_price.id }];
      }

      const usageProduct = await this.retrieveProductWithDefaultPrice(
        client,
        StripeCatalogue.usageProductId(),
      );

      return [
        { price: product.default_price as string, quantity: 1 },
        { price: usageProduct.default_price.id },
      ];
    })();

    const returnUrl = `${env.NEXTAUTH_URL}/organization/${orgId}/settings/billing`;
    const stripeCustomerId = parsedOrg.cloudConfig?.stripe?.customerId;
    const clientReferenceId = createStripeClientReference(orgId);

    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      customer: stripeCustomerId,
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
      billing_address_collection: "required",
      success_url: returnUrl,
      cancel_url: returnUrl,
      mode: "subscription",
      subscription_data: {
        // Note: metadata should always be treated as optional since
        // we cannot rely on it being set (e.g., manual subscription creation in stripe)
        metadata: {
          orgId: orgId,
          cloudRegion: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION ?? null,
        },
        billing_mode: {
          type: "flexible",
        },
      },
    };

    const session = await client.checkout.sessions.create(sessionConfig);

    if (!session.url) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to create checkout session",
      });
    }

    return session.url;
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
  async changePlan(orgId: string, newProductId: string) {
    const client = this.stripe;

    const { parsedOrg } = await this.getParsedOrg(orgId);

    if (parsedOrg.cloudConfig?.plan)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Cannot change plan for orgs that have a manually set plan",
      });

    const stripeSubscriptionId =
      parsedOrg.cloudConfig?.stripe?.activeSubscriptionId;

    if (!stripeSubscriptionId)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Organization does not have an active subscription",
      });

    const subscription = await this.retrieveSubscriptionWithSchedule(
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
          "Subscription is not active, current status: " + subscription.status,
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

      await this.releaseExistingSubscriptionScheduleIfAny(subscription);
      await client.subscriptions.update(stripeSubscriptionId, {
        items: [
          ...subscription.items.data.map((i) => ({ id: i.id, deleted: true })),
          ...newLineItems,
        ],
        billing_cycle_anchor: "now",
        proration_behavior: "none",
        ...cancellationPayload,
      });

      return {
        status: "success",
        auditInfo: {
          before: parsedOrg.cloudConfig,
          after: "webhook",
        },
      };
    }
    // [A] End ----------------------------------------------------------------------------------------

    // Helper to migrate all users who are still on classic over to flexible billing
    if (subscription.billing_mode?.type === "classic") {
      await client.subscriptions.migrate(stripeSubscriptionId, {
        billing_mode: { type: "flexible" },
      });
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

    if (!StripeCatalogue.isValidCheckoutProduct(currentSubscriptionProductId)) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Invalid stripe product id for existing subscription product",
      });
    }

    const upgrading = StripeCatalogue.isUpgrade(
      currentSubscriptionProductId,
      newProductId,
    );

    // [B.1] Upgrade Path: Switch from lower to higher plan (-> Prorated immediate switch)
    // -----------------------------------------------------
    if (upgrading) {
      await this.releaseExistingSubscriptionScheduleIfAny(subscription);

      await client.subscriptions.update(stripeSubscriptionId, {
        items: [
          {
            price: newProduct.default_price.id, // price identifies the product
            quantity: 1,
          },
        ], // replaces the existing list of items of the product
        proration_behavior: "always_invoice",
        ...cancellationPayload,
      });
      return {
        status: "success",
        auditInfo: {
          before: parsedOrg.cloudConfig,
          after: "webhook",
        },
      };
    }

    // [B.2] Downgrade Path: Switch from higher to lower plan (-> Subscription Schedule)
    // -----------------------------------------------------
    const currentPeriodEndSec = subscriptionProductItem.current_period_end;

    const nextPhaseItems = subscription.items.data.map((i) => {
      const isMetered = i.price.recurring?.usage_type === "metered";

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

    await this.releaseExistingSubscriptionScheduleIfAny(subscription);

    const initialSchedule = await client.subscriptionSchedules.create({
      from_subscription: stripeSubscriptionId,
    }); // not possible to set any items here, if we use from_subscription

    await client.subscriptionSchedules.update(initialSchedule.id, {
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
    });
    return {
      status: "success",
      auditInfo: {
        before: parsedOrg.cloudConfig,
        after: "webhook",
      },
    };
    // [B] End ----------------------------------------------------------------------------------------
  }

  /**
   * Cancel the active subscription at period end. Releases any pending schedules first.
   *
   * @param orgId Organization id
   */
  async cancel(orgId: string) {
    const client = this.stripe;

    const { parsedOrg } = await this.getParsedOrg(orgId);

    const subscriptionId = parsedOrg.cloudConfig?.stripe?.activeSubscriptionId;
    if (!subscriptionId)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "No active subscription to cancel",
      });

    const subscription = await this.retrieveSubscriptionWithSchedule(
      client,
      subscriptionId,
    );

    // If the user cancels the subscription, we want to release the existing schedule
    await this.releaseExistingSubscriptionScheduleIfAny(subscription);

    await client.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
      proration_behavior: "none",
    });

    return {
      status: "success",
      auditInfo: {
        before: parsedOrg.cloudConfig,
        after: "webhook",
      },
    };
  }

  /**
   * Reactivate a subscription by clearing cancellation flags and releasing pre-existing schedules.
   *
   * @param orgId Organization id
   */
  async reactivate(orgId: string) {
    const client = this.stripe;

    const { parsedOrg } = await this.getParsedOrg(orgId);

    const subscriptionId = parsedOrg.cloudConfig?.stripe?.activeSubscriptionId;
    if (!subscriptionId)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "No active subscription to reactivate",
      });

    const subscription = await this.retrieveSubscriptionWithSchedule(
      client,
      subscriptionId,
    );

    // If the user reactivates the subscription, we want to remove the cancellation
    const cancellationPayload = subscription.cancel_at
      ? { cancel_at: null }
      : { cancel_at_period_end: false };

    // If the user has any pending schedule, we want to release it
    await this.releaseExistingSubscriptionScheduleIfAny(subscription);

    const updated = await client.subscriptions.update(subscriptionId, {
      ...cancellationPayload,
    });

    return {
      status: "success",
      auditInfo: {
        before: parsedOrg.cloudConfig,
        after: "webhook",
      },
    };
  }

  /**
   * Clear any active or not-started subscription schedule for the org's subscription.
   *
   * @param orgId Organization id
   */
  async clearPlanSwitchSchedule(orgId: string) {
    const client = this.stripe;

    const { parsedOrg } = await this.getParsedOrg(orgId);

    const subscriptionId = parsedOrg.cloudConfig?.stripe?.activeSubscriptionId;
    if (!subscriptionId)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "No active subscription found",
      });

    const subscription = await this.retrieveSubscriptionWithSchedule(
      client,
      subscriptionId,
    );

    await this.releaseExistingSubscriptionScheduleIfAny(subscription);

    return {
      status: "success",
      auditInfo: {
        before: parsedOrg.cloudConfig,
        after: "webhook",
      },
    };
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

    const list = await this.retrieveInvoiceList(
      client,
      stripeCustomerId,
      stripeSubscriptionId,
      pagination.limit,
      pagination.startingAfter,
      pagination.endingBefore,
    );

    const preview = await this.createInvoicePreview(
      client,
      stripeCustomerId,
      stripeSubscriptionId,
    );

    const priceCache = new Map<string, Stripe.Price>();

    // Anonymous function to get the price from Stripe or the emepheral cache here.
    // In practice a customer will have at least two prices, and maybe a few more.
    const getPrice = async (priceId?: string) => {
      if (!priceId) {
        return undefined;
      }

      const cached = priceCache.get(priceId);
      if (cached) {
        return cached;
      }

      const p = await client.prices.retrieve(priceId);
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
        const price = await getPrice(priceId);

        const isMetered = price?.recurring?.usage_type === "metered";
        if (isMetered) {
          usageCents += amount;
        } else {
          subscriptionCents += amount;
        }
      }

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
        created: invoice.created,
        hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
        invoicePdfUrl: invoice.invoice_pdf ?? null,
        breakdown: { subscriptionCents, usageCents, taxCents, totalCents },
      };
    };

    const previewRow = await mapInvoiceToTableRow(preview);

    const invoices = await Promise.all(
      list.data.map((inv) => mapInvoiceToTableRow(inv)),
    );

    const rows =
      !pagination.startingAfter && !pagination.endingBefore
        ? [previewRow, ...invoices]
        : invoices;

    // Set up cursors for client-side pagination
    const nextCursor = invoices.length
      ? invoices[invoices.length - 1]!.id
      : undefined;
    const prevCursor = invoices.length ? invoices[0]!.id : undefined;

    return {
      invoices: rows,
      hasMore: list.has_more,
      cursors: {
        next: list.has_more ? nextCursor : undefined,
        prev: prevCursor,
      },
    };
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
    const client = this.stripe;

    const { org, parsedOrg } = await this.getParsedOrgWithProjects(orgId);

    const stripeCustomerId = parsedOrg.cloudConfig?.stripe?.customerId;
    const stripeSubscriptionId =
      parsedOrg.cloudConfig?.stripe?.activeSubscriptionId;

    if (!stripeCustomerId || !stripeSubscriptionId) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "No stripe customer or subscription found",
      });
    }

    const subscription = await this.retrieveSubscriptionWithSchedule(
      client,
      stripeSubscriptionId,
    );

    // [A] We have a user with an active subscription -> get usage from Stripe
    // ------------------------------------------------------------------------------------------------
    if (subscription) {
      try {
        const usageItem = subscription.items.data.find(
          (item) => item.price.recurring?.usage_type === "metered",
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
        // Fail softly and fallback to Clickhouse
        logger.error(
          "Failed to get usage from Stripe, using usage from Clickhouse",
          { error: e },
        );
      }
    }
    // [A] End ----------------------------------------------------------------------------------------

    // [B] We have no active subscription -> get usage from Clickhouse for past 30 days (likely hobby plan or fallback)
    // ------------------------------------------------------------------------------------------------
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const projectIds = org.projects.map((p) => p.id);

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

    // [B] End ----------------------------------------------------------------------------------------
  }

  // TODO: Currently not working as expected, need to fix
  /**
   * Create/update/deactivate Stripe usage alerts for an organization.
   *
   * Preconditions: Org must have a Stripe customer and active subscription.
   *
   * @param orgId Organization id
   * @param payload Usage alert configuration
   */
  async upsertUsageAlerts(
    orgId: string,
    payload: {
      enabled: boolean;
      threshold: number;
      notifications: { email: boolean; recipients: string[] };
    },
  ) {
    const { parsedOrg } = await this.getParsedOrg(orgId);
    const stripeCustomerId = parsedOrg.cloudConfig?.stripe?.customerId;
    const subscriptionId = parsedOrg.cloudConfig?.stripe?.activeSubscriptionId;
    const currentAlerts = parsedOrg.cloudConfig?.usageAlerts;
    if (!stripeCustomerId || !subscriptionId)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "Organization must have a Stripe customer with active subscription to configure usage alerts",
      });
    const client = this.stripe;
    let updatedAlerts = payload;

    const subscription = await client.subscriptions.retrieve(subscriptionId);
    if (!subscription)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Stripe subscription not found",
      });
    const meterId = subscription.items.data.filter((subItem) =>
      Boolean((subItem as any).plan.meter),
    )[0]?.plan.meter as string | undefined;

    const updatedUsageAlertConfig: any = {
      enabled: updatedAlerts.enabled,
      type: "STRIPE",
      threshold: updatedAlerts.threshold,
      alertId: currentAlerts?.alertId ?? null,
      meterId: meterId ?? null,
      notifications: {
        email: updatedAlerts.notifications.email,
        recipients: updatedAlerts.notifications.recipients,
      },
    };

    if (
      !updatedAlerts.enabled &&
      currentAlerts?.alertId &&
      currentAlerts?.enabled
    ) {
      await UsageAlertService.getInstance({ stripeClient: client }).deactivate({
        id: currentAlerts?.alertId,
      });
    }
    if (!currentAlerts?.alertId) {
      const alert = await UsageAlertService.getInstance({
        stripeClient: client,
      }).create({
        orgId,
        customerId: stripeCustomerId,
        meterId,
        amount: updatedAlerts.threshold,
      });
      updatedUsageAlertConfig.alertId = alert.id;
    }
    if (
      updatedAlerts.enabled &&
      currentAlerts?.alertId &&
      (currentAlerts?.threshold !== updatedAlerts.threshold ||
        currentAlerts.meterId !== meterId)
    ) {
      const alert = await UsageAlertService.getInstance({
        stripeClient: client,
      }).recreate({
        orgId,
        customerId: stripeCustomerId,
        meterId,
        existingAlertId: currentAlerts.alertId,
        amount: updatedAlerts.threshold,
      });
      updatedUsageAlertConfig.alertId = alert.id;
    }
    if (
      updatedAlerts.enabled &&
      currentAlerts?.alertId &&
      !currentAlerts.enabled
    ) {
      await UsageAlertService.getInstance({ stripeClient: client }).activate({
        id: currentAlerts.alertId,
      });
    }

    const newCloudConfig = {
      ...parsedOrg.cloudConfig,
      usageAlerts: updatedUsageAlertConfig,
    };
    const updatedOrg = await this.deps.prisma.organization.update({
      where: { id: orgId },
      data: { cloudConfig: newCloudConfig },
    });

    return updatedAlerts;
  }
}

export const createBillingService = (deps: {
  prisma: PrismaClient;
  stripe?: Stripe;
}) => new BillingService(deps);
