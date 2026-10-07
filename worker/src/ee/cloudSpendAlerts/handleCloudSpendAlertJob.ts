import { getBillingProvider, parseDbOrg, Role } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import Stripe from "stripe";
import { env } from "../../env";
import {
  CHB_USAGE_CURRENCY,
  ChbApiError,
  chbBillUsageAmountUSD,
  logger,
} from "@langfuse/shared/src/server";
import { recordIncrement, traceException } from "@langfuse/shared/src/server";
import { Job } from "bullmq";
import { backOff } from "exponential-backoff";
import { sendCloudSpendAlertEmail } from "@langfuse/shared/src/server";

import { getChbApiClient } from "./chbApiClient";

/**
 * Why a spend reading was unavailable. Every reason is a configuration or
 * lifecycle state the job cannot act on, never an error — the org is counted
 * and skipped so a gap in alerting is visible without paging.
 */
type MissingBillingConfigReason =
  | "missing_stripe_customer_id"
  | "missing_stripe_subscription_id"
  | "missing_chb_organization_id"
  | "missing_chb_attached_plan"
  | "chb_not_configured"
  | "chb_open_bill_not_found"
  | "missing_chb_usage_amount"
  | "missing_chb_period_start";

const recordMissingBillingConfigSkip = (reason: MissingBillingConfigReason) => {
  recordIncrement(
    "langfuse.queue.cloud_spend_alert_queue.skipped_orgs_missing_billing_config",
    1,
    {
      unit: "organizations",
      reason,
    },
  );
};

/**
 * What both providers have to produce for an alert to be evaluated: the spend
 * accrued so far and the start of the period it accrued in. The period start is
 * not decoration — it is what makes an alert fire once per cycle instead of on
 * every run, and what resets it when the next cycle opens.
 */
type SpendReading = {
  currentSpendUSD: number;
  currentPeriodStart: Date;
};

type OrgWithAlerts = ReturnType<typeof parseDbOrg>;

/** Stripe's reading: the total of the subscription's preview invoice. */
const readStripeSpend = async (
  org: OrgWithAlerts,
): Promise<SpendReading | null> => {
  const stripeSecretKey = env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    // A Stripe-billed org in a deployment without a Stripe key is a
    // misconfiguration, not a state to skip past: throw so the job retries and
    // the failure stays visible.
    logger.warn("[CLOUD SPEND ALERTS] Stripe secret key not found");
    throw new Error("Stripe secret key not found");
  }

  const stripeCustomerId = org.cloudConfig?.stripe?.customerId;
  if (!stripeCustomerId) {
    logger.warn(
      `[CLOUD SPEND ALERTS] Stripe customer id not found for org ${org.id}`,
    );
    recordMissingBillingConfigSkip("missing_stripe_customer_id");
    return null;
  }
  const stripeSubscriptionId = org.cloudConfig?.stripe?.activeSubscriptionId;
  if (!stripeSubscriptionId) {
    logger.warn(
      `[CLOUD SPEND ALERTS] Stripe subscription id not found for org ${org.id}`,
    );
    recordMissingBillingConfigSkip("missing_stripe_subscription_id");
    return null;
  }

  const stripe = new Stripe(stripeSecretKey);

  // Get subscription to check billing cycle
  const subscription =
    await stripe.subscriptions.retrieve(stripeSubscriptionId);

  // Create preview invoice to calculate current spend
  const canCreateInvoicePreview = [
    "active",
    "past_due",
    "trialing",
    "unpaid",
  ].includes(subscription.status);

  if (!canCreateInvoicePreview) {
    logger.warn(
      `[CLOUD SPEND ALERTS] Cannot create invoice preview for org ${org.id} - subscription status: ${subscription.status}`,
    );
    return null;
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

  return {
    // Stripe reports invoice totals in minor units.
    currentSpendUSD: (previewInvoice.total ?? 0) / 100,
    currentPeriodStart: new Date(subscription.current_period_start * 1000),
  };
};

/**
 * CHB's reading: the accrued usage on the org's open bill. This is the CHB
 * equivalent of Stripe's preview invoice — CHB issues no preview invoice, but
 * its billing warehouse reports what the open bill has accrued so far, in
 * major-unit USD (see `chbBillUsageAmountUSD`). The warehouse, not m3ter,
 * serves this read, which is what makes hourly polling affordable on CHB's
 * side; the price is a reading up to one warehouse export old.
 */
