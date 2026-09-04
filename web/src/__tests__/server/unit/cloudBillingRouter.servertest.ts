import type { Session } from "next-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveBillingService: vi.fn(),
  throwIfNoEntitlement: vi.fn(),
  throwIfNoOrganizationAccess: vi.fn(),
  auditLog: vi.fn(),
  isCloudBillingEnabled: vi.fn(() => true),
}));

vi.mock("@/src/ee/features/billing/server/resolveBillingService", () => ({
  resolveBillingService: mocks.resolveBillingService,
}));

vi.mock("@/src/features/entitlements/server/hasEntitlement", () => ({
  throwIfNoEntitlement: mocks.throwIfNoEntitlement,
}));

vi.mock("@/src/features/rbac/utils/checkOrganizationAccess", () => ({
  throwIfNoOrganizationAccess: mocks.throwIfNoOrganizationAccess,
}));

vi.mock("@/src/features/audit-logs/auditLog", () => ({
  auditLog: mocks.auditLog,
}));

vi.mock("@/src/ee/features/billing/utils/isCloudBilling", () => ({
  isCloudBillingEnabled: mocks.isCloudBillingEnabled,
}));

import { cloudBillingRouter } from "@/src/ee/features/billing/server/cloudBillingRouter";
import { logger } from "@langfuse/shared/src/server";

/** Metadata payloads passed to `logger.error`, where the labels land. */
const loggedErrors = () =>
  vi
    .mocked(logger.error)
    .mock.calls.map((call) => (call as unknown[])[1] as unknown);

const ORG_ID = "org-1";

const caller = () => {
  const session = {
    expires: "1",
    user: {
      id: "user-1",
      name: "Demo User",
      email: "demo@langfuse.com",
      admin: false,
      organizations: [{ id: ORG_ID, name: "Org", role: "OWNER", projects: [] }],
    },
  } as unknown as Session;

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
});
