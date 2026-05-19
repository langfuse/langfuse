import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { v4 } from "uuid";
import type Stripe from "stripe";
import { prisma } from "@langfuse/shared/src/db";
import { handleSubscriptionChanged } from "@/src/ee/features/billing/server/stripeWebhookHandler";
import { env } from "@/src/env.mjs";

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