const readClickhouseSpend = async (
  org: OrgWithAlerts,
): Promise<SpendReading | null> => {
  const chOrganizationId = org.cloudConfig?.clickhouse?.organizationId;
  if (!chOrganizationId) {
    logger.warn(
      `[CLOUD SPEND ALERTS] ClickHouse organization id not found for org ${org.id}`,
    );
    recordMissingBillingConfigSkip("missing_chb_organization_id");
    return null;
  }
  if (!org.cloudConfig?.clickhouse?.attachedPlanId) {
    // Cancelled or never subscribed: nothing accrues, so nothing to alert on.
    logger.info(
      `[CLOUD SPEND ALERTS] Org ${org.id} has no CHB attached plan, skipping`,
    );
    recordMissingBillingConfigSkip("missing_chb_attached_plan");
    return null;
  }

  const client = getChbApiClient();
  if (!client) {
    logger.warn(
      `[CLOUD SPEND ALERTS] CHB REST client is not configured, cannot read spend for org ${org.id}`,
    );
    recordMissingBillingConfigSkip("chb_not_configured");
    return null;
  }

  const bills = await backOff(
    async () =>
      await client.queryBills({ chOrganizationIds: [chOrganizationId] }),
    {
      numOfAttempts: 3,
      // A 4xx is CHB's verdict on the request, not a blip: retrying it just
      // spends the budget. 5xx and transport failures still get the retries.
      retry: (error: unknown) =>
        !(
          error instanceof ChbApiError &&
          error.status >= 400 &&
          error.status < 500
        ),
    },
  );

  const bill = bills.find(
    (candidate) => candidate.organizationId === chOrganizationId,
  );
  if (!bill) {
    // CHB leaves an org without an open bill out of the result: its plan ended
    // after the fan-out read it, or it is newer than the warehouse's last
    // export. Either way nothing has accrued that we could compare.
    logger.info(
      `[CLOUD SPEND ALERTS] CHB reports no open bill for org ${org.id}, skipping`,
    );
    recordMissingBillingConfigSkip("chb_open_bill_not_found");
    return null;
  }

  // Logged raw as well as converted: this is the one place the major-unit
  // reading of CHB's amount is observable in production, so a contract change
  // shows up here rather than as alerts that quietly stop matching reality.
  logger.info(
    `[CLOUD SPEND ALERTS] Org ${org.id} CHB bill ${bill.id} reports accrued usage ${bill.usage?.amount} ${bill.usage?.currency ?? CHB_USAGE_CURRENCY} as of ${bill.usage?.asOf} for period ${bill.startDate} - ${bill.endDate}`,
  );

  const currentSpendUSD = chbBillUsageAmountUSD(bill);
  if (currentSpendUSD === null) {
    logger.warn(
      `[CLOUD SPEND ALERTS] CHB reported no usable ${CHB_USAGE_CURRENCY} usage amount for org ${org.id}, skipping`,
    );
    recordMissingBillingConfigSkip("missing_chb_usage_amount");
    return null;
  }

  const periodStart = bill.startDate ? new Date(bill.startDate) : null;
  if (!periodStart || Number.isNaN(periodStart.getTime())) {
    // Without a period start an alert cannot be held to once per cycle, and
    // every run past the threshold would email the org's admins again.
    logger.warn(
      `[CLOUD SPEND ALERTS] CHB reported no usable period start for org ${org.id}, skipping`,
    );
    recordMissingBillingConfigSkip("missing_chb_period_start");
    return null;
  }

  return { currentSpendUSD, currentPeriodStart: periodStart };
};

export const handleCloudSpendAlertJob = async (job: Job<{ orgId: string }>) => {
  const { orgId } = job.data;

  logger.info(`[CLOUD SPEND ALERTS] Processing org ${orgId}`);

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

  // Which provider bills this org decides where its accrued spend is read
  // from. A CHB org has no Stripe subscription to preview, and a Stripe org is
  // unknown to CHB, so this is a hard fork rather than a fallback chain.
  const billingProvider = getBillingProvider(org, {
    cutoff: env.LANGFUSE_CLOUD_BILLING_CHB_CUTOFF_DATE,
  });

  try {
    const spend =
      billingProvider === "clickhouse"
        ? await readClickhouseSpend(org)
        : await readStripeSpend(org);

    // The reader already logged why and counted the skip.
    if (!spend) return;

    const { currentSpendUSD, currentPeriodStart } = spend;

    logger.info(
      `[CLOUD SPEND ALERTS] Org ${orgId} current spend: $${currentSpendUSD.toFixed(2)} (provider: ${billingProvider})`,
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
              billing_provider: billingProvider,
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
        billing_provider: billingProvider,
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
