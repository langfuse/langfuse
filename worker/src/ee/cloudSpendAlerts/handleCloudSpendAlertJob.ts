import { parseDbOrg, Prisma, Role } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import Stripe from "stripe";
import { env } from "../../env";
import {
  CloudSpendAlertQueue,
  logger,
} from "@langfuse/shared/src/server";
import {
  cloudSpendAlertDbCronJobName,
  CloudSpendAlertDbCronJobStates,
} from "./constants";
import {
  QueueJobs,
  recordIncrement,
  traceException,
} from "@langfuse/shared/src/server";
import { Job } from "bullmq";
import { backOff } from "exponential-backoff";
import { sendCloudSpendAlertEmail } from "@langfuse/shared/src/server";

const delayFromMeteringJob = 5 * 60 * 1000; // 5 minutes after metering job completes

export const handleCloudSpendAlertJob = async (job: Job) => {
  if (!env.STRIPE_SECRET_KEY) {
    logger.warn("[CLOUD SPEND ALERTS] Stripe secret key not found");
    throw new Error("Stripe secret key not found");
  }

  // Get cron job, create if it does not exist
  const cron = await prisma.cronJobs.upsert({
    where: { name: cloudSpendAlertDbCronJobName },
    create: {
      name: cloudSpendAlertDbCronJobName,
      state: CloudSpendAlertDbCronJobStates.Queued,
      lastRun: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
    },
    update: {},
  });

  if (!cron.lastRun) {
    logger.warn("[CLOUD SPEND ALERTS] Cron job last run not found");
    throw new Error("Cloud Spend Alerts Cron Job last run not found");
  }

  // Check if it's too early to run (wait for metering job to complete)
  if (cron.lastRun.getTime() + delayFromMeteringJob > Date.now()) {
    logger.info(`[CLOUD SPEND ALERTS] Next Job is not due yet`);
    return;
  }

  if (cron.state === CloudSpendAlertDbCronJobStates.Processing) {
    if (
      cron.jobStartedAt &&
      cron.jobStartedAt < new Date(Date.now() - 1200000)
    ) {
      logger.warn(
        "[CLOUD SPEND ALERTS] Last job started at is older than 20 minutes, retrying job",
      );
    } else {
      logger.warn("[CLOUD SPEND ALERTS] Job already in progress");
      return;
    }
  }

  try {
    await prisma.cronJobs.update({
      where: {
        name: cloudSpendAlertDbCronJobName,
        state: cron.state,
        jobStartedAt: cron.jobStartedAt,
      },
      data: {
        state: CloudSpendAlertDbCronJobStates.Processing,
        jobStartedAt: new Date(),
      },
    });
  } catch (e) {
    logger.warn(
      "[CLOUD SPEND ALERTS] Failed to update cron job state, potential race condition, exiting",
      {
        e,
      },
    );
    return;
  }

  logger.info(`[CLOUD SPEND ALERTS] Job running`);

  // Find all organizations with active subscriptions and spend alerts
  const organizations = (
    await prisma.organization.findMany({
      where: {
        cloudConfig: {
          path: ["stripe", "customerId"],
          not: Prisma.DbNull,
        },
        cloudSpendAlerts: {
          some: {}, // Only orgs with spend alerts
        },
      },
      include: {
        cloudSpendAlerts: true,
      },
    })
  ).map(({ cloudSpendAlerts, ...org }) => ({
    ...parseDbOrg(org),
    spendAlerts: cloudSpendAlerts,
  }));

  logger.info(
    `[CLOUD SPEND ALERTS] Job for ${organizations.length} organizations with spend alerts`,
  );

  // Setup stripe client
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);

  // Process each organization
  let countProcessedOrgs = 0;
  let countTriggeredAlerts = 0;
  let countSkippedOrgs = 0;

  for (const org of organizations) {
    // Update progress to prevent job from being stalled
    job.updateProgress(countProcessedOrgs / organizations.length);

    const stripeCustomerId = org.cloudConfig?.stripe?.customerId;
    if (!stripeCustomerId) {
      traceException(
        `[CLOUD SPEND ALERTS] Stripe customer id not found for org ${org.id}`,
      );
      logger.error(
        `[CLOUD SPEND ALERTS] Stripe customer id not found for org ${org.id}`,
      );
      countSkippedOrgs++;
      continue;
    }

    try {
      // Get subscription to check billing cycle
      const subscriptions = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        status: "active",
        limit: 1,
      });

      if (subscriptions.data.length === 0) {
        logger.info(
          `[CLOUD SPEND ALERTS] No active subscription for org ${org.id}`,
        );
        countSkippedOrgs++;
        continue;
      }

      const subscription = subscriptions.data[0];
      const currentPeriodStart = new Date(subscription.current_period_start * 1000);

      // Get preview invoice to calculate current spend
      const previewInvoice = await backOff(
        async () =>
          await stripe.invoices.retrieveUpcoming({
            customer: stripeCustomerId,
          }),
        {
          numOfAttempts: 3,
        },
      );

      // Calculate current spend in USD
      const currentSpendCents = previewInvoice.total || 0;
      const currentSpendUSD = currentSpendCents / 100;

      logger.info(
        `[CLOUD SPEND ALERTS] Org ${org.id} current spend: $${currentSpendUSD}`,
      );

      // Check each spend alert for this org
      for (const alert of org.spendAlerts) {
        const thresholdUSD = parseFloat(alert.threshold.toString());

        // Check if threshold is breached
        if (currentSpendUSD >= thresholdUSD) {
          // Check if already triggered this billing cycle
          const alreadyTriggered =
            alert.triggeredAt &&
            alert.triggeredAt >= currentPeriodStart;

          if (!alreadyTriggered) {
            logger.info(
              `[CLOUD SPEND ALERTS] Triggering alert ${alert.id} for org ${org.id} - spend $${currentSpendUSD} >= threshold $${thresholdUSD}`,
            );

            // Get org admins and owners for email notifications
            const adminMemberships = await prisma.organizationMembership.findMany({
              where: {
                orgId: org.id,
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

            if (adminEmails.length > 0) {
              // Send email notifications
              await sendCloudSpendAlertEmail({
                env,
                orgId: org.id,
                orgName: org.name,
                alertTitle: alert.title,
                currentSpend: currentSpendUSD,
                threshold: thresholdUSD,
                recipients: adminEmails,
              });

              logger.info(
                `[CLOUD SPEND ALERTS] Sent alert emails to ${adminEmails.length} recipients for org ${org.id}`,
              );
            }

            // Update triggeredAt timestamp
            await prisma.cloudSpendAlert.update({
              where: { id: alert.id },
              data: { triggeredAt: new Date() },
            });

            countTriggeredAlerts++;
          } else {
            logger.debug(
              `[CLOUD SPEND ALERTS] Alert ${alert.id} for org ${org.id} already triggered this billing cycle`,
            );
          }
        } else {
          // Reset triggeredAt if we're in a new billing cycle and threshold is not breached
          if (
            alert.triggeredAt &&
            alert.triggeredAt < currentPeriodStart
          ) {
            await prisma.cloudSpendAlert.update({
              where: { id: alert.id },
              data: { triggeredAt: null },
            });
            logger.debug(
              `[CLOUD SPEND ALERTS] Reset alert ${alert.id} for org ${org.id} - new billing cycle`,
            );
          }
        }
      }

      recordIncrement(
        "langfuse.queue.cloud_spend_alert_queue.processed_orgs",
        1,
        {
          unit: "organizations",
        },
      );
      countProcessedOrgs++;
    } catch (error) {
      logger.error(
        `[CLOUD SPEND ALERTS] Error processing org ${org.id}`,
        { error, orgId: org.id },
      );
      traceException(
        `[CLOUD SPEND ALERTS] Error processing org ${org.id}: ${error}`,
      );
      recordIncrement(
        "langfuse.queue.cloud_spend_alert_queue.skipped_orgs_with_errors",
        1,
        {
          unit: "organizations",
        },
      );
      countSkippedOrgs++;
    }
  }

  // Update cron job
  await prisma.cronJobs.update({
    where: { name: cloudSpendAlertDbCronJobName },
    data: {
      lastRun: new Date(),
      state: CloudSpendAlertDbCronJobStates.Queued,
      jobStartedAt: null,
    },
  });

  logger.info(
    `[CLOUD SPEND ALERTS] Job completed`,
    {
      countProcessedOrgs,
      countTriggeredAlerts,
      countSkippedOrgs,
    },
  );

  recordIncrement(
    "langfuse.queue.cloud_spend_alert_queue.triggered_alerts",
    countTriggeredAlerts,
    {
      unit: "alerts",
    },
  );

  // Schedule next job if needed (daily check)
  const nextRunTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
  if (nextRunTime.getTime() < Date.now() + delayFromMeteringJob) {
    logger.info(
      `[CLOUD SPEND ALERTS] Enqueueing next Cloud Spend Alert Job`,
    );
    recordIncrement(
      "langfuse.queue.cloud_spend_alert_queue.scheduled_jobs",
      1,
      {
        unit: "jobs",
      },
    );
    await CloudSpendAlertQueue.getInstance()?.add(
      QueueJobs.CloudSpendAlertJob,
      {},
      {
        delay: 24 * 60 * 60 * 1000, // Run daily
      },
    );
  }
};