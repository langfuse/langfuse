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
  type ChbAttachedPlan,
  ChbPaymentRequiredError,
} from "./chbApiClient";
import { backfillChbProjectEvents } from "./chbProjectEvents";
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
 * The two plan-selection mutations take
 * `stripeProductId`, so this service maps stripeProductId → Plan → PlanCode
 * through chbCatalogue. Plan-code-first inputs retire the bridge post-GA.
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
   * Map the attached plan's pending scheduled change onto the Stripe-shaped
   * cancellation / scheduledChange fields the billing UI renders. CHB reports
   * a cancellation with the date the plan ends and an upgrade / downgrade with
   * the date the new plan starts; the current period end is the fallback while
   * CHB omits either date.
   */
  private mapScheduled(attachedPlan: ChbAttachedPlan): {
    cancellation: BillingSubscriptionInfo["cancellation"];
    scheduledChange: BillingSubscriptionInfo["scheduledChange"];
  } {
    const scheduled = attachedPlan.scheduled;
    if (!scheduled) return { cancellation: null, scheduledChange: null };

    const periodEnd = this.toUnixSeconds(attachedPlan.period?.endDate);

    if (scheduled.type === "cancel") {
      const cancelAt = this.toUnixSeconds(scheduled.endDate) ?? periodEnd;
      if (!cancelAt) return { cancellation: null, scheduledChange: null };
      return { cancellation: { cancelAt }, scheduledChange: null };
    }

    const switchAt = this.toUnixSeconds(scheduled.startDate) ?? periodEnd;
    if (!switchAt) return { cancellation: null, scheduledChange: null };

    return {
      cancellation: null,
      scheduledChange: {
        // CHB has no schedule object of its own; synthesize a stable id for
        // the UI (only mutations by orgId exist, the id is display-only).
        scheduleId: `chb:${attachedPlan.id}`,
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

    if (!chb?.attachedPlanId) {
      // No attached plan yet (hobby / pre-checkout) → same cached-cycle fallback the
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

    const attachedPlan = await this.client.getAttachedPlan({
      chOrganizationId: chb.organizationId,
    });

    const periodStart = attachedPlan.period?.startDate
      ? new Date(attachedPlan.period.startDate)
      : null;
    const periodEnd = attachedPlan.period?.endDate
      ? new Date(attachedPlan.period.endDate)
      : null;

    return {
      ...this.mapScheduled(attachedPlan),
      billingPeriod:
        periodStart && periodEnd
          ? { start: periodStart, end: periodEnd }
          : null,
      // No promotion-code API on the CHB path yet
      discounts: [],
      hasValidPaymentMethod: attachedPlan.payment?.status === "active",
    };
  }

  /**
   * Claim `cloudConfig.clickhouse.organizationId` for this org, atomically.
   *
   * A read-then-write would let two concurrent first-time checkouts each create
   * a CH organization and then race to persist one. The loser's CH org is not
   * just orphaned: the loser is holding a checkout URL whose completion webhook
   * resolves the Langfuse org by a JSONB lookup on this very field, so a payment
   * completed against it would land on an organization we can no longer see.
   *
   * The WHERE guard makes the claim single-winner — only a row whose
   * organizationId is still absent can be written. The merge rebuilds just the
   * `clickhouse` sub-object from the row's own current value rather than from
   * the caller's earlier read, so a webhook concurrently writing `planCode` or
   * `paymentStatus` is not clobbered by a stale snapshot.
   *
   * Returns the number of rows claimed; 0 means another caller won the race.
   *
   * Both `COALESCE`s pass through `NULLIF(…, 'null'::jsonb)`: a JSON-null is not
   * a SQL NULL, so `COALESCE` alone does not catch it. The guard counts a stored
   * `{"clickhouse": null}` as unclaimed — correctly, it holds no CHB state — so
   * the merge has to accept that value too, and `||` against a JSON-null scalar
   * concatenates into `[null, {...}]` instead of merging. Keep the two clauses in
   * step: a `clickhouse` that is not an object fails CloudConfigSchema, and
   * parseDbOrg nulls the whole cloudConfig rather than just that field, so the
   * damage is silent and not local to the CHB state.
   */
  private async claimChOrganizationId(
    orgId: string,
    chOrganizationId: string,
  ): Promise<number> {
    return await this.ctx.prisma.$executeRaw`
      UPDATE organizations
      SET cloud_config = jsonb_set(
            COALESCE(NULLIF(cloud_config, 'null'::jsonb), '{}'::jsonb),
            '{clickhouse}',
            COALESCE(
              NULLIF(cloud_config -> 'clickhouse', 'null'::jsonb),
              '{}'::jsonb
            )
              || jsonb_build_object('organizationId', ${chOrganizationId}::text),
            true
          )
      WHERE id = ${orgId}
        AND COALESCE(
              cloud_config -> 'clickhouse' -> 'organizationId',
              'null'::jsonb
            ) = 'null'::jsonb
    `;
  }

  async createCheckoutSession(
    orgId: string,
    stripeProductId: string,
    opId?: string,
  ) {
    const { parsedOrg } = await this.getParsedOrg(orgId);

    // Interlocks: CHB checkout must never run for an org that is manually
    // planned or carries any Stripe billing state — an org bills through
    // exactly one provider, and both resolvers key off these fields.
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
    if (parsedOrg.cloudConfig?.clickhouse?.attachedPlanId) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "Organization already has an active attached plan; use changePlan instead of checkout",
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

    // Scoped to orgId + planCode rather than the opId alone: the dialog keeps
    // one opId across plan re-clicks, so without planCode a user switching
    // from core to team would replay the first plan's session.
    const idempotencyKey = makeIdempotencyKey({
      kind: IdempotencyKind.enum["chb.checkout.create"],
      fields: { orgId, planCode },
      opId,
    });

    const existingChOrgId = parsedOrg.cloudConfig?.clickhouse?.organizationId;

    logger.info("chbBillingService.checkout.session.create", {
      orgId,
      planCode,
      chOrganizationId: existingChOrgId,
      idempotencyKey,
      opId,
      userId: this.ctx.session.user.id,
    });

    const session = await this.client.createCheckoutSession({
      // Reuse the CH organization from an earlier checkout attempt so a retry
      // recovers the same org instead of orphaning one
      organizationId: existingChOrgId,
      email,
      planCode,
      returnUrl: this.returnUrl(orgId),
      idempotencyKey,
    });

    // Validated through the stored schema before it reaches Postgres: a bad id
    // would make parseDbOrg null the *entire* cloudConfig on every later read,
    // taking the org's rate-limit and lookback overrides with it. (Not its plan
    // override or stripe.customerId — both are checkout interlocks above, so an
    // org carrying either never reaches this line.)
    const validatedChb = CloudConfigSchema.shape.clickhouse.safeParse({
      ...parsedOrg.cloudConfig?.clickhouse,
      organizationId: session.organizationId,
    });
    if (!validatedChb.success || !validatedChb.data) {
      // The client's own ChbCheckoutSessionSchema already rejects a non-uuid
      // id, so this guards the stored schema drifting from the wire schema
      // rather than a malformed CHB response: whatever is about to be written
      // has to satisfy the schema every later read parses it back through.
      // safeParse, not parse, because a raw ZodError escaping the service would
      // surface as an opaque 500 instead of this named one.
      logger.error("chbBillingService.checkout.session.create:invalidChOrgId", {
        orgId,
        returnedChOrganizationId: session.organizationId,
        error: validatedChb.success ? undefined : validatedChb.error,
      });
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "ClickHouse Billing returned an unusable organization id for this checkout",
      });
    }
    const chOrganizationId = validatedChb.data.organizationId;

    if (existingChOrgId) {
      // Retry against an org that already has a CH organization. CHB must hand
      // back the one we asked it to reuse; a different id means sticky provider
      // routing is broken, so refuse rather than clobber the stored id or send
      // the user to a checkout whose webhook resolves elsewhere.
      if (chOrganizationId !== existingChOrgId) {
        logger.error(
          "chbBillingService.checkout.session.create:orgIdMismatch",
          {
            orgId,
            requestedChOrganizationId: existingChOrgId,
            returnedChOrganizationId: chOrganizationId,
          },
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "ClickHouse Billing returned a different organization for this checkout",
        });
      }
      return session.checkoutUrl;
    }

    // First checkout for this org: the CH organization id is the one thing
    // checkout persists outside the webhook, and it must be written exactly
    // once. Only reached after CHB succeeded, so a failed call leaves the org
    // row untouched.
    const claimed = await this.claimChOrganizationId(orgId, chOrganizationId);

    if (claimed === 0) {
      // A concurrent checkout claimed the org first. Its id is now the stored
      // one, which makes the CH org we just created an orphan — log it so it is
      // traceable, and fail instead of returning a URL that would misroute a
      // payment. The user's next attempt takes the reuse path and succeeds.
      logger.error("chbBillingService.checkout.session.create:claimLost", {
        orgId,
        orphanedChOrganizationId: chOrganizationId,
      });
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "Another checkout for this organization is already in progress. Please try again.",
      });
    }

    auditLog({
      session: this.ctx.session,
      orgId: parsedOrg.id,
      resourceType: "organization",
      resourceId: parsedOrg.id,
      action: "BillingService.createCheckoutSession",
      before: parsedOrg.cloudConfig,
      after: {
        ...parsedOrg.cloudConfig,
        clickhouse: {
          ...parsedOrg.cloudConfig?.clickhouse,
          organizationId: chOrganizationId,
        },
      },
    });

    // Persisting the CH organization id above is the first moment CHB can
    // attribute a project to this org, and project events are suppressed until
    // then, so the projects the org already has have never been sent. Mirror
    // them once. Only the first checkout reaches this line -- a retry against
    // an org that already has a CH organization returned above -- so there is
    // no second backfill resending the same list.
    //
    // Not awaited: best-effort by design (it swallows its own failures and
    // reports them through langfuse.billing_events.emit_failed), and the user
    // is waiting on a redirect to the payment page.
    backfillChbProjectEvents({ orgId }).catch((error) => {
      // The backfill already reports its own per-project failures; reaching
      // here means it rejected unexpectedly, which must still not surface as
      // an unhandled rejection.
      logger.error(
        `chbBillingService.checkout.backfill.failed for org ${orgId}`,
        error,
      );
    });

    return session.checkoutUrl;
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
    if (!chb.attachedPlanId) {
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
      kind: IdempotencyKind.enum["chb.attachedplan.scheduled.set"],
      fields: { attachedPlanId: chb.attachedPlanId, to: newPlanCode },
      opId,
    });

    logger.info("chbBillingService.attachedplan.scheduled.set", {
      orgId,
      attachedPlanId: chb.attachedPlanId,
      fromPlanCode: currentPlanCode,
      toPlanCode: newPlanCode,
      isUpgrade: upgrading,
      idempotencyKey,
      opId,
      userId: this.ctx.session.user.id,
    });

    try {
      await this.client.setScheduledChange({
        chOrganizationId: chb.organizationId,
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
        // No active payment method → same "needs checkout" UX path the dialog
        // already handles for new subscriptions.
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
   * only, the CH organization survives. No-op without an attached plan so org
   * deletion keeps working for hobby orgs.
   */
  async cancelImmediatelyAndInvoice(orgId: string, opId?: string) {
    const { parsedOrg } = await this.getParsedOrg(orgId);
    const chb = parsedOrg.cloudConfig?.clickhouse;
    if (!chb?.attachedPlanId) {
      logger.info("chbBillingService.cancel.now:noop.noActiveAttachedPlan", {
        orgId,
      });
      return { status: "noop" } as const;
    }

    await this.client.setScheduledChange({
      chOrganizationId: chb.organizationId,
      change: { type: "cancel", when: "immediate" },
      idempotencyKey: makeIdempotencyKey({
        kind: IdempotencyKind.enum["chb.attachedplan.scheduled.set"],
        fields: { attachedPlanId: chb.attachedPlanId, to: "cancel-immediate" },
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
    if (!chb?.attachedPlanId) {
      return { invoices: [], hasMore: false, cursors: {} };
    }

    const invoices = await this.client.listInvoices({
      chOrganizationId: chb.organizationId,
    });

    return {
      // Mapped into the existing invoice-table row shape. CHB reports one
      // total per invoice, so the breakdown is total-only; the open period's
      // accrued usage is available as `preview` on the same route when needed.
      invoices: invoices.map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        currency: invoice.currency?.toUpperCase() ?? "USD",
        // Milliseconds, like the Stripe path. Guarded: an unparsable CHB
        // timestamp must not reach the table as NaN.
        created: (this.toUnixSeconds(invoice.createdAt) ?? 0) * 1000,
        hostedInvoiceUrl: invoice.hostedUrl ?? null,
        invoicePdfUrl: invoice.pdfUrl ?? null,
        breakdown: {
          subscriptionCents: 0,
          usageCents: 0,
          discountCents: 0,
          taxCents: 0,
          totalCents: invoice.amount ?? 0,
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
   * the hourly job maintains. Spend-in-USD can later come from
   * `GET /invoices?includePreview=true` (the open period's accrued usage).
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
    // No CHB promotion-code API yet; the button is hidden for CHB orgs.
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
    if (!chb.attachedPlanId) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "No active subscription to cancel",
      });
    }

    logger.info("chbBillingService.attachedplan.scheduled.cancel", {
      orgId,
      attachedPlanId: chb.attachedPlanId,
      when,
      opId,
      userId: this.ctx.session.user.id,
    });

    await this.client.setScheduledChange({
      chOrganizationId: chb.organizationId,
      change: { type: "cancel", when },
      idempotencyKey: makeIdempotencyKey({
        kind: IdempotencyKind.enum["chb.attachedplan.scheduled.set"],
        fields: { attachedPlanId: chb.attachedPlanId, to: `cancel-${when}` },
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
    if (!chb.attachedPlanId) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "No active subscription found",
      });
    }

    logger.info("chbBillingService.attachedplan.scheduled.clear", {
      orgId,
      attachedPlanId: chb.attachedPlanId,
      action,
      opId,
      userId: this.ctx.session.user.id,
    });

    await this.client.clearScheduledChange({
      chOrganizationId: chb.organizationId,
      idempotencyKey: makeIdempotencyKey({
        kind: IdempotencyKind.enum["chb.attachedplan.scheduled.clear"],
        fields: { attachedPlanId: chb.attachedPlanId },
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
