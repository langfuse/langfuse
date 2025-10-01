import {
  getOrgIdFromStripeClientReference,
  isStripeClientReferenceFromCurrentCloudRegion,
} from "@/src/ee/features/billing/utils/stripeClientReference";
import { env } from "@/src/env.mjs";
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@langfuse/shared/src/db";
import { stripeClient } from "@/src/ee/features/billing/utils/stripe";
import type Stripe from "stripe";
import {
  CloudConfigSchema,
  InternalServerError,
  type Organization,
  parseDbOrg,
} from "@langfuse/shared";
import { traceException, redis, logger } from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { sendBillingAlertEmail } from "@langfuse/shared/src/server";
import { Role } from "@langfuse/shared";
import { UsageAlertService } from "@/src/ee/features/billing/server/usageAlertService";
import { type StripeSubscriptionMetadata } from "@/src/ee/features/billing/utils/stripeSubscriptionMetadata";

/**
 * Stripe webhook handler for managing subscription events, billing alerts, and invoice notifications.
 * This endpoint processes various Stripe events to keep the organization's billing state in sync.
 *
 * Supported events:
 * - customer.subscription.created: New subscription setup
 * - customer.subscription.updated: Plan changes and updates
 * - customer.subscription.deleted: Subscription cancellations
 * - invoice.created: Invoice generation and usage alert recreation
 * - billing.alert.triggered: Usage threshold notifications
 *
 * Security:
 * - Validates Stripe webhook signatures
 * - Ensures correct cloud region handling
 * - Maintains subscription metadata integrity
 *
 * @param req - Next.js request object containing the Stripe webhook event
 * @returns NextResponse with appropriate status and message
 */
export async function stripeWebhookHandler(req: NextRequest) {
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
    case "invoice.created":
      const invoiceData = event.data.object;
      logger.info("[Stripe Webhook] Start invoice.created", {
        payload: invoiceData,
      });
      await handleInvoiceCreated(invoiceData);
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

/**
 * Retrieves an organization by its Langfuse organization ID.
 */
async function getOrgById(orgId: string): Promise<Organization | null> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
  });
  return org;
}

/**
 * Retrieves an organization based on its Stripe customer ID.
 */
async function getOrgBasedOnCustomerId(
  customerId: string,
): Promise<Organization | null> {
  const org = await prisma.organization.findFirst({
    where: {
      cloudConfig: {
        path: ["stripe", "customerId"],
        equals: customerId,
      },
    },
  });
  return org;
}

/**
 * Retrieves an organization based on its active Stripe subscription ID.
 * This is the primary method for finding organizations with existing subscriptions.
 *
 * @param subscriptionId - The Stripe subscription ID to look up
 * @returns The organization with the matching subscription ID, or null if not found
 */
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

/**
 * Fallback method to find an organization using the checkout session attached to a subscription.
 * Used primarily for new subscriptions where the subscription ID hasn't been saved to the org yet.
 *
 * Process:
 * 1. Retrieves the checkout session linked to the subscription
 * 2. Extracts the client reference ID (contains org ID)
 * 3. Validates the cloud region matches
 * 4. Looks up the organization
 *
 * @param subscriptionId - The Stripe subscription ID to look up
 * @returns The organization associated with the checkout session, or null if not found
 */
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

/**
 * Resolve the organization for a given subscription using layered fallbacks:
 * 1) by active subscription id
 * 2) by Stripe customer id
 * 3) by checkout session attached to the subscription
 * 4) by subscription.metadata.orgId (last, because there might be a mismatch)
 * Returns parsed org or null if not found (caller should log/return).
 */
