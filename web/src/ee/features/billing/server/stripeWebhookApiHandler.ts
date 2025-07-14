import {
  getOrgIdFromStripeClientReference,
  isStripeClientReferenceFromCurrentCloudRegion,
} from "@/src/ee/features/billing/stripeClientReference";
import { env } from "@/src/env.mjs";
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@langfuse/shared/src/db";
import { stripeClient } from "@/src/ee/features/billing/utils/stripe";
import type Stripe from "stripe";
import {
  CloudConfigSchema,
  type Organization,
  parseDbOrg,
} from "@langfuse/shared";
import { traceException, redis, logger } from "@langfuse/shared/src/server";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";

/*
 * Sign-up endpoint (email/password users), creates user in database.
 * SSO users are created by the NextAuth adapters.
 */
export async function stripeWebhookApiHandler(req: NextRequest) {
  if (req.method !== "POST")
    return NextResponse.json(
      { message: "Method not allowed" },
      { status: 405 },
    );

  if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION || !stripeClient) {
    logger.error("[Stripe Webhook] Endpoint only available in Langfuse Cloud");
    return NextResponse.json(
      { message: "Stripe webhook endpoint only available in Langfuse Cloud" },
      { status: 500 },
    );
  }
  if (!env.STRIPE_WEBHOOK_SIGNING_SECRET) {
    logger.error("[Stripe Webhook] Stripe webhook signing key not found");
    return NextResponse.json(
      { message: "Stripe secret key not found" },
      { status: 500 },
    );
  }

  // check if the request is signed by stripe
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    logger.error("[Stripe Webhook] No signature");
    return NextResponse.json({ message: "No signature" }, { status: 400 });
  }
  let event: Stripe.Event;
  try {
    event = stripeClient.webhooks.constructEvent(
      await req.text(),
      sig,
      env.STRIPE_WEBHOOK_SIGNING_SECRET,
    );
  } catch (err) {
    logger.error("[Stripe Webhook] Error verifying signature", err);
    return NextResponse.json(
      { message: `Webhook Error: ${err}` },
      { status: 400 },
    );
  }

  // Handle the event
  switch (event.type) {
    case "customer.subscription.created":
      // update the active product id on the organization linked to the subscription + customer and subscription id (if null or same)
      const subscription = event.data.object;
      logger.info("[Stripe Webhook] Start customer.subscription.created", {
        payload: subscription,
      });
      await handleSubscriptionChanged(subscription, "created");
      break;
    case "customer.subscription.updated":
      // update the active product id on the organization linked to the subscription + customer and subscription id (if null or same)
      const updatedSubscription = event.data.object;
      logger.info("[Stripe Webhook] Start customer.subscription.updated", {
        payload: updatedSubscription,
      });
      await handleSubscriptionChanged(updatedSubscription, "updated");
      break;
    case "customer.subscription.deleted":
      // remove the active product id on the organization linked to the subscription + subscription, keep customer id
      const deletedSubscription = event.data.object;
      logger.info("[Stripe Webhook] Start customer.subscription.deleted", {
        payload: deletedSubscription,
      });
      await handleSubscriptionChanged(deletedSubscription, "deleted");
      break;
    default:
      logger.warn(`Unhandled event type ${event.type}`);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}

async function getOrgBasedOnActiveSubscriptionId(
  subscriptionId: string,
): Promise<Organization | null> {
  const orgBasedOnSubscriptionId = await prisma.organization.findFirst({
    where: {
      cloudConfig: {
        path: ["stripe", "activeSubscriptionId"],
        equals: subscriptionId,
      },
    },
  });
  return orgBasedOnSubscriptionId;
}

async function getOrgBasedOnCheckoutSessionAttachedToSubscription(
  subscriptionId: string,
): Promise<Organization | null> {
  // get the checkout session from the subscription to retrieve the client reference for this subscription
  const checkoutSessionsResponse = await stripeClient?.checkout.sessions.list({
    subscription: subscriptionId,
    limit: 1,
  });
  if (!checkoutSessionsResponse || checkoutSessionsResponse.data.length !== 1) {
    logger.warn("[Stripe Webhook] No checkout session found");
    return null;
  }
  const checkoutSession = checkoutSessionsResponse.data[0];

  // the client reference is passed to the stripe checkout session via the pricing page
  const clientReference = checkoutSession.client_reference_id;
  if (!clientReference) {
    logger.warn("[Stripe Webhook] No client reference");
    return null;
  }
  if (!isStripeClientReferenceFromCurrentCloudRegion(clientReference)) {
    logger.info(
      "[Stripe Webhook] Client reference not from current cloud region",
    );
    return null;
  }
  const orgId = getOrgIdFromStripeClientReference(clientReference);

  // find the org with the customer ID
  const organization = await prisma.organization.findUnique({
    where: {
      id: orgId,
    },
  });
  return organization;
}

