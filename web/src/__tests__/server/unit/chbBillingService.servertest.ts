import type { CloudConfigSchema } from "@langfuse/shared";
import type * as SharedServer from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: { NEXTAUTH_URL: "https://cloud.langfuse.com" },
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  auditLog: vi.fn(),
}));

vi.mock("@/src/env.mjs", () => ({ env: mocks.env }));

vi.mock("@/src/features/audit-logs/auditLog", () => ({
  auditLog: mocks.auditLog,
}));

// Only the logger is stubbed: getBillingCycleStart/End are the real cached-cycle
// fallback this service shares with the Stripe path.
vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedServer>();
  return { ...actual, logger: mocks.logger };
});

import {
  type ChbApiClient,
  ChbPaymentRequiredError,
} from "@/src/ee/features/billing/server/chb/chbApiClient";
import { ChbBillingService } from "@/src/ee/features/billing/server/chb/chbBillingService";
import { mapChbPlanCodeToStripeProductId } from "@/src/ee/features/billing/utils/chbCatalogue";
import { type OrgAuthedContext } from "@/src/server/api/trpc";

const ORG_ID = "org-1";
const CH_ORG_ID = "6dd6ab1d-9e8d-4c1a-8b4f-9a3d1e2c4b5a";
const ATTACHED_PLAN_ID = "plan_1";

// Resolved through the bridge rather than hardcoded: the catalogue swaps in
// test-mode product ids, and this suite is about the mapping, not the literals.
const productIdFor = (planCode: string) => {
  const productId = mapChbPlanCodeToStripeProductId(planCode);
  if (!productId)
    throw new Error(`no stripe product for plan code ${planCode}`);
  return productId;
};

const findUnique = vi.fn();
const update = vi.fn();
// Checkout claims the CH organization id with a guarded UPDATE rather than a
// read-then-write, so the claim is a raw statement returning a row count.
const executeRaw = vi.fn();

const clientMock = {
  createCheckoutSession: vi.fn(),
  getAttachedPlan: vi.fn(),
  setScheduledChange: vi.fn(),
  clearScheduledChange: vi.fn(),
  listInvoices: vi.fn(),
  createPortalSession: vi.fn(),
};

const ctx = {
  prisma: { organization: { findUnique, update }, $executeRaw: executeRaw },
  session: {
    orgId: ORG_ID,
    orgRole: "OWNER",
    user: { id: "user-1", email: "user@example.com" },
  },
} as unknown as OrgAuthedContext;

const service = () =>
  new ChbBillingService(clientMock as unknown as ChbApiClient, ctx);

/** An org row shaped enough for parseDbOrg and the billing-cycle helpers. */
const stubOrg = (cloudConfig: CloudConfigSchema | null) => ({
  id: ORG_ID,
  name: "Org",
  createdAt: new Date("2026-01-15T00:00:00Z"),
  updatedAt: new Date("2026-01-15T00:00:00Z"),
  cloudConfig,
  cloudBillingCycleAnchor: new Date("2026-01-15T00:00:00Z"),
  cloudCurrentCycleUsage: 4_200,
});

const withOrg = (cloudConfig: CloudConfigSchema | null) => {
  findUnique.mockResolvedValue(stubOrg(cloudConfig));
};

const chbConfig = (
  overrides: Partial<NonNullable<CloudConfigSchema["clickhouse"]>> = {},
): CloudConfigSchema => ({
  clickhouse: {
    organizationId: CH_ORG_ID,
    attachedPlanId: ATTACHED_PLAN_ID,
    planCode: "LANGFUSE_PRO",
    ...overrides,
  },
});

const trpcCode = async (promise: Promise<unknown>) => {
  const error = await promise.catch((e) => e);
  expect(error).toBeInstanceOf(TRPCError);
  return (error as TRPCError).code;
};