async function getOrgForSubscriptionWithFallbacks(
  subscription: Stripe.Subscription,
) {
  const subscriptionId = subscription.id;

  // 1) by active subscription id
  let organization = await getOrgBasedOnActiveSubscriptionId(subscriptionId);
  if (organization) {
    return parseDbOrg(organization);
  }

  // 2) by Stripe customer id
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;
  if (customerId) {
    organization = await getOrgBasedOnCustomerId(customerId);
    if (organization) {
      return parseDbOrg(organization);
    }
  }

  // 3) by checkout session attached to the subscription
  organization =
    await getOrgBasedOnCheckoutSessionAttachedToSubscription(subscriptionId);
  if (organization) {
    return parseDbOrg(organization);
  }

  // 4) by metadata.orgId
  const metadataOrgId = subscription.metadata?.orgId;
  if (metadataOrgId) {
    organization = await getOrgById(metadataOrgId);
    if (organization) {
      return parseDbOrg(organization);
    }
  }

  logger.error(
    `[Stripe Webhook] getOrgForSubscriptionWithFallbacks: Organization not found for subscription ${subscriptionId}`,
  );
  traceException(
    `[Stripe Webhook] getOrgForSubscriptionWithFallbacks: Organization not found for subscription ${subscriptionId}`,
  );
  return null;
}

/**
 * Ensures that required metadata (orgId and cloudRegion) is set on a Stripe subscription.
 * This is crucial for multi-region support and proper organization tracking.
 *
 * If metadata is missing:
 * 1. Attempts to find the organization using subscription ID
 * 2. Falls back to checkout session lookup if needed
 * 3. Updates the subscription with the correct metadata
 *
 * @param subscription - The Stripe subscription object to check/update
 * @returns The updated subscription with metadata, or undefined if org not found
 * @throws {InternalServerError} If cloud region is not set or Stripe client is missing
 */
async function ensureMetadataIsSetOnStripeSubscription(
  subscription: Stripe.Subscription,
) {
  if (subscription.metadata?.orgId && subscription.metadata?.cloudRegion) {
    return;
  }
  const currentEnvironment = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;

  if (!currentEnvironment) {
    traceException(
      "[Stripe Webhook] NEXT_PUBLIC_LANGFUSE_CLOUD_REGION is not set but webhook is running",
    );
    throw new InternalServerError(
      "[Stripe Webhook] NEXT_PUBLIC_LANGFUSE_CLOUD_REGION is not set but webhook is running",
    ); // we throw here because this should really never happen
  }

  if (!stripeClient) {
    traceException("[Stripe Webhook] Stripe client not found");
    throw new InternalServerError("[Stripe Webhook] Stripe client not found"); // we throw here because this should really never happen
  }

  try {
    const parsedOrg = await getOrgForSubscriptionWithFallbacks(subscription);
    if (!parsedOrg) {
      // Note: all our production environments receive all webhooks from Stripe.
      // Only one should handle the webhook; it is expected in 2/3 cases the organization is not found.
      logger.info(
        `[Stripe Webhook] (${currentEnvironment}) ensureMetadataIsSetOnStripeSubscription: Organization not found for subscription ${subscription.id} in Environment  ${currentEnvironment}`,
      );
      return;
    }
    logger.info(
      `[Stripe Webhook]  (${currentEnvironment}) ensureMetadataIsSetOnStripeSubscription: Organization for subscription ${subscription.id} found in Environment  ${currentEnvironment}`,
    );

    const metadata: StripeSubscriptionMetadata = {
      orgId: parsedOrg.id,
      cloudRegion: currentEnvironment,
    };

    await stripeClient.subscriptions.update(subscription.id, {
      metadata: metadata,
    });

    return await stripeClient.subscriptions.retrieve(subscription.id);
  } catch (err) {
    // we don't throw here, because there are legit reasons why this might fail. We don't want stripe to keep retrying.
    logger.error(
      "[Stripe Webhook] ensureMetadataIsSetOnStripeSubscription error",
      err,
    );
    traceException(
      "[Stripe Webhook] ensureMetadataIsSetOnStripeSubscription error",
    );
    return;
  }
}

