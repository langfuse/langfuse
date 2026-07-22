import { TRPCError } from "@trpc/server";

import { env } from "@/src/env.mjs";
import { type OrgAuthedContext } from "@/src/server/api/trpc";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { CloudConfigSchema, parseDbOrg } from "@langfuse/shared";
import {
  getBillingCycleEnd,
  getBillingCycleStart,
  logger,
} from "@langfuse/shared/src/server";

import { type BillingSubscriptionInfo } from "../stripe/stripeBillingService";
import {
  type ChbApiClient,
  type ChbBundle,
  ChbPaymentRequiredError,
} from "./chbApiClient";
import {
  isChbUpgrade,
  mapChbPlanCodeToStripeProductId,
  mapStripeProductIdToChbPlanCode,
} from "../../utils/chbCatalogue";
import {
  IdempotencyKind,
  makeIdempotencyKey,
} from "../../utils/stripeIdempotencyKey";

/**
 * ClickHouse Billing implementation of the router-facing billing surface.
 *
 * Exposes the same method names and return shapes as the Stripe
 * `BillingService` (incl. `BillingSubscriptionInfo`), so the ten
 * `cloudBillingRouter` procedures dispatch to either provider without any
 * tRPC contract change.
 *
 * Transitional wart, contained here (plan §3.4): the two plan-selection
 * mutations take `stripeProductId`; this service maps
 * stripeProductId → Plan → PlanCode via the two catalogues. Follow-up
 * (post-GA) introduces plan-code-first inputs and retires the bridge.
 */
