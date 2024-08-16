import {
  getOrgIdFromStripeClientReference,
  isStripeClientReferenceFromCurrentCloudRegion,
} from "@/src/ee/features/billing/stripeClientReference";
import { env } from "@/src/env.mjs";
import { type NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@langfuse/shared/src/db";
import { parseDbOrg } from "@/src/features/organizations/utils/parseDbOrg";
import * as Sentry from "@sentry/node";
import { CloudConfigSchema } from "@/src/features/organizations/utils/cloudConfigSchema";

const STRIPE_WEBHOOK_SIGNING_SECRET =
  "whsec_12dc385262f1a5d0f4ba1507cc81f9b3a3e2d03fd99d4ad625b8e21c87dcfd37";

const stripe = env.STRIPE_SECRET_KEY
  ? new Stripe(env.STRIPE_SECRET_KEY)
  : undefined;

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

  if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION || !stripe) {
    console.error("[Stripe Webhook] Endpoint only available in Langfuse Cloud");
    return NextResponse.json(
      { message: "Stripe webhook endpoint only available in Langfuse Cloud" },
      { status: 500 },
    );
  }

  // check if the request is signed by stripe
  const sig = req.headers.get("stripe-signature");
  console.log("[Stripe Webhook] Signature", sig);
  if (!sig) {
    console.error("[Stripe Webhook] No signature");
    return NextResponse.json({ message: "No signature" }, { status: 400 });
  }
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      await req.text(),
      sig,
      STRIPE_WEBHOOK_SIGNING_SECRET,
    );
  } catch (err) {
    console.error("[Stripe Webhook] Error verifying signature", err);
    return NextResponse.json(
      { message: `Webhook Error: ${err}` },
      { status: 400 },
    );
  }

  // Handle the event
  switch (event.type) {
    case "checkout.session.completed":
      // add customer id
      const session = event.data.object;
      console.log("[Stripe Webhook] Start checkout.session.completed", session);
      await handleCheckoutSessionCompleted(session);
      break;
    case "customer.subscription.created":
      const subscription = event.data.object;
      console.log(
        "[Stripe Webhook] Start customer.subscription.created",
        subscription,
      );
      await handleSubscriptionCreated(subscription);
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
) {
  // the client reference is passed to the stripe checkout session via the pricing page
  const clientReference = session.client_reference_id;
  if (!clientReference) {
    console.error("[Stripe Webhook] No client reference");
    return NextResponse.json(
      { message: "No client reference" },
      { status: 400 },
    );
  }
  if (!isStripeClientReferenceFromCurrentCloudRegion(clientReference)) {
    console.error(
      "[Stripe Webhook] Client reference not from current cloud region",
    );
    return;
  }

  const orgId = getOrgIdFromStripeClientReference(clientReference);
  const subscriptionId = session.subscription; // Assuming subscription ID is in session.subscription

  // check if org exists and that the customer and subscription IDs match
  const organization = await prisma.organization.findUnique({
    where: { id: orgId },
  });
  if (!organization) {
    Sentry.captureMessage("[Stripe Webhook] Organization not found", {
      extra: {
        stripeCheckoutSession: session,
      },
    });
    return;
  }

  // check that checkout session includes customer and subscription IDs
  const customerId = session.customer;
  if (typeof customerId !== "string" || typeof subscriptionId !== "string") {
    Sentry.captureMessage(
      "[Stripe Webhook] Checkout session missing customer ID or subscription ID",
      {
        extra: {
          stripeCheckoutSession: session,
        },
      },
    );
    return;
  }

  const parsedOrg = parseDbOrg(organization);
  if (parsedOrg.cloudConfig?.stripe) {
    // check that there is not already a customer or subscription ID that does not match the checkout session
    if (
      parsedOrg.cloudConfig?.stripe?.customerId !== customerId ||
      parsedOrg.cloudConfig?.stripe?.activeSubscriptionId !== subscriptionId
    ) {
      Sentry.captureMessage(
        "[Stripe Webhook] Customer or Subscription ID mismatch",
        {
          extra: {
            cloudConfig: parsedOrg.cloudConfig,
            stripeCheckoutSession: session,
          },
        },
      );
      return;
    }
  }

  // update the cloud config with the customer and subscription IDs
  await prisma.organization.update({
    where: { id: orgId },
    data: {
      cloudConfig: {
        ...parsedOrg.cloudConfig,
        stripe: {
          ...parsedOrg.cloudConfig?.stripe,
          ...CloudConfigSchema.shape.stripe.parse({
            customerId: customerId,
            activeSubscriptionId: subscriptionId, // Update subscription ID
          }),
        },
      },
    },
  });
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  const subscriptionId = subscription.id;

  // find the org with the customer ID
  const organization = await prisma.organization.findFirst({
    where: {
      cloudConfig: {
        path: ["stripe", "activeSubscriptionId"],
        equals: subscriptionId,
      },
    },
  });
  if (!organization) {
    console.error("[Stripe Webhook] Organization not found");
    return;
  }

  // check subscription items
  console.log("subscription.items.data", subscription.items.data);

  if (!subscription.items.data || subscription.items.data.length !== 1) {
    console.error(
      "[Stripe Webhook] Subscription items not found or more than one",
    );
    return;
  }

  const subscriptionItem = subscription.items.data[0];
  const productId = subscriptionItem.price.product;

  if (!productId || typeof productId !== "string") {
    console.error("[Stripe Webhook] Product ID not found");
    Sentry.captureMessage("[Stripe Webhook] Product ID not found", {
      extra: {
        subscriptionItem,
      },
    });
    return;
  }

  // assert that no other product is already set on the org
  const parsedOrg = parseDbOrg(organization);
  if (
    parsedOrg.cloudConfig?.stripe?.activeProductId &&
    parsedOrg.cloudConfig?.stripe?.activeProductId !== productId
  ) {
    Sentry.captureMessage(
      "[Stripe Webhook] Another active product id already set on org",
      {
        extra: {
          cloudConfig: parsedOrg.cloudConfig,
          subscriptionItem,
        },
      },
    );
    return;
  }

  // update the cloud config with the product ID
  await prisma.organization.update({
    where: { id: organization.id },
    data: {
      cloudConfig: {
        ...parsedOrg.cloudConfig,
        stripe: {
          ...parsedOrg.cloudConfig?.stripe,
          ...CloudConfigSchema.shape.stripe.parse({
            activeProductId: productId,
          }),
        },
      },
    },
  });
  return;
}