async function handleSubscriptionChanged(
  subscription: Stripe.Subscription,
  action: "created" | "deleted" | "updated",
) {
  const currentEnvironment = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;

  if (!currentEnvironment) {
    traceException(
      `[Stripe Webhook] NEXT_PUBLIC_LANGFUSE_CLOUD_REGION is not set but webhook received event subscription.${action}`,
    );
    throw new InternalServerError(
      `[Stripe Webhook] NEXT_PUBLIC_LANGFUSE_CLOUD_REGION is not set but webhook received event subscription.${action}`, // we throw here because this should really never happen
    );
  }

  const subscriptionMetadata: StripeSubscriptionMetadata = {
    orgId: subscription.metadata?.orgId,
    cloudRegion: subscription.metadata?.cloudRegion,
  };

  if (!subscriptionMetadata.cloudRegion) {
    const updatedSubscription =
      await ensureMetadataIsSetOnStripeSubscription(subscription);

    subscriptionMetadata.orgId = updatedSubscription?.metadata?.orgId;
    subscriptionMetadata.cloudRegion =
      updatedSubscription?.metadata?.cloudRegion;
  }

  if (subscriptionMetadata.cloudRegion !== currentEnvironment) {
    logger.info(
      `[Stripe Webhook] (${currentEnvironment}) handleSubscriptionChanged: Skipping subscription.${action} for ${subscription.id} because cloud region mismatch.`,
    );
    return;
  }

  logger.info(
    `[Stripe Webhook] (${currentEnvironment}) handleSubscriptionChanged: Handle subscription.${action} for ${subscription.id} because cloud region matches.`,
  );

  const subscriptionId = subscription.id;

  const parsedOrg = await getOrgForSubscriptionWithFallbacks(subscription);
  if (!parsedOrg) {
    logger.error(
      `[Stripe Webhook] (${currentEnvironment}) Organization not found for subscription ${subscriptionId}`,
    );
    traceException(
      `[Stripe Webhook] (${currentEnvironment}) Organization not found for subscription ${subscriptionId}`,
    );
    return;
  }

  if (
    parsedOrg.cloudConfig?.stripe?.activeSubscriptionId &&
    parsedOrg.cloudConfig?.stripe?.activeSubscriptionId !== subscriptionId
  ) {
    logger.error(
      `[Stripe Webhook] (${currentEnvironment}) Another active subscription id already set on org`,
    );
    traceException(
      `[Stripe Webhook] (${currentEnvironment}) Another active subscription id already set on org`,
    );
    return;
  }

  const stripeCustomerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;

  if (
    parsedOrg.cloudConfig?.stripe?.customerId &&
    parsedOrg.cloudConfig?.stripe?.customerId !== stripeCustomerId
  ) {
    logger.error(
      `[Stripe Webhook] (${currentEnvironment}) Another customer id already set on org`,
    );
    traceException(
      `[Stripe Webhook] (${currentEnvironment}) Another customer id already set on org`,
    );
    return;
  }

  if (
    subscription.metadata?.orgId &&
    subscription.metadata?.orgId !== parsedOrg.id
  ) {
    logger.warn(
      `[Stripe Webhook] (${currentEnvironment}) Organization ID mismatch in subscription metadata for subscription ${subscriptionId} (orgId: ${parsedOrg.id}, metadataOrgId: ${subscription.metadata?.orgId})`,
    );
  }

  // check subscription items
  const items = subscription.items?.data ?? [];

  if (!items || items.length === 0) {
    logger.error(
      `[Stripe Webhook] (${currentEnvironment}) No subscription items found`,
    );
    traceException(
      `[Stripe Webhook] (${currentEnvironment}) No subscription items found`,
    );
    return;
  }

  // Note: To support both the old billing and the new billing, we need want to get the product id
  // of the associated plan (core, pro, team), not the usage product id.
  // -> New Setup: 2 products exist; Filter for the one with the non-usage price as the active product
  // -> Old Setup: 1 product exists; Use the first item as the active product
  const planProductItem =
    items.length == 1
      ? items[0]
      : items.find((it) => {
          return it.price && it.price.recurring?.usage_type !== "metered";
        });
  const productId = planProductItem?.price.product;

  const usageProductItem =
    items.length == 1
      ? null // legacy setup; Set to null, so we can distinguish from the new setup
      : items.find((it) => {
          return it.price && it.price.recurring?.usage_type === "metered";
        });
  const usageProductId = usageProductItem?.price.product;

  if (!productId || typeof productId !== "string") {
    logger.error(
      `[Stripe Webhook] (${currentEnvironment}) Product ID not found`,
    );
    traceException(
      `[Stripe Webhook] (${currentEnvironment}) Product ID not found`,
    );
    return;
  }

  // assert that no other product is already set on the org if this is not an update
  if (
    action !== "updated" &&
    parsedOrg.cloudConfig?.stripe?.activeProductId &&
    parsedOrg.cloudConfig?.stripe?.activeProductId !== productId
  ) {
    logger.error(
      `[Stripe Webhook] (${currentEnvironment}) Another active product id already set on (one of the) org with this active subscription id`,
    );
    traceException(
      `[Stripe Webhook] (${currentEnvironment}) Another active product id already set on (one of the) org with this active subscription id`,
    );

    return;
  }

  // update the cloud config with the product ID (do not persist cancellation/schedule info)
  if (action === "created" || action === "updated") {
    const updatedCloudConfig = {
      ...parsedOrg.cloudConfig,
      stripe: {
        ...parsedOrg.cloudConfig?.stripe,
        ...CloudConfigSchema.shape.stripe.parse({
          activeProductId: productId,
          activeUsageProductId: usageProductId,
          activeSubscriptionId: subscriptionId,
          customerId: stripeCustomerId,
        }),
      },
    };

    await prisma.organization.update({
      where: {
        id: parsedOrg.id,
      },
      data: {
        cloudConfig: updatedCloudConfig,
      },
    });

    void auditLog({
      session: {
        user: { id: "stripe-webhook" },
        orgId: parsedOrg.id,
      },
      orgId: parsedOrg.id,
      resourceType: "organization",
      resourceId: parsedOrg.id,
      action: `BillingService.subscription.${action}`,
      before: parsedOrg.cloudConfig,
      after: updatedCloudConfig,
    });
  } else if (action === "deleted") {
    const updatedCloudConfig = {
      ...parsedOrg.cloudConfig,
      stripe: {
        ...parsedOrg.cloudConfig?.stripe,
        ...CloudConfigSchema.shape.stripe.parse({
          customerId: stripeCustomerId,
          activeProductId: undefined,
          activeSubscriptionId: undefined,
          activeUsageProductId: undefined,
        }),
      },
    };

    await prisma.organization.update({
      where: {
        id: parsedOrg.id,
      },
      data: {
        cloudConfig: updatedCloudConfig,
      },
    });

    void auditLog({
      session: {
        user: { id: "stripe-webhook" },
        orgId: parsedOrg.id,
      },
      orgId: parsedOrg.id,
      resourceType: "organization",
      resourceId: parsedOrg.id,
      action: "BillingService.subscription.deleted",
      before: parsedOrg.cloudConfig,
      after: updatedCloudConfig,
    });
  }

  // need to update the plan in the api keys
  await new ApiAuthService(prisma, redis).invalidateOrgApiKeys(parsedOrg.id);

  return;
}

