import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveBillingService: vi.fn(),
  throwIfNoEntitlement: vi.fn(),
  throwIfNoOrganizationAccess: vi.fn(),
  auditLog: vi.fn(),
  isCloudBillingEnabled: vi.fn(() => true),
  captureBillingEvent: vi.fn(),
}));

vi.mock(
  "@/src/ee/features/billing/server/billingEvents",
  async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    return { ...actual, captureBillingEvent: mocks.captureBillingEvent };
  },
);

vi.mock("@/src/ee/features/billing/server/resolveBillingService", () => ({
  resolveBillingService: mocks.resolveBillingService,
}));

vi.mock(
  "@/src/features/entitlements/server/hasEntitlement",
  async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    return {
      ...actual,
      throwIfNoEntitlement: mocks.throwIfNoEntitlement,
    };
  },
);

vi.mock("@/src/features/rbac/utils/checkOrganizationAccess", () => ({
  throwIfNoOrganizationAccess: mocks.throwIfNoOrganizationAccess,
}));

vi.mock("@/src/features/audit-logs/auditLog", () => ({
  auditLog: mocks.auditLog,
}));

vi.mock("@/src/ee/features/billing/utils/isCloudBillingEnabled", () => ({
  isCloudBillingEnabled: mocks.isCloudBillingEnabled,
}));

import { cloudBillingRouter } from "@/src/ee/features/billing/server/cloudBillingRouter";
import { logger } from "@langfuse/shared/src/server";
import { createSession } from "@/src/__tests__/fixtures/session-factory";

/** Metadata payloads passed to `logger.error`, where the labels land. */
const loggedErrors = () =>
  vi
    .mocked(logger.error)
    .mock.calls.map((call) => (call as unknown[])[1] as unknown);

const ORG_ID = "org-1";

const caller = () => {
  const session = createSession({
    user: { email: "demo@langfuse.com" },
    organizations: [{ id: ORG_ID, role: "OWNER", name: "Org" }],
  });

  return cloudBillingRouter.createCaller({
    session,
    headers: {},
    prisma: {} as never,
  } as never);
};

/** Minimal stand-in for the resolved provider service. */
const serviceMock = () => ({
  createCheckoutSession: vi.fn().mockResolvedValue("https://checkout.example"),
  getCustomerPortalUrl: vi.fn(),
  getInvoices: vi.fn(),
  changePlan: vi.fn(),
  cancel: vi.fn(),
  reactivate: vi.fn(),
  clearPlanSwitchSchedule: vi.fn(),
  getSubscriptionInfo: vi.fn().mockResolvedValue({ billingPeriod: null }),
});

describe("cloudBillingRouter provider dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(logger, "error").mockImplementation((() => {}) as never);
    mocks.isCloudBillingEnabled.mockReturnValue(true);
  });

  describe("createStripeCheckoutSession", () => {
    it("forwards opId to the resolved service", async () => {
      // The CHB path keys its checkout request's idempotency key on opId, so a
      // dropped opId sends a concurrent retry to CHB unkeyed: two CH
      // organizations get created, one loses the atomic claim, and the user
      // sees a spurious CONFLICT while a CH organization is orphaned.
      const service = serviceMock();
      mocks.resolveBillingService.mockResolvedValue({
        billingProvider: "clickhouse",
        service,
      });

      await caller().createStripeCheckoutSession({
        orgId: ORG_ID,
        stripeProductId: "prod_core",
        opId: "op-1",
      });

      expect(service.createCheckoutSession).toHaveBeenCalledWith(
        ORG_ID,
        "prod_core",
        "op-1",
      );
    });
  });

  describe("provider-agnostic error labels", () => {
    // `withErrorHandling` masks every 5xx message before it reaches the client,
    // so the label is an on-call surface, not a user-facing one: it lands in the
    // middleware's `logger.error` payload. ChbApiError extends Error, not
    // TRPCError, so a CHB REST failure does reach that wrapper.
    it.each([
      ["getInvoices" as const, "getInvoices" as const],
      ["getStripeCustomerPortalUrl" as const, "getCustomerPortalUrl" as const],
    ])(
      "labels a CHB failure in %s as ClickHouse Billing",
      async (procedure, method) => {
        const service = serviceMock();
        service[method].mockRejectedValue(new Error("CHB request failed"));
        mocks.resolveBillingService.mockResolvedValue({
          billingProvider: "clickhouse",
          service,
        });

        await expect(caller()[procedure]({ orgId: ORG_ID })).rejects.toThrow();

        expect(loggedErrors()).toEqual(
          expect.arrayContaining([
            // The procedure's own log line names the provider that failed.
            expect.objectContaining({ billingProvider: "clickhouse" }),
            expect.objectContaining({
              error: expect.objectContaining({
                message: "ClickHouse Billing error: CHB request failed",
              }),
            }),
          ]),
        );
      },
    );

    it("still labels a Stripe failure as Stripe", async () => {
      const service = serviceMock();
      service.getInvoices.mockRejectedValue(new Error("upstream unavailable"));
      mocks.resolveBillingService.mockResolvedValue({
        billingProvider: "stripe",
        service,
      });

      await expect(caller().getInvoices({ orgId: ORG_ID })).rejects.toThrow();

      expect(loggedErrors()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            error: expect.objectContaining({
              message: "Stripe error: upstream unavailable",
            }),
          }),
        ]),
      );
    });
  });

  describe("billing events", () => {
    const resolveTo = (billingProvider: "stripe" | "clickhouse") => {
      const service = serviceMock();
      mocks.resolveBillingService.mockResolvedValue({
        billingProvider,
        service,
      });
      return service;
    };
    const who = (billingProvider: "stripe" | "clickhouse") =>
      expect.objectContaining({
        userId: expect.any(String),
        organizationId: ORG_ID,
        billingProvider,
      });

    it.each(["stripe", "clickhouse"] as const)(
      "captures each billing action once on %s",
      async (billingProvider) => {
        resolveTo(billingProvider);
        const api = caller();

        await api.cancelStripeSubscription({
          orgId: ORG_ID,
          feedback: { reason: "too_expensive", note: "Too much for us" },
          placement: { reasonPosition: 2, reasonOrder: "other,too_expensive" },
        });
        await api.reactivateStripeSubscription({ orgId: ORG_ID });

        expect(mocks.captureBillingEvent.mock.calls).toEqual([
          [
            who(billingProvider),
            "billing:cancellation_scheduled",
            { reason: "too_expensive", reasonPosition: 2, hasNote: true },
          ],
          [who(billingProvider), "billing:cancellation_reverted", {}],
        ]);
      },
    );

    it("captures nothing when the billing provider rejects the action", async () => {
      const service = resolveTo("stripe");
      service.cancel.mockRejectedValue(new Error("upstream unavailable"));

      await expect(
        caller().cancelStripeSubscription({ orgId: ORG_ID }),
      ).rejects.toThrow();

      expect(mocks.captureBillingEvent).not.toHaveBeenCalled();
    });

    it("never puts the note's text on the event", async () => {
      resolveTo("stripe");

      await caller().cancelStripeSubscription({
        orgId: ORG_ID,
        feedback: { reason: "other", note: "private words" },
      });

      expect(
        JSON.stringify(mocks.captureBillingEvent.mock.calls),
      ).not.toContain("private words");
    });
  });
});
