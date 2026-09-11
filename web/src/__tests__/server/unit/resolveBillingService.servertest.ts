import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {
    LANGFUSE_CLOUD_BILLING_CHB_CUTOFF_DATE: null as Date | null,
  },
  getChbApiClient: vi.fn(),
  createBillingServiceFromContext: vi.fn(),
  findOrg: vi.fn(),
}));

vi.mock("@/src/env.mjs", () => ({ env: mocks.env }));

vi.mock("@/src/ee/features/billing/server/chb/chbApiClient", () => ({
  getChbApiClient: mocks.getChbApiClient,
}));

vi.mock("@/src/ee/features/billing/server/stripe/stripeBillingService", () => ({
  createBillingServiceFromContext: mocks.createBillingServiceFromContext,
}));

import { resolveBillingService } from "@/src/ee/features/billing/server/resolveBillingService";
import { ChbBillingService } from "@/src/ee/features/billing/server/chb/chbBillingService";
import { logger } from "@langfuse/shared/src/server";

vi.spyOn(logger, "error").mockImplementation((() => {}) as never);

const ORG_ID = "org-1";
const CHB_ORG_ID = "3f7c1b0a-2d5e-4c8b-9a1f-8e6d4c2b1a09";

const ctxWithOrg = (cloudConfig: unknown) =>
  ({
    prisma: { organization: { findUnique: mocks.findOrg } },
    session: { user: { id: "user-1" } },
    cloudConfig,
  }) as never;

const STRIPE_SERVICE = { provider: "stripe-service" };

describe("resolveBillingService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.LANGFUSE_CLOUD_BILLING_CHB_CUTOFF_DATE = null;
    mocks.createBillingServiceFromContext.mockReturnValue(STRIPE_SERVICE);
    mocks.getChbApiClient.mockReturnValue({ client: true });
    mocks.findOrg.mockResolvedValue({
      id: ORG_ID,
      name: "Org",
      cloudConfig: {},
    });
  });

  it("serves an org carrying CHB state with the CHB service", async () => {
    mocks.findOrg.mockResolvedValue({
      id: ORG_ID,
      name: "Org",
      cloudConfig: { clickhouse: { organizationId: CHB_ORG_ID } },
    });

    const { billingProvider, service } = await resolveBillingService(
      ctxWithOrg({}),
      ORG_ID,
    );

    expect(billingProvider).toBe("clickhouse");
    expect(service).toBeInstanceOf(ChbBillingService);
  });

  it("errors instead of falling back for a CHB org when the CHB env is missing", async () => {
    // Sticky CHB org: Stripe cannot serve it, so a half-configured deployment is
    // a config error, not a fallback.
    mocks.getChbApiClient.mockReturnValue(null);
    mocks.findOrg.mockResolvedValue({
      id: ORG_ID,
      name: "Org",
      cloudConfig: { clickhouse: { organizationId: CHB_ORG_ID } },
    });

    await expect(
      resolveBillingService(ctxWithOrg({}), ORG_ID),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(mocks.createBillingServiceFromContext).not.toHaveBeenCalled();
  });

  it("routes a never-billed org to CHB once the cutoff has passed", async () => {
    // Regression guard for the cutoff plumbing: the shared resolver takes the
    // cutoff as an argument, so forgetting to pass it silently pins every new
    // org to Stripe.
    mocks.env.LANGFUSE_CLOUD_BILLING_CHB_CUTOFF_DATE = new Date(
      "2020-01-01T00:00:00Z",
    );

    const { billingProvider } = await resolveBillingService(
      ctxWithOrg({}),
      ORG_ID,
    );

    expect(billingProvider).toBe("clickhouse");
  });

  it("fails closed to Stripe when the cutoff is set but the CHB env is incomplete", async () => {
    mocks.env.LANGFUSE_CLOUD_BILLING_CHB_CUTOFF_DATE = new Date(
      "2020-01-01T00:00:00Z",
    );
    mocks.getChbApiClient.mockReturnValue(null);

    const { billingProvider, service } = await resolveBillingService(
      ctxWithOrg({}),
      ORG_ID,
    );

    expect(billingProvider).toBe("stripe");
    expect(service).toBe(STRIPE_SERVICE);
  });

  it("keeps an existing Stripe customer on Stripe after the cutoff", async () => {
    mocks.env.LANGFUSE_CLOUD_BILLING_CHB_CUTOFF_DATE = new Date(
      "2020-01-01T00:00:00Z",
    );
    mocks.findOrg.mockResolvedValue({
      id: ORG_ID,
      name: "Org",
      cloudConfig: { stripe: { customerId: "cus_1" } },
    });

    const { billingProvider, service } = await resolveBillingService(
      ctxWithOrg({}),
      ORG_ID,
    );

    expect(billingProvider).toBe("stripe");
    expect(service).toBe(STRIPE_SERVICE);
  });

  it("errors when the organization does not exist", async () => {
    mocks.findOrg.mockResolvedValue(null);

    await expect(
      resolveBillingService(ctxWithOrg({}), ORG_ID),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});