async function handleBillingAlertTriggered(
  alertData: Stripe.Billing.AlertTriggered,
) {
  try {
    // Find organization by Stripe customer ID
    const customerId = alertData.customer;
    if (!customerId) {
      logger.error("[Stripe Webhook] No customer ID found in usage alert");
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
      logger.warn(
        "[Stripe Webhook] Organization not found for customer ID - Potentially received the webhook on wrong environment",
        {
          customerId,
        },
      );
      return;
    }

    const parsedOrg = parseDbOrg(organization);
    const usageAlerts = parsedOrg.cloudConfig?.usageAlerts;

    if (!usageAlerts || !usageAlerts.enabled) {
      logger.info(
        "[Stripe Webhook] Usage alerts not enabled for organization",
        {
          orgId: organization.id,
        },
      );
      return;
    }

    // Extract usage information from alert data
    const usageAmount = alertData.value;
    const threshold = usageAlerts.threshold;

    // Send email notifications if enabled
    if (usageAlerts.notifications.email) {
      await sendBillingAlertNotifications({
        organization,
        usageAlerts,
        usageAmount,
        threshold,
        alertId: alertData.alert.id,
      });
    }

    logger.info("[Stripe Webhook] Usage alert triggered successfully", {
      organizationId: organization.id,
      organizationName: organization.name,
      usageAmount,
      threshold,
      alertId: alertData.alert.id,
    });
  } catch (error) {
    logger.error("[Stripe Webhook] Error processing usage alert", {
      error,
      alertId: alertData.alert.id,
    });
    traceException("[Stripe Webhook] Error processing usage alert");
  }
}