describe("chbBillingService", () => {
  beforeEach(() => {
    // resetAllMocks, not clearAllMocks: the rejection implementations below
    // would otherwise leak into every following test.
    vi.resetAllMocks();
    update.mockResolvedValue({});
    // Default: the claim succeeds. Tests that exercise the race override it.
    executeRaw.mockResolvedValue(1);
  });

  describe("getSubscriptionInfo", () => {
    it("falls back to the cached billing cycle when the org has no attached plan", async () => {
      withOrg({ clickhouse: { organizationId: CH_ORG_ID } });

      const info = await service().getSubscriptionInfo(ORG_ID);

      expect(clientMock.getAttachedPlan).not.toHaveBeenCalled();
      expect(info.cancellation).toBeNull();
      expect(info.scheduledChange).toBeNull();
      expect(info.hasValidPaymentMethod).toBe(false);
      // Anchored on the 15th, so both bounds land on a 15th.
      expect(info.billingPeriod?.start.getUTCDate()).toBe(15);
      expect(info.billingPeriod?.end.getUTCDate()).toBe(15);
      expect(info.billingPeriod!.end.getTime()).toBeGreaterThan(
        info.billingPeriod!.start.getTime(),
      );
    });

    it("reports a healthy attached plan's period and payment status", async () => {
      withOrg(chbConfig());
      clientMock.getAttachedPlan.mockResolvedValue({
        id: ATTACHED_PLAN_ID,
        period: {
          startDate: "2026-08-01T00:00:00Z",
          endDate: "2026-09-01T00:00:00Z",
        },
        payment: { status: "active" },
      });

      const info = await service().getSubscriptionInfo(ORG_ID);

      expect(clientMock.getAttachedPlan).toHaveBeenCalledWith({
        chOrganizationId: CH_ORG_ID,
      });
      expect(info.billingPeriod).toEqual({
        start: new Date("2026-08-01T00:00:00Z"),
        end: new Date("2026-09-01T00:00:00Z"),
      });
      expect(info.hasValidPaymentMethod).toBe(true);
      expect(info.cancellation).toBeNull();
      expect(info.scheduledChange).toBeNull();
    });

    it("treats any non-active payment status as no valid payment method", async () => {
      withOrg(chbConfig());
      clientMock.getAttachedPlan.mockResolvedValue({
        id: ATTACHED_PLAN_ID,
        payment: { status: "failed" },
      });

      const info = await service().getSubscriptionInfo(ORG_ID);
      expect(info.hasValidPaymentMethod).toBe(false);
      // Unresolvable period → null rather than an invalid Date pair.
      expect(info.billingPeriod).toBeNull();
    });

    it("maps a pending cancellation onto the cancellation field", async () => {
      withOrg(chbConfig());
      clientMock.getAttachedPlan.mockResolvedValue({
        id: ATTACHED_PLAN_ID,
        period: { endDate: "2026-09-01T00:00:00Z" },
        scheduled: { type: "cancel", endDate: "2026-09-03T00:00:00Z" },
      });

      const info = await service().getSubscriptionInfo(ORG_ID);

      // Unix seconds, like the Stripe path the UI already renders. The plan's
      // own end date wins over the period end.
      expect(info.cancellation).toEqual({
        cancelAt: Date.parse("2026-09-03T00:00:00Z") / 1000,
      });
      expect(info.scheduledChange).toBeNull();
    });

    it("maps a pending plan switch onto scheduledChange with a bridged product id", async () => {
      withOrg(chbConfig());
      clientMock.getAttachedPlan.mockResolvedValue({
        id: ATTACHED_PLAN_ID,
        period: { endDate: "2026-09-01T00:00:00Z" },
        scheduled: {
          type: "downgrade",
          planCode: "LANGFUSE_CORE",
          startDate: "2026-09-05T00:00:00Z",
        },
      });

      const info = await service().getSubscriptionInfo(ORG_ID);

      expect(info.cancellation).toBeNull();
      expect(info.scheduledChange).toEqual({
        scheduleId: `chb:${ATTACHED_PLAN_ID}`,
        // An explicit startDate wins over the period end.
        switchAt: Date.parse("2026-09-05T00:00:00Z") / 1000,
        newProductId: productIdFor("LANGFUSE_CORE"),
        message: null,
      });
    });

    it("renders no pending state when the change has no resolvable date", async () => {
      withOrg(chbConfig());
      clientMock.getAttachedPlan.mockResolvedValue({
        id: ATTACHED_PLAN_ID,
        scheduled: { type: "cancel" },
      });

      const info = await service().getSubscriptionInfo(ORG_ID);
      expect(info.cancellation).toBeNull();
      expect(info.scheduledChange).toBeNull();
    });

    it("falls back to the period end for a cancellation without an end date", async () => {
      withOrg(chbConfig());
      clientMock.getAttachedPlan.mockResolvedValue({
        id: ATTACHED_PLAN_ID,
        period: {
          startDate: "2026-08-01T00:00:00Z",
          endDate: "2026-09-01T00:00:00Z",
        },
        scheduled: { type: "cancel" },
      });

      const info = await service().getSubscriptionInfo(ORG_ID);
      expect(info.cancellation).toEqual({
        cancelAt: Date.parse("2026-09-01T00:00:00Z") / 1000,
      });
      expect(info.scheduledChange).toBeNull();
    });
  });

  describe("createCheckoutSession", () => {
    const session = {
      checkoutUrl: "https://pay.example.com/c/1",
      organizationId: CH_ORG_ID,
    };

    it("claims the CH organization id returned by checkout", async () => {
      withOrg(null);
      clientMock.createCheckoutSession.mockResolvedValue(session);

      const url = await service().createCheckoutSession(
        ORG_ID,
        productIdFor("LANGFUSE_PRO"),
        "op-checkout",
      );

      expect(url).toBe(session.checkoutUrl);
      expect(clientMock.createCheckoutSession).toHaveBeenCalledWith({
        organizationId: undefined,
        email: "user@example.com",
        planCode: "LANGFUSE_PRO",
        returnUrl: `https://cloud.langfuse.com/organization/${ORG_ID}/settings/billing`,
        idempotencyKey: `chb.checkout.create:orgId=${ORG_ID}:planCode=LANGFUSE_PRO:op=op-checkout`,
      });
      // Claimed with the guarded statement, never a blind read-then-write.
      expect(executeRaw).toHaveBeenCalledTimes(1);
      expect(update).not.toHaveBeenCalled();
      expect(mocks.auditLog).toHaveBeenCalledTimes(1);
    });

    it("keys the idempotency key on the plan so a plan switch is not replayed", async () => {
      // The dialog keeps one opId across plan re-clicks, so the plan code is
      // what separates "core, then team" into two operations.
      clientMock.createCheckoutSession.mockResolvedValue(session);

      withOrg(null);
      await service().createCheckoutSession(
        ORG_ID,
        productIdFor("LANGFUSE_CORE"),
        "op-1",
      );
      withOrg(null);
      await service().createCheckoutSession(
        ORG_ID,
        productIdFor("LANGFUSE_PRO_TEAMS"),
        "op-1",
      );

      const keys = clientMock.createCheckoutSession.mock.calls.map(
        ([params]) => params.idempotencyKey,
      );
      expect(new Set(keys).size).toBe(2);
    });

    it("sends no idempotency key without an opId", async () => {
      withOrg(null);
      clientMock.createCheckoutSession.mockResolvedValue(session);

      await service().createCheckoutSession(
        ORG_ID,
        productIdFor("LANGFUSE_PRO"),
      );

      // Matches makeIdempotencyKey's contract: no client opId, no claim.
      expect(clientMock.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: undefined }),
      );
    });

    it("reuses the CH organization from an earlier attempt without rewriting it", async () => {
      withOrg({ clickhouse: { organizationId: CH_ORG_ID } });
      clientMock.createCheckoutSession.mockResolvedValue(session);

      await service().createCheckoutSession(
        ORG_ID,
        productIdFor("LANGFUSE_PRO_TEAMS"),
      );

      // A retry must recover the same CH org instead of orphaning one.
      expect(clientMock.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: CH_ORG_ID,
          planCode: "LANGFUSE_PRO_TEAMS",
        }),
      );
      // Already stored, so the retry claims nothing.
      expect(executeRaw).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it("refuses when a retry comes back with a different CH organization", async () => {
      withOrg({ clickhouse: { organizationId: CH_ORG_ID } });
      clientMock.createCheckoutSession.mockResolvedValue({
        checkoutUrl: session.checkoutUrl,
        organizationId: "11111111-2222-4333-8444-555555555555",
      });

      // Sticky provider routing is broken; clobbering the stored id would point
      // the org at a plan it never bought.
      expect(
        await trpcCode(
          service().createCheckoutSession(
            ORG_ID,
            productIdFor("LANGFUSE_PRO_TEAMS"),
          ),
        ),
      ).toBe("INTERNAL_SERVER_ERROR");
      expect(executeRaw).not.toHaveBeenCalled();
    });

    it("refuses to persist an id the stored schema rejects", async () => {
      withOrg(null);
      clientMock.createCheckoutSession.mockResolvedValue({
        checkoutUrl: session.checkoutUrl,
        organizationId: "not-a-uuid",
      });

      // Mocking the client bypasses ChbCheckoutSessionSchema, so this covers
      // the service's own write-side gate: a bad id reaching Postgres would
      // make parseDbOrg null the whole cloudConfig on every later read.
      expect(
        await trpcCode(
          service().createCheckoutSession(
            ORG_ID,
            productIdFor("LANGFUSE_PRO"),
            "op-1",
          ),
        ),
      ).toBe("INTERNAL_SERVER_ERROR");
      expect(executeRaw).not.toHaveBeenCalled();
    });

    it("fails closed when a concurrent checkout wins the claim", async () => {
      withOrg(null);
      clientMock.createCheckoutSession.mockResolvedValue(session);
      executeRaw.mockResolvedValue(0);

      // Returning this URL would send the user to a checkout whose webhook
      // resolves to a CH org the Langfuse row no longer points at.
      expect(
        await trpcCode(
          service().createCheckoutSession(
            ORG_ID,
            productIdFor("LANGFUSE_PRO"),
            "op-1",
          ),
        ),
      ).toBe("CONFLICT");
      expect(mocks.auditLog).not.toHaveBeenCalled();
      expect(mocks.logger.error).toHaveBeenCalledWith(
        "chbBillingService.checkout.session.create:claimLost",
        expect.objectContaining({ orphanedChOrganizationId: CH_ORG_ID }),
      );
    });

    it("leaves the org row untouched when CHB checkout fails", async () => {
      withOrg(null);
      clientMock.createCheckoutSession.mockRejectedValue(
        new Error("CHB unavailable"),
      );

      await expect(
        service().createCheckoutSession(
          ORG_ID,
          productIdFor("LANGFUSE_PRO"),
          "op-1",
        ),
      ).rejects.toThrow();
      expect(executeRaw).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it("refuses an org with a manual plan override", async () => {
      withOrg({ plan: "Team" });

      expect(
        await trpcCode(
          service().createCheckoutSession(ORG_ID, productIdFor("LANGFUSE_PRO")),
        ),
      ).toBe("INTERNAL_SERVER_ERROR");
      expect(clientMock.createCheckoutSession).not.toHaveBeenCalled();
    });

    it.each([
      ["a stripe customer", { customerId: "cus_1" }],
      ["an active stripe subscription", { activeSubscriptionId: "sub_1" }],
    ])("refuses an org that already carries %s", async (_label, stripe) => {
      withOrg({ stripe } as CloudConfigSchema);

      expect(
        await trpcCode(
          service().createCheckoutSession(ORG_ID, productIdFor("LANGFUSE_PRO")),
        ),
      ).toBe("INTERNAL_SERVER_ERROR");
      // An org bills through exactly one provider.
      expect(clientMock.createCheckoutSession).not.toHaveBeenCalled();
    });

    it("refuses a product id with no CHB plan code", async () => {
      withOrg(null);

      expect(
        await trpcCode(service().createCheckoutSession(ORG_ID, "prod_unknown")),
      ).toBe("INTERNAL_SERVER_ERROR");
      expect(clientMock.createCheckoutSession).not.toHaveBeenCalled();
    });
  });

  describe("changePlan", () => {
    it("applies an upgrade immediately", async () => {
      withOrg(chbConfig({ planCode: "LANGFUSE_CORE" }));

      await service().changePlan(
        ORG_ID,
        productIdFor("LANGFUSE_PRO_TEAMS"),
        "op-1",
      );

      expect(clientMock.setScheduledChange).toHaveBeenCalledWith({
        chOrganizationId: CH_ORG_ID,
        change: {
          type: "upgrade",
          when: "immediate",
          planCode: "LANGFUSE_PRO_TEAMS",
        },
        idempotencyKey:
          "chb.attachedplan.scheduled.set:attachedPlanId=plan_1:to=LANGFUSE_PRO_TEAMS:op=op-1",
      });
    });

    it("defers a downgrade to the end of the billing cycle", async () => {
      withOrg(chbConfig({ planCode: "LANGFUSE_PRO_TEAMS" }));

      await service().changePlan(ORG_ID, productIdFor("LANGFUSE_CORE"), "op-2");

      expect(clientMock.setScheduledChange).toHaveBeenCalledWith(
        expect.objectContaining({
          change: {
            type: "downgrade",
            when: "billing_cycle_end",
            planCode: "LANGFUSE_CORE",
          },
        }),
      );
    });

    it("treats an org with no stored plan code as upgrading", async () => {
      withOrg(chbConfig({ planCode: null }));

      await service().changePlan(ORG_ID, productIdFor("LANGFUSE_CORE"));

      // Nothing to compare against, so apply now rather than stranding the org
      // on its current tier until the cycle ends.
      expect(clientMock.setScheduledChange).toHaveBeenCalledWith(
        expect.objectContaining({
          change: {
            type: "upgrade",
            when: "immediate",
            planCode: "LANGFUSE_CORE",
          },
          // No opId → no key, matching makeIdempotencyKey's contract.
          idempotencyKey: undefined,
        }),
      );
    });

    it("maps a missing payment method onto PRECONDITION_FAILED", async () => {
      withOrg(chbConfig());
      clientMock.setScheduledChange.mockRejectedValue(
        new ChbPaymentRequiredError({ error: "no_payment_method" }),
      );

      expect(
        await trpcCode(
          service().changePlan(ORG_ID, productIdFor("LANGFUSE_PRO_TEAMS")),
        ),
      ).toBe("PRECONDITION_FAILED");
      expect(mocks.auditLog).not.toHaveBeenCalled();
    });

    it("lets any other client error through unchanged", async () => {
      withOrg(chbConfig());
      const boom = new Error("socket hang up");
      clientMock.setScheduledChange.mockRejectedValue(boom);

      await expect(
        service().changePlan(ORG_ID, productIdFor("LANGFUSE_PRO_TEAMS")),
      ).rejects.toBe(boom);
    });

    it.each([
      ["a manual plan override", { plan: "Team" } as CloudConfigSchema],
      ["no CHB state at all", {} as CloudConfigSchema],
      ["no attached plan", { clickhouse: { organizationId: CH_ORG_ID } }],
    ])("refuses an org with %s", async (_label, cloudConfig) => {
      withOrg(cloudConfig);

      expect(
        await trpcCode(
          service().changePlan(ORG_ID, productIdFor("LANGFUSE_PRO_TEAMS")),
        ),
      ).toBe("INTERNAL_SERVER_ERROR");
      expect(clientMock.setScheduledChange).not.toHaveBeenCalled();
    });
  });

  describe("cancel, reactivate and clear", () => {
    it("cancels at the end of the billing cycle", async () => {
      withOrg(chbConfig());

      await expect(service().cancel(ORG_ID, "op-3")).resolves.toEqual({
        status: "success",
      });
      expect(clientMock.setScheduledChange).toHaveBeenCalledWith(
        expect.objectContaining({
          change: { type: "cancel", when: "billing_cycle_end" },
          idempotencyKey:
            "chb.attachedplan.scheduled.set:attachedPlanId=plan_1:to=cancel-billing_cycle_end:op=op-3",
        }),
      );
    });

    it.each([
      ["reactivate", (s: ChbBillingService) => s.reactivate(ORG_ID, "op-4")],
      [
        "clearPlanSwitchSchedule",
        (s: ChbBillingService) => s.clearPlanSwitchSchedule(ORG_ID, "op-4"),
      ],
    ])("%s clears the pending scheduled change", async (_label, call) => {
      withOrg(chbConfig());

      await expect(call(service())).resolves.toEqual({ status: "success" });
      expect(clientMock.clearScheduledChange).toHaveBeenCalledWith({
        chOrganizationId: CH_ORG_ID,
        idempotencyKey:
          "chb.attachedplan.scheduled.clear:attachedPlanId=plan_1:op=op-4",
      });
    });

    it("cancels immediately for destructive flows", async () => {
      withOrg(chbConfig());

      await expect(
        service().cancelImmediatelyAndInvoice(ORG_ID, "op-5"),
      ).resolves.toEqual({ status: "success" });
      expect(clientMock.setScheduledChange).toHaveBeenCalledWith(
        expect.objectContaining({
          change: { type: "cancel", when: "immediate" },
        }),
      );
    });

    it("no-ops the immediate cancellation for an org without an attached plan", async () => {
      withOrg(null);

      // Org deletion must keep working for hobby orgs.
      await expect(
        service().cancelImmediatelyAndInvoice(ORG_ID),
      ).resolves.toEqual({ status: "noop" });
      expect(clientMock.setScheduledChange).not.toHaveBeenCalled();
    });
  });

  describe("getInvoices", () => {
    const pagination = { limit: 10 };

    it("returns nothing for an org without an attached plan", async () => {
      withOrg(null);

      await expect(service().getInvoices(ORG_ID, pagination)).resolves.toEqual({
        invoices: [],
        hasMore: false,
        cursors: {},
      });
      expect(clientMock.listInvoices).not.toHaveBeenCalled();
    });

    it("maps CHB invoices onto the invoice-table row shape", async () => {
      withOrg(chbConfig());
      clientMock.listInvoices.mockResolvedValue([
        {
          id: "inv_1",
          number: "LF-1",
          status: "paid",
          currency: "usd",
          createdAt: "2026-08-01T00:00:00Z",
          amount: 19_900,
          hostedUrl: "https://chb.example.com/inv_1",
          pdfUrl: "https://chb.example.com/inv_1.pdf",
        },
      ]);

      const result = await service().getInvoices(ORG_ID, pagination);

      expect(result.hasMore).toBe(false);
      expect(result.invoices).toEqual([
        {
          id: "inv_1",
          number: "LF-1",
          status: "paid",
          currency: "USD",
          created: Date.parse("2026-08-01T00:00:00Z"),
          hostedInvoiceUrl: "https://chb.example.com/inv_1",
          invoicePdfUrl: "https://chb.example.com/inv_1.pdf",
          breakdown: {
            subscriptionCents: 0,
            usageCents: 0,
            discountCents: 0,
            taxCents: 0,
            totalCents: 19_900,
          },
        },
      ]);
    });

    it("never emits NaN for an unparsable or missing timestamp", async () => {
      withOrg(chbConfig());
      clientMock.listInvoices.mockResolvedValue([
        { id: "inv_1", createdAt: "not a date" },
        { id: "inv_2" },
      ]);

      const result = await service().getInvoices(ORG_ID, pagination);

      // NaN would reach the table as an Invalid Date.
      expect(result.invoices.map((invoice) => invoice.created)).toEqual([0, 0]);
      expect(result.invoices.map((invoice) => invoice.currency)).toEqual([
        "USD",
        "USD",
      ]);
    });
  });

  describe("remaining surface", () => {
    it("builds a portal session against the org's CH id", async () => {
      withOrg(chbConfig());
      clientMock.createPortalSession.mockResolvedValue(
        "https://portal.example.com/1",
      );

      await expect(service().getCustomerPortalUrl(ORG_ID)).resolves.toBe(
        "https://portal.example.com/1",
      );
      expect(clientMock.createPortalSession).toHaveBeenCalledWith({
        chOrganizationId: CH_ORG_ID,
        returnUrl: `https://cloud.langfuse.com/organization/${ORG_ID}/settings/billing`,
      });
    });

    it("refuses a portal session for an org without CHB state", async () => {
      withOrg(null);

      expect(await trpcCode(service().getCustomerPortalUrl(ORG_ID))).toBe(
        "INTERNAL_SERVER_ERROR",
      );
    });

    it("reports usage from the cached cycle counter", async () => {
      withOrg(chbConfig());

      const usage = await service().getUsage(ORG_ID);

      expect(usage.usageCount).toBe(4_200);
      expect(usage.usageType).toBe("units");
      expect(usage.billingPeriod.start.getUTCDate()).toBe(15);
    });

    it("rejects promotion codes, which CHB has no API for", async () => {
      withOrg(chbConfig());

      expect(
        await trpcCode(service().applyPromotionCode(ORG_ID, "SAVE20")),
      ).toBe("NOT_IMPLEMENTED");
    });

    it("fails when the organization row is gone", async () => {
      findUnique.mockResolvedValue(null);

      expect(await trpcCode(service().getSubscriptionInfo(ORG_ID))).toBe(
        "INTERNAL_SERVER_ERROR",
      );
    });
  });
});