async function handleSubscriptionChanged(
  subscription: Stripe.Subscription,
  action: "created" | "deleted" | "updated",
) {
  const subscriptionId = subscription.id;

  let organization: Organization | null = null;

  // For existing subscriptions, we can use the active subscription id to find the org
  // More reliable than the checkout session attached to the subscription for subscriptions that were manually set up
  organization = await getOrgBasedOnActiveSubscriptionId(subscriptionId);

  // Required fallback for new subscriptions
  if (!organization) {
    organization =
      await getOrgBasedOnCheckoutSessionAttachedToSubscription(subscriptionId);
  }

  if (!organization) {
    logger.info(
      "[Stripe Webhook] Organization not found for this subscription",
    );
    return;
  }
  const parsedOrg = parseDbOrg(organization);

  // assert that no other stripe customer id is already set on the org
  const customerId = subscription.customer;
  if (!customerId || typeof customerId !== "string") {
    logger.error("[Stripe Webhook] Customer ID not found");
    traceException("[Stripe Webhook] Customer ID not found");
    return;
  }
  if (
    parsedOrg.cloudConfig?.stripe?.customerId &&
    parsedOrg.cloudConfig?.stripe?.customerId !== customerId
  ) {
    logger.error("[Stripe Webhook] Another customer id already set on org");
    traceException("[Stripe Webhook] Another customer id already set on org");
    return;
  }

  // check subscription items
  logger.info("subscription.items.data", { payload: subscription.items.data });

  if (!subscription.items.data || subscription.items.data.length !== 1) {
    logger.error(
      "[Stripe Webhook] Subscription items not found or more than one",
    );
    traceException(
      "[Stripe Webhook] Subscription items not found or more than one",
    );
    return;
  }

  const subscriptionItem = subscription.items.data[0];
  const productId = subscriptionItem.price.product;

  if (!productId || typeof productId !== "string") {
    logger.error("[Stripe Webhook] Product ID not found");
    traceException("[Stripe Webhook] Product ID not found");
    return;
  }

  // assert that no other product is already set on the org if this is not an update
  if (
    action !== "updated" &&
    parsedOrg.cloudConfig?.stripe?.activeProductId &&
    parsedOrg.cloudConfig?.stripe?.activeProductId !== productId
  ) {
    traceException(
      "[Stripe Webhook] Another active product id already set on (one of the) org with this active subscription id",
    );
    logger.error(
      "[Stripe Webhook] Another active product id already set on (one of the) org with this active subscription id",
    );
    return;
  }

  // update the cloud config with the product ID
  if (action === "created" || action === "updated") {
    await prisma.organization.update({
      where: {
        id: parsedOrg.id,
      },
      data: {
        cloudConfig: {
          ...parsedOrg.cloudConfig,
          stripe: {
            ...parsedOrg.cloudConfig?.stripe,
            ...CloudConfigSchema.shape.stripe.parse({
              activeProductId: productId,
              activeSubscriptionId: subscriptionId,
              customerId: customerId,
            }),
          },
        },
      },
    });
  } else if (action === "deleted") {
    await prisma.organization.update({
      where: {
        id: parsedOrg.id,
      },
      data: {
        cloudConfig: {
          ...parsedOrg.cloudConfig,
          stripe: {
            ...parsedOrg.cloudConfig?.stripe,
            ...CloudConfigSchema.shape.stripe.parse({
              activeProductId: undefined,
              activeSubscriptionId: undefined,
              customerId: customerId,
            }),
          },
        },
      },
    });
  }

  // need to update the plan in the api keys
  await new ApiAuthService(prisma, redis).invalidateOrgApiKeys(parsedOrg.id);

  return;
}