async function sendBillingAlertNotifications({
  organization,
  usageAlerts,
  usageAmount,
  threshold,
  alertId,
}: {
  organization: Organization;
  usageAlerts: NonNullable<
    ReturnType<typeof parseDbOrg>["cloudConfig"]
  >["usageAlerts"];
  usageAmount: number;
  threshold: number;
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
    if (usageAlerts?.notifications.recipients) {
      usageAlerts.notifications.recipients.forEach((email) => {
        recipients.add(email);
      });
    }

    // Generate URLs
    const billingUrl = `${env.NEXTAUTH_URL}/organization/${organization.id}/settings/billing`;

    // Send email to all recipients
    const emailPromises = Array.from(recipients).map(async (email) => {
      try {
        await sendBillingAlertEmail({
          env,
          organizationName: organization.name,
          currentUsage: usageAmount,
          threshold,
          billingUrl,
          receiverEmail: email,
        });

        logger.info("[Stripe Webhook] Usage alert email sent", {
          organizationId: organization.id,
          recipientEmail: email,
          alertId,
        });
      } catch (error) {
        logger.error("[Stripe Webhook] Failed to send usage alert email", {
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
    logger.error("[Stripe Webhook] Error sending usage alert notifications", {
      organizationId: organization.id,
      alertId,
      error,
    });
  }
}

/**
 * Whenever a stripe invoice is created, we recreate the usage alert.
 * This is necessary, because usage alerts trigger only once globally and with this setup,
 * we can ensure that they trigger once per billing period.
 * @param invoice
 */
async function handleInvoiceCreated(invoice: Stripe.Invoice): Promise<void> {
  try {
    // Find organization by Stripe customer ID
    const customerId =
      typeof invoice.customer === "string"
        ? invoice.customer
        : invoice.customer?.id;
    if (!customerId) {
      logger.error(
        "[Stripe Webhook] No customer ID found in invoice created event",
      );
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
      logger.warn(
        "[Stripe Webhook] Organization not found for customer ID - Potentially received the webhook on wrong environment",
        {
          customerId,
        },
      );
      return;
    }

    const parsedOrg = parseDbOrg(organization);
    const usageAlerts = parsedOrg.cloudConfig?.usageAlerts;

    if (!usageAlerts || !usageAlerts.enabled) {
      logger.info(
        "[Stripe Webhook] Usage alerts not enabled for organization - skipping recreation",
        {
          orgId: organization.id,
        },
      );
      return;
    }

    const updatedAlert = await UsageAlertService.getInstance({
      stripeClient,
    }).recreate({
      orgId: parsedOrg.id,
      customerId: customerId,
      meterId: usageAlerts.meterId,
      existingAlertId: usageAlerts.alertId,
      amount: usageAlerts.threshold,
    });
    // We can use ! here as we'd never reach this point if the fields are undefined
    parsedOrg.cloudConfig!.usageAlerts!.alertId = updatedAlert.id;

    await prisma.organization.update({
      where: {
        id: parsedOrg.id,
      },
      data: {
        cloudConfig: parsedOrg.cloudConfig!,
      },
    });

    void auditLog({
      session: {
        user: { id: "stripe-webhook" },
        orgId: parsedOrg.id,
      },
      orgId: parsedOrg.id,
      resourceType: "organization",
      resourceId: parsedOrg.id,
      action: "BillingService.usageAlerts.recreate",
      before: parsedOrg.cloudConfig,
      after: parsedOrg.cloudConfig!,
    });
    logger.info(
      `[Stripe Webhook] Recreated usage alert for ${parsedOrg.id} after invoice creation`,
      {
        orgId: parsedOrg.id,
        alertId: updatedAlert.id,
      },
    );
  } catch (error) {
    logger.error("[Stripe Webhook] Error handling invoice created", {
      error,
      invoiceId: invoice.id,
    });
    traceException("[Stripe Webhook] Error handling invoice created");
  }
}
