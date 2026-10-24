import { type Plan } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";

import { auditLog } from "@/src/features/audit-logs/server";
import { mapStripeProductIdToPlan } from "@/src/ee/features/billing/utils/stripeCatalogue";

/**
 * Seeding of the default spend alerts a paid organization starts out with.
 *
 * Provider-neutral on purpose: both webhooks call in here with a resolved plan,
 * so a CHB-billed org gets the same starting thresholds a Stripe-billed one
 * does. Which provider then evaluates them is the spend-alert job's business.
 */

type PlanWithoutSpendAlerts =
  | "oss"
  | "cloud:hobby"
  | "self-hosted:pro"
  | "self-hosted:enterprise";

type PlanWithSpendAlerts = Exclude<Plan, PlanWithoutSpendAlerts>;

/**
 * Both providers report spend including the plan's base fee, so each threshold
 * has to sit well above that fee to leave room for usage. Otherwise the alert
 * fires at the start of every billing period.
 */
const DEFAULT_SPEND_ALERT_THRESHOLDS: Record<PlanWithSpendAlerts, number> = {
  "cloud:core": 200,
  "cloud:pro": 1000,
  "cloud:team": 1500,
  "cloud:enterprise": 5000,
};

// Universal threshold added on top of the plan-specific one, for plans whose
// plan threshold is below it
const UNIVERSAL_SPEND_ALERT_THRESHOLD = 4000;

/** Which webhook is seeding, for the audit actor and the log prefix. */
export type SpendAlertSource = "stripe" | "clickhouse";

const logPrefixes: Record<SpendAlertSource, string> = {
  stripe: "[Stripe Webhook]",
  clickhouse: "[CHB Webhook]",
};

export async function createDefaultSpendAlerts({
  orgId,
  plan,
  source,
}: {
  orgId: string;
  plan: Plan;
  source: SpendAlertSource;
}) {
  const logPrefix = logPrefixes[source];

  const planThreshold =
    DEFAULT_SPEND_ALERT_THRESHOLDS[plan as PlanWithSpendAlerts];
  if (!planThreshold) {
    logger.error(
      `${logPrefix} createDefaultSpendAlerts: No spend alerts configured for plan ${plan}, skipping`,
    );
    return;
  }

  // Skip if org already has spend alerts (idempotency / don't overwrite user-configured alerts)
  const existingAlerts = await prisma.cloudSpendAlert.findFirst({
    where: { orgId },
    select: { id: true },
  });
  if (existingAlerts) {
    logger.info(
      `${logPrefix} createDefaultSpendAlerts: Org ${orgId} already has spend alerts, skipping`,
    );
    return;
  }

  // Create plan-specific alert plus the universal $4K alert when it is higher
  const thresholds =
    planThreshold < UNIVERSAL_SPEND_ALERT_THRESHOLD
      ? [planThreshold, UNIVERSAL_SPEND_ALERT_THRESHOLD]
      : [planThreshold];

  for (const threshold of thresholds) {
    const alert = await prisma.cloudSpendAlert.create({
      data: {
        orgId,
        title: `Default Spend alert ($${threshold})`,
        threshold,
      },
    });

    await auditLog({
      session: {
        user: { id: `${source}-webhook` },
        orgId,
      },
      orgId,
      resourceType: "cloudSpendAlert",
      resourceId: alert.id,
      action: "create",
      after: alert,
    });

    logger.info(
      `${logPrefix} createDefaultSpendAlerts: Created default alert over $${threshold} for org ${orgId} on plan ${plan}`,
    );
  }
}

/** Stripe's entry point: it knows the subscription's product, not the plan. */
export async function createDefaultSpendAlertsForStripeProduct({
  orgId,
  productId,
}: {
  orgId: string;
  productId: string;
}) {
  const plan = mapStripeProductIdToPlan(productId);
  if (!plan) {
    logger.error(
      `[Stripe Webhook] createDefaultSpendAlerts: Unknown product ID ${productId}, skipping`,
    );
    return;
  }

  await createDefaultSpendAlerts({ orgId, plan, source: "stripe" });
}
