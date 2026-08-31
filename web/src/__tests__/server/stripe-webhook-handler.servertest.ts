import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { v4 } from "uuid";
import type Stripe from "stripe";
import type * as SharedServer from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { handleSubscriptionChanged } from "@/src/ee/features/billing/server/stripe/stripeWebhookHandler";
import { env } from "@/src/env.mjs";

const mocks = vi.hoisted(() => ({
  traceException: vi.fn(),
  listCheckoutSessions: vi.fn(),
}));

// traceException is what marks the webhook span as an error in APM, so it is
// the assertion target for "does this miss deserve a human's attention?".
vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof SharedServer>()),
  traceException: mocks.traceException,
}));

vi.mock("@/src/ee/features/billing/utils/stripe", () => ({
  stripeClient: {
    checkout: { sessions: { list: mocks.listCheckoutSessions } },
    subscriptions: { update: vi.fn(), retrieve: vi.fn() },
  },
}));

const buildSubscription = (args: {
  orgId: string;
  status?: Stripe.Subscription.Status;
}): Stripe.Subscription =>
  ({
    id: `sub_test_${v4()}`,
    status: args.status ?? "active",
    customer: `cus_test_${v4()}`,
    metadata: {
      orgId: args.orgId,
      cloudRegion: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
    },
    items: {
      data: [
        {
          id: `si_test_${v4()}`,
          price: {
            id: `price_test_${v4()}`,
            product: `prod_test_${v4()}`,
            recurring: { usage_type: "licensed" },
          },
        },
      ],
    },
  }) as unknown as Stripe.Subscription;

describe("stripeWebhookHandler.handleSubscriptionChanged", () => {
  let orgId: string;

  beforeEach(async () => {
    orgId = v4();
    await prisma.organization.create({
      data: {
        id: orgId,
        name: `test-org-${orgId}`,
        cloudFreeTierUsageThresholdState: "BLOCKED",
      },
    });
  });

  afterEach(async () => {
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  });

  it.each([["active"], ["trialing"]] as const)(
    "clears cloudFreeTierUsageThresholdState when subscription.updated arrives with status=%s",
    async (status) => {
      const subscription = buildSubscription({ orgId, status });

      await handleSubscriptionChanged(subscription, "updated");

      const updated = await prisma.organization.findUniqueOrThrow({
        where: { id: orgId },
      });
      expect(updated.cloudFreeTierUsageThresholdState).toBeNull();
    },
  );

  it("clears cloudFreeTierUsageThresholdState when a paid subscription is created", async () => {
    const subscription = buildSubscription({ orgId, status: "active" });

    await handleSubscriptionChanged(subscription, "created");

    const updated = await prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
    });
    expect(updated.cloudFreeTierUsageThresholdState).toBeNull();
  });

  it.each([
    ["created", "incomplete"],
    ["created", "incomplete_expired"],
    ["updated", "past_due"],
    ["updated", "unpaid"],
  ] as const)(
    "does NOT clear cloudFreeTierUsageThresholdState on subscription.%s with status=%s",
    async (action, status) => {
      const subscription = buildSubscription({ orgId, status });

      await handleSubscriptionChanged(subscription, action);

      const updated = await prisma.organization.findUniqueOrThrow({
        where: { id: orgId },
      });
      // Side-effect assertion: subscriptionStatus is written unconditionally
      // inside the same prisma update that contains the isPaidAndCurrent
      // gate. Asserting it proves the gated branch actually ran, so the
      // "still BLOCKED" check below cannot pass by an early return.
      const stripe = (updated.cloudConfig as { stripe?: unknown } | null)
        ?.stripe as
        | { subscriptionStatus?: string; activeSubscriptionId?: string }
        | undefined;
      expect(stripe?.subscriptionStatus).toBe(status);
      expect(stripe?.activeSubscriptionId).toBe(subscription.id);
      expect(updated.cloudFreeTierUsageThresholdState).toBe("BLOCKED");
    },
  );
});

describe("stripeWebhookHandler org lookup miss severity", () => {
  beforeEach(() => {
    mocks.traceException.mockClear();
    // No checkout session, which is the shape a subscription created in the
    // Stripe dashboard rather than through our pricing page leaves behind.
    mocks.listCheckoutSessions.mockReset();
    mocks.listCheckoutSessions.mockResolvedValue({ data: [] });
  });

  it("does not mark the span as an error when the subscription carries no region marker", async () => {
    const subscription = buildSubscription({ orgId: v4() });
    subscription.metadata = {};

    await handleSubscriptionChanged(subscription, "updated");

    expect(mocks.traceException).not.toHaveBeenCalled();
  });

  it("does not mark the span as an error when the org row is already gone on subscription.deleted", async () => {
    // Metadata names this region, but the org row is gone: organization
    // deletion cancels the subscription and then deletes the row, so Stripe
    // delivers customer.subscription.deleted after the row is already gone.
    const subscription = buildSubscription({ orgId: v4() });

    await handleSubscriptionChanged(subscription, "deleted");

    expect(mocks.traceException).not.toHaveBeenCalled();
  });

  it("marks the span as an error once when the owning region cannot resolve the org on subscription.updated", async () => {
    const subscription = buildSubscription({ orgId: v4() });

    await handleSubscriptionChanged(subscription, "updated");

    expect(mocks.traceException).toHaveBeenCalledTimes(1);
  });
});