export class ChbBillingService {
  constructor(
    private readonly client: ChbApiClient,
    private readonly ctx: OrgAuthedContext,
  ) {}

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
    return { org, parsedOrg: parseDbOrg(org) } as const;
  }

  private requireChbState(parsedOrg: {
    id: string;
    cloudConfig: CloudConfigSchema | null;
  }) {
    const chb = parsedOrg.cloudConfig?.clickhouse;
    if (!chb?.organizationId) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Organization has no ClickHouse Billing state",
      });
    }
    return chb;
  }

  private returnUrl(orgId: string) {
    return `${env.NEXTAUTH_URL}/organization/${orgId}/settings/billing`;
  }

  private toUnixSeconds(value: string | null | undefined): number | null {
    if (!value) return null;
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
  }

  /**
   * Map a bundle's pending scheduled change onto the Stripe-shaped
   * cancellation / scheduledChange fields the billing UI renders.
   */
  private mapScheduled(bundle: ChbBundle): {
    cancellation: BillingSubscriptionInfo["cancellation"];
    scheduledChange: BillingSubscriptionInfo["scheduledChange"];
  } {
    const scheduled = bundle.scheduled;
    if (!scheduled) return { cancellation: null, scheduledChange: null };

    // "immediate" changes never linger as pending state worth rendering;
    // date resolution: explicit startDate wins, else the period end.
    const switchAt =
      this.toUnixSeconds(scheduled.startDate) ??
      this.toUnixSeconds(bundle.period?.endDate);
    if (!switchAt) return { cancellation: null, scheduledChange: null };

    if (scheduled.type === "cancel") {
      return {
        cancellation: { cancelAt: switchAt },
        scheduledChange: null,
      };
    }

    return {
      cancellation: null,
      scheduledChange: {
        // CHB has no schedule object of its own; synthesize a stable id for
        // the UI (only mutations by orgId exist, the id is display-only).
        scheduleId: `chb:${bundle.id}`,
        switchAt,
        newProductId: scheduled.planCode
          ? (mapChbPlanCodeToStripeProductId(scheduled.planCode) ?? undefined)
          : undefined,
        message: null,
      },
    };
  }

  async getSubscriptionInfo(orgId: string): Promise<BillingSubscriptionInfo> {
    const { org, parsedOrg } = await this.getParsedOrg(orgId);
    const chb = parsedOrg.cloudConfig?.clickhouse;

    if (!chb?.bundleId) {
      // No bundle yet (hobby / pre-checkout) → same cached-cycle fallback the
      // Stripe path uses for orgs without a subscription.
      const now = new Date();
      return {
        cancellation: null,
        scheduledChange: null,
        billingPeriod: {
          start: getBillingCycleStart(org, now),
          end: getBillingCycleEnd(org, now),
        },
        hasValidPaymentMethod: false,
      };
    }

    const bundle = await this.client.getBundle({
      chOrganizationId: chb.organizationId,
      bundleId: chb.bundleId,
    });

    const periodStart = bundle.period?.startDate
      ? new Date(bundle.period.startDate)
      : null;
    const periodEnd = bundle.period?.endDate
      ? new Date(bundle.period.endDate)
      : null;

    return {
      ...this.mapScheduled(bundle),
      billingPeriod:
        periodStart && periodEnd
          ? { start: periodStart, end: periodEnd }
          : null,
      // No promotion-code API on the CHB path yet (plan non-goal)
      discounts: [],
      hasValidPaymentMethod: bundle.payment?.status === "active",
    };
  }

  async createCheckoutSession(orgId: string, stripeProductId: string) {
    const { parsedOrg } = await this.getParsedOrg(orgId);

    // Interlocks (plan §3.1): CHB checkout must never run for an org that is
    // manually planned or carries any Stripe billing state.
    if (parsedOrg.cloudConfig?.plan) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "Cannot initialize checkout for orgs that have a manual plan override",
      });
    }
    if (
      parsedOrg.cloudConfig?.stripe?.customerId ||
      parsedOrg.cloudConfig?.stripe?.activeSubscriptionId
    ) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "Cannot initialize ClickHouse Billing checkout for a Stripe-billed organization",
      });
    }
    if (parsedOrg.cloudConfig?.clickhouse?.bundleId) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "Organization already has an active bundle; use changePlan instead of checkout",
      });
    }

    const planCode = mapStripeProductIdToChbPlanCode(stripeProductId);
    if (!planCode) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Invalid stripe product id",
      });
    }

    const email = this.ctx.session.user.email;
    if (!email) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Acting user has no email address for checkout",
      });
    }

    logger.info("chbBillingService.checkout.session.create", {
      orgId,
      planCode,
      userId: this.ctx.session.user.id,
      userEmail: email,
    });

    const session = await this.client.createCheckoutSession({
      // Reuse the CH organization from an earlier checkout attempt so
      // retries recover the same org (spec §5)
      organizationId: parsedOrg.cloudConfig?.clickhouse?.organizationId,
      email,
      planCode,
      returnUrl: this.returnUrl(orgId),
    });

    // The only non-webhook write to cloudConfig.clickhouse: persist the CH
    // organization id so provider routing becomes sticky and the webhook can
    // resolve this org by JSONB lookup. Validated through the stored schema
    // so a bad id can never poison parseDbOrg.
    const updatedCloudConfig = {
      ...parsedOrg.cloudConfig,
      clickhouse: CloudConfigSchema.shape.clickhouse.parse({
        ...parsedOrg.cloudConfig?.clickhouse,
        organizationId: session.organizationId,
      }),
    };
    await this.ctx.prisma.organization.update({
      where: { id: orgId },
      data: { cloudConfig: updatedCloudConfig },
    });

    auditLog({
      session: this.ctx.session,
      orgId: parsedOrg.id,
      resourceType: "organization",
      resourceId: parsedOrg.id,
      action: "BillingService.createCheckoutSession",
      before: parsedOrg.cloudConfig,
      after: updatedCloudConfig,
    });

    return session.url;
  }

  async changePlan(orgId: string, newProductId: string, opId?: string) {
    const { parsedOrg } = await this.getParsedOrg(orgId);

    if (parsedOrg.cloudConfig?.plan) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Cannot change plan for orgs that have a manually set plan",
      });
    }

    const chb = this.requireChbState(parsedOrg);
    if (!chb.bundleId) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Organization does not have an active subscription",
      });
    }

    const newPlanCode = mapStripeProductIdToChbPlanCode(newProductId);
    if (!newPlanCode) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Invalid stripe product id for new product",
      });
    }

    const currentPlanCode = chb.planCode;
    const upgrading = currentPlanCode
      ? isChbUpgrade(currentPlanCode, newPlanCode)
      : true;

    const idempotencyKey = makeIdempotencyKey({
      kind: IdempotencyKind.enum["chb.bundle.scheduled.set"],
      fields: { bundleId: chb.bundleId, to: newPlanCode },
      opId,
    });

    logger.info("chbBillingService.bundle.scheduled.set", {
      orgId,
      bundleId: chb.bundleId,
      fromPlanCode: currentPlanCode,
      toPlanCode: newPlanCode,
      isUpgrade: upgrading,
      idempotencyKey,
      opId,
      userId: this.ctx.session.user.id,
      userEmail: this.ctx.session.user.email,
    });

    try {
      await this.client.setScheduledChange({
        chOrganizationId: chb.organizationId,
        bundleId: chb.bundleId,
        change: {
          type: upgrading ? "upgrade" : "downgrade",
          // Same semantics as the Stripe path: upgrades apply immediately,
          // downgrades at the end of the current billing cycle.
          when: upgrading ? "immediate" : "billing_cycle_end",
          planCode: newPlanCode,
        },
        idempotencyKey,
      });
    } catch (error) {
      if (error instanceof ChbPaymentRequiredError) {
        // BIL-5910: no active payment method → same "needs checkout" UX path
        // the dialog handles for new subscriptions.
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "No active payment method on the organization. Please complete checkout first.",
          cause: error,
        });
      }
      throw error;
    }

    auditLog({
      session: this.ctx.session,
      orgId: parsedOrg.id,
      resourceType: "organization",
      resourceId: parsedOrg.id,
      action: "BillingService.changePlan",
      before: parsedOrg.cloudConfig,
      after: "webhook",
    });
  }

  async cancel(orgId: string, opId?: string) {
    await this.setCancellation(orgId, "billing_cycle_end", opId);
    return { status: "success" } as const;
  }

  async reactivate(orgId: string, opId?: string) {
    // Reactivation = clearing the pending scheduled cancellation
    await this.clearScheduled(orgId, "BillingService.reactivate", opId);
    return { status: "success" } as const;
  }

  async clearPlanSwitchSchedule(orgId: string, opId?: string) {
    await this.clearScheduled(
      orgId,
      "BillingService.clearPlanSwitchSchedule",
      opId,
    );
    return { status: "success" } as const;
  }

  /**
   * Immediate cancellation for destructive flows (org deletion). Per spec,
   * CHB closes the bill and invoices on the cancellation date; billing data
   * only, the CH organization survives. No-op without a bundle so org
   * deletion keeps working for hobby orgs.
   */
  async cancelImmediatelyAndInvoice(orgId: string, opId?: string) {
    const { parsedOrg } = await this.getParsedOrg(orgId);
    const chb = parsedOrg.cloudConfig?.clickhouse;
    if (!chb?.bundleId) {
      logger.info("chbBillingService.cancel.now:noop.noActiveBundle", {
        orgId,
      });
      return { status: "noop" } as const;
    }

    await this.client.setScheduledChange({
      chOrganizationId: chb.organizationId,
      bundleId: chb.bundleId,
      change: { type: "cancel", when: "immediate" },
      idempotencyKey: makeIdempotencyKey({
        kind: IdempotencyKind.enum["chb.bundle.scheduled.set"],
        fields: { bundleId: chb.bundleId, to: "cancel-immediate" },
        opId,
      }),
    });

    auditLog({
      session: this.ctx.session,
      orgId: parsedOrg.id,
      resourceType: "organization",
      resourceId: parsedOrg.id,
      action: "BillingService.cancelImmediatelyAndInvoice",
      before: parsedOrg.cloudConfig,
      after: "webhook",
    });

    return { status: "success" } as const;
  }

  async getCustomerPortalUrl(orgId: string) {
    const { parsedOrg } = await this.getParsedOrg(orgId);
    const chb = this.requireChbState(parsedOrg);

    return await this.client.createPortalSession({
      chOrganizationId: chb.organizationId,
      returnUrl: this.returnUrl(orgId),
    });
  }

  async getInvoices(
    orgId: string,
    _pagination: {
      limit: number;
      startingAfter?: string;
      endingBefore?: string;
    },
  ) {
    const { parsedOrg } = await this.getParsedOrg(orgId);
    const chb = parsedOrg.cloudConfig?.clickhouse;
    if (!chb?.bundleId) {
      return { invoices: [], hasMore: false, cursors: {} };
    }

    const invoices = await this.client.listInvoices({
      chOrganizationId: chb.organizationId,
      bundleId: chb.bundleId,
    });

    return {
      // Mapped into the existing invoice-table row shape. Breakdown parity
      // (subscription vs usage split, draft/upcoming row) is an open spec
      // question (plan §8.3) — total-only until CHB confirms the payload.
      invoices: invoices.map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        currency: invoice.currency?.toUpperCase() ?? "USD",
        created: invoice.createdAt ? Date.parse(invoice.createdAt) : 0,
        hostedInvoiceUrl: invoice.downloadUrl ?? null,
        invoicePdfUrl: invoice.downloadUrl ?? null,
        breakdown: {
          subscriptionCents: 0,
          usageCents: 0,
          discountCents: 0,
          taxCents: 0,
          totalCents: invoice.totalCents ?? 0,
        },
      })),
      // CHB invoice pagination is not part of the v1 contract; return the
      // full list.
      hasMore: false,
      cursors: {},
    };
  }

  /**
   * v1 usage source of truth for CHB orgs is the existing non-Stripe
   * fallback: billing cycle from the org's anchor + the cached cycle usage
   * the hourly job maintains (plan §3.4; spend-in-USD can later come from
   * `GET /bundles/{id}?fields=period`).
   */
  async getUsage(orgId: string) {
    const { org } = await this.getParsedOrg(orgId);

    const now = new Date();
    return {
      usageCount: org.cloudCurrentCycleUsage ?? 0,
      usageType: "units",
      billingPeriod: {
        start: getBillingCycleStart(org, now),
        end: getBillingCycleEnd(org, now),
      },
    };
  }

  async applyPromotionCode(
    _orgId: string,
    _code: string,
    _opId?: string,
  ): Promise<{ ok: true }> {
    // No CHB promotion-code API yet (plan non-goal §1); the button is hidden
    // for CHB orgs.
    throw new TRPCError({
      code: "NOT_IMPLEMENTED",
      message:
        "Promotion codes are not available for ClickHouse-billed organizations",
    });
  }

  private async setCancellation(
    orgId: string,
    when: "immediate" | "billing_cycle_end",
    opId?: string,
  ) {
    const { parsedOrg } = await this.getParsedOrg(orgId);
    const chb = this.requireChbState(parsedOrg);
    if (!chb.bundleId) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "No active subscription to cancel",
      });
    }

    logger.info("chbBillingService.bundle.scheduled.cancel", {
      orgId,
      bundleId: chb.bundleId,
      when,
      opId,
      userId: this.ctx.session.user.id,
      userEmail: this.ctx.session.user.email,
    });

    await this.client.setScheduledChange({
      chOrganizationId: chb.organizationId,
      bundleId: chb.bundleId,
      change: { type: "cancel", when },
      idempotencyKey: makeIdempotencyKey({
        kind: IdempotencyKind.enum["chb.bundle.scheduled.set"],
        fields: { bundleId: chb.bundleId, to: `cancel-${when}` },
        opId,
      }),
    });

    auditLog({
      session: this.ctx.session,
      orgId: parsedOrg.id,
      resourceType: "organization",
      resourceId: parsedOrg.id,
      action: "BillingService.cancel",
      before: parsedOrg.cloudConfig,
      after: "webhook",
    });
  }

  private async clearScheduled(orgId: string, action: string, opId?: string) {
    const { parsedOrg } = await this.getParsedOrg(orgId);
    const chb = this.requireChbState(parsedOrg);
    if (!chb.bundleId) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "No active subscription found",
      });
    }

    logger.info("chbBillingService.bundle.scheduled.clear", {
      orgId,
      bundleId: chb.bundleId,
      action,
      opId,
      userId: this.ctx.session.user.id,
      userEmail: this.ctx.session.user.email,
    });

    await this.client.clearScheduledChange({
      chOrganizationId: chb.organizationId,
      bundleId: chb.bundleId,
      idempotencyKey: makeIdempotencyKey({
        kind: IdempotencyKind.enum["chb.bundle.scheduled.clear"],
        fields: { bundleId: chb.bundleId },
        opId,
      }),
    });

    auditLog({
      session: this.ctx.session,
      orgId: parsedOrg.id,
      resourceType: "organization",
      resourceId: parsedOrg.id,
      action,
      before: parsedOrg.cloudConfig,
      after: "webhook",
    });
  }
}
