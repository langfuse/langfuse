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
import { sendBillingAlertEmail } from "@langfuse/shared/src/server/services/email/billingAlert/sendBillingAlertEmail";
import { Role } from "@langfuse/shared";
import { createStripeAlert } from "./stripeAlertService";
import { STRIPE_METERS } from "../utils/stripeProducts";

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
    case "billing.alert.triggered":
      const alertData = event.data.object;
      logger.info("[Stripe Webhook] Start billing.alert.triggered", {
        payload: alertData,
      });
      await handleBillingAlertTriggered(alertData);
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
    let updatedCloudConfig = {
      ...parsedOrg.cloudConfig,
      stripe: {
        ...parsedOrg.cloudConfig?.stripe,
        ...CloudConfigSchema.shape.stripe.parse({
          activeProductId: productId,
          activeSubscriptionId: subscriptionId,
          customerId: customerId,
        }),
      },
    };

    // Set up default billing alerts for new subscriptions
    if (action === "created" && !parsedOrg.cloudConfig?.billingAlerts) {
      try {
        const stripeAlert = await createStripeAlert({
          customerId: customerId,
          threshold: 10000, // $10,000 default threshold
          meterId: STRIPE_METERS.TRACING_EVENTS,
          currency: "USD",
        });

        updatedCloudConfig.billingAlerts = {
          enabled: true,
          thresholdAmount: 10000,
          currency: "USD",
          stripeAlertId: stripeAlert.id,
          notifications: {
            email: true,
            recipients: [],
          },
        };

        logger.info(
          "[Stripe Webhook] Created default billing alert for new subscription",
          {
            organizationId: parsedOrg.id,
            stripeAlertId: stripeAlert.id,
          },
        );
      } catch (error) {
        logger.error(
          "[Stripe Webhook] Failed to create default billing alert",
          {
            organizationId: parsedOrg.id,
            error,
          },
        );
      }
    }

    await prisma.organization.update({
      where: {
        id: parsedOrg.id,
      },
      data: {
        cloudConfig: updatedCloudConfig,
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

async function handleBillingAlertTriggered(alertData: Stripe.Billing.Alert) {
  try {
    // Find organization by Stripe customer ID
    const customerId = alertData.filter?.customer;
    if (!customerId) {
      logger.error("[Stripe Webhook] No customer ID found in billing alert");
      return;
    }

    const organization = await prisma.organization.findFirst({
      where: {
        cloudConfig: {
          path: ["stripe", "customerId"],
          equals: customerId,
        },
      },
    });

    if (!organization) {
      logger.error("[Stripe Webhook] Organization not found for customer ID", {
        customerId,
      });
      return;
    }

    const parsedOrg = parseDbOrg(organization);
    const billingAlerts = parsedOrg.cloudConfig?.billingAlerts;

    if (!billingAlerts || !billingAlerts.enabled) {
      logger.info(
        "[Stripe Webhook] Billing alerts not enabled for organization",
        {
          organizationId: organization.id,
        },
      );
      return;
    }

    // Extract usage information from alert data
    const usageAmount = alertData.usage_threshold_config?.gte || 0;
    const threshold = billingAlerts.thresholdAmount;
    const currency = billingAlerts.currency || "USD";

    // Send email notifications if enabled
    if (billingAlerts.notifications.email) {
      await sendBillingAlertNotifications({
        organization,
        billingAlerts,
        usageAmount,
        threshold,
        currency,
        alertId: alertData.id,
      });
    }

    logger.info("[Stripe Webhook] Billing alert triggered", {
      organizationId: organization.id,
      organizationName: organization.name,
      usageAmount,
      threshold,
      currency,
      alertId: alertData.id,
    });

    // Update lastTriggeredAt timestamp
    const updatedBillingAlerts = {
      ...billingAlerts,
      lastTriggeredAt: new Date(),
    };

    const updatedCloudConfig = {
      ...parsedOrg.cloudConfig,
      billingAlerts: updatedBillingAlerts,
    };

    await prisma.organization.update({
      where: {
        id: organization.id,
      },
      data: {
        cloudConfig: updatedCloudConfig,
      },
    });

    logger.info("[Stripe Webhook] Billing alert processed successfully", {
      organizationId: organization.id,
      alertId: alertData.id,
    });
  } catch (error) {
    logger.error("[Stripe Webhook] Error processing billing alert", {
      error,
      alertId: alertData.id,
    });
    traceException("[Stripe Webhook] Error processing billing alert");
  }
}

async function sendBillingAlertNotifications({
  organization,
  billingAlerts,
  usageAmount,
  threshold,
  currency,
  alertId,
}: {
  organization: Organization;
  billingAlerts: NonNullable<
    ReturnType<typeof parseDbOrg>["cloudConfig"]
  >["billingAlerts"];
  usageAmount: number;
  threshold: number;
  currency: string;
  alertId: string;
}) {
  try {
    // Get organization admins and owners
    const adminMembers = await prisma.organizationMembership.findMany({
      where: {
        orgId: organization.id,
        role: {
          in: [Role.ADMIN, Role.OWNER],
        },
      },
      include: {
        user: {
          select: {
            email: true,
          },
        },
      },
    });

    // Collect all recipients
    const recipients = new Set<string>();

    // Add admin/owner emails
    adminMembers.forEach((member) => {
      if (member.user.email) {
        recipients.add(member.user.email);
      }
    });

    // Add additional recipients from settings
    if (billingAlerts?.notifications.recipients) {
      billingAlerts.notifications.recipients.forEach((email) => {
        recipients.add(email);
      });
    }

    // Mock usage breakdown for now (in production, this would come from actual usage data)
    const usageBreakdown = {
      traces: Math.floor(usageAmount * 0.2), // 20% traces
      observations: Math.floor(usageAmount * 0.7), // 70% observations
      scores: Math.floor(usageAmount * 0.1), // 10% scores
    };

    // Generate URLs
    const dashboardUrl = `${env.NEXTAUTH_URL}/organization/${organization.id}/settings/billing`;
    const manageAlertsUrl = `${env.NEXTAUTH_URL}/organization/${organization.id}/settings/billing`;

    // Get billing period info (mock for now)
    const billingPeriod = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    // Send email to all recipients
    const emailPromises = Array.from(recipients).map(async (email) => {
      try {
        await sendBillingAlertEmail({
          organizationName: organization.name,
          currentUsage: usageAmount,
          threshold,
          currency,
          billingPeriod,
          usageBreakdown,
          dashboardUrl,
          manageAlertsUrl,
          receiverEmail: email,
        });

        logger.info("[Stripe Webhook] Billing alert email sent", {
          organizationId: organization.id,
          recipientEmail: email,
          alertId,
        });
      } catch (error) {
        logger.error("[Stripe Webhook] Failed to send billing alert email", {
          organizationId: organization.id,
          recipientEmail: email,
          alertId,
          error,
        });
      }
    });

    await Promise.all(emailPromises);

    logger.info("[Stripe Webhook] Billing alert notifications sent", {
      organizationId: organization.id,
      recipientCount: recipients.size,
      alertId,
    });
  } catch (error) {
    logger.error("[Stripe Webhook] Error sending billing alert notifications", {
      organizationId: organization.id,
      alertId,
      error,
    });
  }
}
