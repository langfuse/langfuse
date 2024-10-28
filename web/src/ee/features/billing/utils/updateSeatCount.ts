import { stripeClient } from "@/src/ee/features/billing/utils/stripe";
import { stripeSeatProductIds } from "@/src/ee/features/billing/utils/stripeProducts";
import { parseDbOrg } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { traceException } from "@langfuse/shared/src/server";

// Method to update the seat count in Stripe based on the number of members in the organization
export async function updateStripeSeatCount(orgId: string) {
  if (!stripeClient) return;

  try {
    const org = await prisma.organization.findUnique({
      where: {
        id: orgId,
      },
    });

    if (!org) {
      throw new Error("Organization not found");
    }

    const cloudConfig = parseDbOrg(org).cloudConfig;
    if (!cloudConfig?.stripe?.activeProductIds) return;

    const stripeSeatProductId = stripeSeatProductIds.find((productId) =>
      cloudConfig.stripe?.activeProductIds?.includes(productId),
    );
    if (!stripeSeatProductId) return;

    const stripeSubscriptionId = cloudConfig.stripe?.activeSubscriptionId;
    if (!stripeSubscriptionId) return;

    const seatCount = await prisma.organizationMembership.count({
      where: {
        orgId,
      },
    });

    const subscription =
      await stripeClient.subscriptions.retrieve(stripeSubscriptionId);

    const stripeSeatSubscriptionItem = subscription.items.data.find(
      (item) => item.plan.product === stripeSeatProductId,
    );
    if (!stripeSeatSubscriptionItem) {
      traceException(
        "[Stripe Seat Update] Stripe seat item not found in Stripe subscription items",
      );
      return;
    }

    if (stripeSeatSubscriptionItem.quantity === seatCount) return;

    await stripeClient.subscriptionItems.update(stripeSeatSubscriptionItem.id, {
      quantity: seatCount,
    });

    // print all relevant ids
    console.log("[Stripe Seat Update] Stripe seat item updated", {
      stripeSeatSubscriptionItemId: stripeSeatSubscriptionItem.id,
      stripeSubscriptionId,
      stripeSeatProductId,
      seatCount,
    });
  } catch (e) {
    traceException(e);
  }
}
