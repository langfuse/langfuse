import { logger } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { parseDbOrg } from "@langfuse/shared";
import Stripe from "stripe";
import { env } from "../../env";

const stripeClient = env.STRIPE_SECRET_KEY
  ? new Stripe(env.STRIPE_SECRET_KEY)
  : undefined;

/**
 * TECH DEBT: This function backfills billing cycle anchors for organizations.
 * TODO: Remove this function once all organizations have been backfilled
 *
 * Background:
 * - Organizations created before the billing cycle anchor feature need to be backfilled
 * - For hobby plan users: set anchor to organization createdAt
 * - For paid plan users: fetch from Stripe subscription and use billing_cycle_anchor
 *
 * This function should be removed once all existing organizations have been migrated.
 */
export async function backfillBillingCycleAnchors(): Promise<{
  total: number;
  backfilled: number;
  errors: number;
}> {
  const startTime = Date.now();
  logger.info("Starting billing cycle anchor backfill");

  try {
    // Find all organizations with null billingCycleAnchor
    const orgsToBackfill = await prisma.organization.findMany({
      where: {
        billingCycleAnchor: null,
      },
    });

    const total = orgsToBackfill.length;
    logger.info(`Found ${total} organizations to backfill`);

    if (total === 0) {
      return { total: 0, backfilled: 0, errors: 0 };
    }

    // Separate orgs by whether they have an active subscription
    const orgsWithoutSubscription: Array<{
      id: string;
      createdAt: Date;
    }> = [];
    const orgsWithSubscription: Array<{
      id: string;
      subscriptionId: string;
    }> = [];

    for (const org of orgsToBackfill) {
      const parsedOrg = parseDbOrg(org);
      const activeSubscriptionId =
        parsedOrg.cloudConfig?.stripe?.activeSubscriptionId;

      if (activeSubscriptionId) {
        orgsWithSubscription.push({
          id: org.id,
          subscriptionId: activeSubscriptionId,
        });
      } else {
        orgsWithoutSubscription.push({
          id: org.id,
          createdAt: org.createdAt,
        });
      }
    }

    logger.info(
      `Backfill breakdown: ${orgsWithoutSubscription.length} without subscription, ${orgsWithSubscription.length} with subscription`,
    );

    let backfilled = 0;
    let errors = 0;

    // Backfill orgs without subscription (use createdAt)
    for (const org of orgsWithoutSubscription) {
      try {
        await prisma.organization.update({
          where: { id: org.id },
          data: {
            billingCycleAnchor: org.createdAt,
          },
        });
        backfilled++;
        logger.debug(`Backfilled ${org.id} with createdAt: ${org.createdAt}`);
      } catch (error) {
        errors++;
        logger.error(`Failed to backfill ${org.id}`, {
          error,
          orgId: org.id,
        });
      }
    }

    // Backfill orgs with subscription (fetch from Stripe)
    if (orgsWithSubscription.length > 0) {
      if (!stripeClient) {
        logger.error(
          "Stripe client not available, skipping subscription-based backfill",
        );
        errors += orgsWithSubscription.length;
      } else {
        const result = await backfillFromStripe(
          stripeClient,
          orgsWithSubscription,
        );
        backfilled += result.backfilled;
        errors += result.errors;
      }
    }

    const duration = Date.now() - startTime;
    logger.info(
      `Billing cycle anchor backfill completed in ${duration}ms: ${backfilled}/${total} backfilled, ${errors} errors`,
    );

    return { total, backfilled, errors };
  } catch (error) {
    logger.error("Billing cycle anchor backfill failed", { error });
    throw error;
  }
}

/**
 * Backfill organizations with active subscriptions by fetching billing_cycle_anchor from Stripe
 */
async function backfillFromStripe(
  stripe: Stripe,
  orgs: Array<{ id: string; subscriptionId: string }>,
): Promise<{ backfilled: number; errors: number }> {
  let backfilled = 0;
  let errors = 0;

  // Process in batches with concurrency control
  const CONCURRENCY = 10;
  const batches: Array<Array<{ id: string; subscriptionId: string }>> = [];

  for (let i = 0; i < orgs.length; i += CONCURRENCY) {
    batches.push(orgs.slice(i, i + CONCURRENCY));
  }

  for (const batch of batches) {
    const results = await Promise.allSettled(
      batch.map((org) => backfillSingleOrgFromStripe(stripe, org)),
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value.success) {
        backfilled++;
      } else {
        errors++;
      }
    }
  }

  return { backfilled, errors };
}

/**
 * Backfill a single organization from Stripe with exponential backoff for rate limits
 */
async function backfillSingleOrgFromStripe(
  stripe: Stripe,
  org: { id: string; subscriptionId: string },
  attempt = 1,
  maxAttempts = 5,
): Promise<{ success: boolean }> {
  try {
    // Fetch subscription from Stripe
    const subscription = await stripe.subscriptions.retrieve(
      org.subscriptionId,
    );

    if (!subscription.billing_cycle_anchor) {
      logger.warn(
        `No billing_cycle_anchor found for subscription ${org.subscriptionId}`,
        {
          orgId: org.id,
          subscriptionId: org.subscriptionId,
        },
      );
      return { success: false };
    }

    // Convert unix timestamp (seconds) to Date
    const anchorDate = new Date(subscription.billing_cycle_anchor * 1000);

    // Update organization
    await prisma.organization.update({
      where: { id: org.id },
      data: {
        billingCycleAnchor: anchorDate,
      },
    });

    logger.debug(
      `Backfilled ${org.id} with billing_cycle_anchor from Stripe: ${anchorDate}`,
    );
    return { success: true };
  } catch (error: any) {
    const status = error?.statusCode || error?.status;
    const code = error?.code;

    // Handle rate limiting with exponential backoff
    if (attempt < maxAttempts && (status === 429 || code === "rate_limit")) {
      const delayMs = Math.min(500 * Math.pow(2, attempt - 1), 8000);
      logger.debug(
        `Rate limited while backfilling ${org.id}, retrying after ${delayMs}ms (attempt ${attempt}/${maxAttempts})`,
      );

      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return backfillSingleOrgFromStripe(stripe, org, attempt + 1, maxAttempts);
    }

    // Log and fail for other errors
    logger.error(`Failed to backfill ${org.id} from Stripe`, {
      error,
      orgId: org.id,
      subscriptionId: org.subscriptionId,
      attempt,
    });
    return { success: false };
  }
}
