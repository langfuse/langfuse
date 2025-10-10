import { parseDbOrg, Role } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import Stripe from "stripe";
import { env } from "../../env";
import { logger } from "@langfuse/shared/src/server";
import { recordIncrement, traceException } from "@langfuse/shared/src/server";
import { Job } from "bullmq";
import { backOff } from "exponential-backoff";
import { sendCloudSpendAlertEmail } from "@langfuse/shared/src/server";

export const handleCloudSpendAlertJob = async (job: Job<{ orgId: string }>) => {
  const { orgId } = job.data;

  logger.info(`[CLOUD SPEND ALERTS] Processing org ${orgId}`);

  if (!env.STRIPE_SECRET_KEY) {
    logger.warn("[CLOUD SPEND ALERTS] Stripe secret key not found");
    throw new Error("Stripe secret key not found");
  }

  // Fetch organization with spend alerts
  const orgData = await prisma.organization.findFirst({
    where: {
      id: orgId,
    },
    include: {
      cloudSpendAlerts: true,
    },
  });

  if (!orgData) {
    logger.error(`[CLOUD SPEND ALERTS] Organization ${orgId} not found`);
    return;
  }

  const org = {
    ...parseDbOrg(orgData),
    spendAlerts: orgData.cloudSpendAlerts,
  };

  // Check if org has spend alerts configured
  if (org.spendAlerts.length === 0) {
    logger.info(`[CLOUD SPEND ALERTS] No spend alerts for org ${orgId}`);
    return;
  }

  if (org.cloudConfig?.plan === "Hobby") {
    // handle case where user has downgraded to hobby
    logger.info(
      `[CLOUD SPEND ALERTS] Org ${orgId} not entitled to spend alerts (plan: Hobby"})`,
    );
    return;
  }

  // Get Stripe customer ID
  const stripeCustomerId = org.cloudConfig?.stripe?.customerId;
  if (!stripeCustomerId) {
    logger.error(
      `[CLOUD SPEND ALERTS] Stripe customer id not found for org ${orgId}`,
    );
    traceException(
      `[CLOUD SPEND ALERTS] Stripe customer id not found for org ${orgId}`,
    );
    return;
  }
  // Get Stripe subscription ID
  const stripeSubscriptionId = org.cloudConfig?.stripe?.activeSubscriptionId;
  if (!stripeSubscriptionId) {
    logger.error(
      `[CLOUD SPEND ALERTS] Stripe subscription id not found for org ${orgId}`,
    );
    traceException(
      `[CLOUD SPEND ALERTS] Stripe subscription id not found for org ${orgId}`,
    );
    return;
  }

  // Setup stripe client
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);

  try {
    // Get subscription to check billing cycle
    const subscription =
      await stripe.subscriptions.retrieve(stripeSubscriptionId);

    const currentPeriodStart = new Date(
      subscription.current_period_start * 1000,
    );

    // Create preview invoice to calculate current spend
    const canCreateInvoicePreview = [
      "active",
      "past_due",
      "trialing",
      "unpaid",
    ].includes(subscription.status);

    if (!canCreateInvoicePreview) {
      logger.warn(
        `[CLOUD SPEND ALERTS] Cannot create invoice preview for org ${orgId} - subscription status: ${subscription.status}`,
      );
      return;
    }

    const previewInvoice = await backOff(
      async () =>
        await stripe.invoices.createPreview({
          customer:
            typeof subscription.customer === "string"
              ? subscription.customer
              : subscription.customer?.id,
          subscription: stripeSubscriptionId,
        }),
      {
        numOfAttempts: 3,
      },
    );

    // Calculate current spend in USD
    const currentSpendCents = previewInvoice.total ?? 0;
    const currentSpendUSD = currentSpendCents / 100;

    logger.info(
      `[CLOUD SPEND ALERTS] Org ${orgId} current spend: $${currentSpendUSD.toFixed(2)}`,
    );

    // Get org admins and owners for email notifications (fetch once for all alerts)
    const adminMemberships = await prisma.organizationMembership.findMany({
      where: {
        orgId: orgId,
        role: { in: [Role.OWNER, Role.ADMIN] },
      },
      include: {
        user: {
          select: { email: true },
        },
      },
    });

    const adminEmails = adminMemberships
      .map((m) => m.user?.email)
      .filter((email): email is string => Boolean(email));

    // Check each spend alert for this org
    for (const alert of org.spendAlerts) {
      const thresholdUSD = parseFloat(alert.threshold.toString());

      // Check if threshold is breached
      if (currentSpendUSD >= thresholdUSD) {
        // Check if already triggered this billing cycle
        const alreadyTriggered =
          alert.triggeredAt && alert.triggeredAt >= currentPeriodStart;

        if (!alreadyTriggered) {
          logger.info(
            `[CLOUD SPEND ALERTS] Triggering alert ${alert.id} for org ${orgId} - spend $${currentSpendUSD.toFixed(2)} >= threshold $${thresholdUSD.toFixed(2)}`,
          );

          const detectedAt = new Date();
          const detectedAtUtc = detectedAt.toISOString().replace(".000Z", "Z");
          if (adminEmails.length > 0) {
            try {
              // Send email notifications
              await sendCloudSpendAlertEmail({
                env,
                orgId: orgId,
                orgName: org.name,
                alertTitle: alert.title,
                currentSpend: currentSpendUSD,
                threshold: thresholdUSD,
                // casting due to cross-package type lag; property is supported in implementation
                detectedAtUtc,
                recipients: adminEmails,
              } as any);

              recordIncrement(
                "langfuse.queue.cloud_spend_alert_queue.emails_sent",
                1,
                { unit: "emails" },
              );

              logger.info(
                `[CLOUD SPEND ALERTS] Sent alert emails to ${adminEmails.length} recipients for org ${orgId}`,
              );
            } catch (e) {
              recordIncrement(
                "langfuse.queue.cloud_spend_alert_queue.email_failures",
                1,
                { unit: "emails" },
              );
              throw e;
            }
          }

          // Update triggeredAt timestamp (reuse detection time)
          await prisma.cloudSpendAlert.update({
            where: { id: alert.id },
            data: { triggeredAt: detectedAt },
          });

          recordIncrement(
            "langfuse.queue.cloud_spend_alert_queue.triggered_alerts",
            1,
            {
              unit: "alerts",
            },
          );
        } else {
          logger.debug(
            `[CLOUD SPEND ALERTS] Alert ${alert.id} for org ${orgId} already triggered this billing cycle`,
          );
        }
      }

      // Reset triggeredAt if we're in a new billing cycle and threshold is not breached
      if (
        currentSpendUSD < thresholdUSD &&
        alert.triggeredAt &&
        alert.triggeredAt < currentPeriodStart
      ) {
        await prisma.cloudSpendAlert.update({
          where: { id: alert.id },
          data: { triggeredAt: null },
        });
        logger.debug(
          `[CLOUD SPEND ALERTS] Reset alert ${alert.id} for org ${orgId} - new billing cycle`,
        );
      }
    }

    recordIncrement(
      "langfuse.queue.cloud_spend_alert_queue.processed_orgs",
      1,
      {
        unit: "organizations",
      },
    );

    logger.info(`[CLOUD SPEND ALERTS] Completed job for org ${orgId}`);
  } catch (error) {
    logger.error(`[CLOUD SPEND ALERTS] Error processing org ${orgId}`, {
      error,
      orgId,
    });
    traceException(
      `[CLOUD SPEND ALERTS] Error processing org ${orgId}: ${error}`,
    );
    recordIncrement(
      "langfuse.queue.cloud_spend_alert_queue.skipped_orgs_with_errors",
      1,
      {
        unit: "organizations",
      },
    );
    throw error; // Let BullMQ handle retry
  }
};
