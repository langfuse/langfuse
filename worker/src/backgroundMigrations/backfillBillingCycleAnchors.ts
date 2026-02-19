import { IBackgroundMigration } from "./IBackgroundMigration";
import { logger } from "@langfuse/shared/src/server";
import { parseArgs } from "node:util";
import { prisma } from "@langfuse/shared/src/db";
import { parseDbOrg } from "@langfuse/shared";
import Stripe from "stripe";
import { env } from "../env";

const stripeClient = env.STRIPE_SECRET_KEY
  ? new Stripe(env.STRIPE_SECRET_KEY)
  : undefined;

/**
 * Background migration to backfill billing cycle anchors for organizations.
 *
 * Background:
 * - Organizations created before the billing cycle anchor feature need to be backfilled
 * - For hobby plan users: set anchor to organization createdAt
 * - For paid plan users: fetch from Stripe subscription and use billing_cycle_anchor
 *
 * This migration is idempotent and can be safely re-run if interrupted.
 */
export default class BackfillBillingCycleAnchors
  implements IBackgroundMigration
{
  private isAborted = false;

  async validate(
    _args: Record<string, unknown>,
  ): Promise<{ valid: boolean; invalidReason: string | undefined }> {
    // If not in cloud environment, validation passes (will skip in run())
    if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
      logger.info(
        "[Background Migration] Not in cloud environment, migration will be skipped",
      );
      return { valid: true, invalidReason: undefined };
    }

    // In cloud environment: Stripe is required
    if (!env.STRIPE_SECRET_KEY) {
      return {
        valid: false,
        invalidReason:
          "Migration requires Stripe integration in cloud environment (STRIPE_SECRET_KEY not set)",
      };
    }

    // Check that the required column exists in the database
    try {
      const columnCheck = await prisma.$queryRaw<
        Array<{ column_name: string }>
      >`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'organizations'
        AND column_name = 'cloud_billing_cycle_anchor'
      `;

      if (columnCheck.length === 0) {
        return {
          valid: false,
          invalidReason:
            "Required column 'cloud_billing_cycle_anchor' does not exist in organizations table. Please run database migrations first.",
        };
      }
    } catch (error) {
      logger.error(
        "[Background Migration] Failed to check for required columns",
        { error },
      );
      return {
        valid: false,
        invalidReason: `Failed to verify database schema: ${error}`,
      };
    }

    return { valid: true, invalidReason: undefined };
  }

  async run(args: Record<string, unknown>): Promise<void> {
    const startTime = Date.now();
    logger.info(
      `[Background Migration] Starting billing cycle anchor backfill with args: ${JSON.stringify(args)}`,
    );

    // Skip if not in cloud environment (graceful skip, not an error)
    if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
      logger.info(
        "[Background Migration] Not in cloud environment, skipping migration",
      );
      return;
    }

    try {
      // Find all organizations with null cloudBillingCycleAnchor
      const orgsToBackfill = await prisma.organization.findMany({
        where: {
          cloudBillingCycleAnchor: null,
        },
      });

      const total = orgsToBackfill.length;
      logger.info(
        `[Background Migration] Found ${total} organizations to backfill`,
      );

      if (total === 0) {
        logger.info(
          "[Background Migration] No organizations to backfill, migration complete",
        );
        return;
      }

      // Check for abort signal
      if (this.isAborted) {
        logger.info(
          "[Background Migration] Migration aborted before processing",
        );
        return;
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
        `[Background Migration] Backfill breakdown: ${orgsWithoutSubscription.length} without subscription, ${orgsWithSubscription.length} with subscription`,
      );

      let backfilled = 0;
      let errors = 0;

      // Backfill orgs without subscription (use createdAt)
      for (const org of orgsWithoutSubscription) {
        // Check for abort signal
        if (this.isAborted) {
          logger.info(
            `[Background Migration] Migration aborted after processing ${backfilled} organizations`,
          );
          return;
        }

        try {
          await prisma.organization.update({
            where: { id: org.id },
            data: {
              cloudBillingCycleAnchor: org.createdAt,
            },
          });
          backfilled++;
          logger.debug(
            `[Background Migration] Backfilled ${org.id} with createdAt: ${org.createdAt}`,
          );
        } catch (error) {
          errors++;
          logger.error(`[Background Migration] Failed to backfill ${org.id}`, {
            error,
            orgId: org.id,
          });
        }
      }

      // Backfill orgs with subscription (fetch from Stripe)
      if (orgsWithSubscription.length > 0) {
        if (!stripeClient) {
          logger.error(
            "[Background Migration] Stripe client not available, skipping subscription-based backfill",
          );
          errors += orgsWithSubscription.length;
        } else {
          const result = await this.backfillFromStripe(
            stripeClient,
            orgsWithSubscription,
          );
          backfilled += result.backfilled;
          errors += result.errors;
        }
      }

      const duration = Date.now() - startTime;
      logger.info(
        `[Background Migration] Billing cycle anchor backfill completed in ${duration}ms: ${backfilled}/${total} backfilled, ${errors} errors`,
      );
    } catch (error) {
      logger.error(
        "[Background Migration] Billing cycle anchor backfill failed",
        {
          error,
        },
      );
      throw error;
    }
  }

  async abort(): Promise<void> {
    logger.info(
      "[Background Migration] Aborting BackfillBillingCycleAnchors migration",
    );
    this.isAborted = true;
  }

  /**
   * Backfill organizations with active subscriptions by fetching billing_cycle_anchor from Stripe
   */
  private async backfillFromStripe(
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
      // Check for abort signal
      if (this.isAborted) {
        logger.info(
          `[Background Migration] Migration aborted during Stripe backfill after ${backfilled} organizations`,
        );
        return { backfilled, errors };
      }

      const results = await Promise.allSettled(
        batch.map((org) => this.backfillSingleOrgFromStripe(stripe, org)),
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
  private async backfillSingleOrgFromStripe(
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
          `[Background Migration] No billing_cycle_anchor found for subscription ${org.subscriptionId}`,
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
          cloudBillingCycleAnchor: anchorDate,
        },
      });

      logger.debug(
        `[Background Migration] Backfilled ${org.id} with billing_cycle_anchor from Stripe: ${anchorDate}`,
      );
      return { success: true };
    } catch (error: any) {
      const status = error?.statusCode || error?.status;
      const code = error?.code;

      // Handle rate limiting with exponential backoff
      if (attempt < maxAttempts && (status === 429 || code === "rate_limit")) {
        const delayMs = Math.min(500 * Math.pow(2, attempt - 1), 8000);
        logger.debug(
          `[Background Migration] Rate limited while backfilling ${org.id}, retrying after ${delayMs}ms (attempt ${attempt}/${maxAttempts})`,
        );

        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return this.backfillSingleOrgFromStripe(
          stripe,
          org,
          attempt + 1,
          maxAttempts,
        );
      }

      // Log and fail for other errors
      logger.error(
        `[Background Migration] Failed to backfill ${org.id} from Stripe`,
        {
          error,
          orgId: org.id,
          subscriptionId: org.subscriptionId,
          attempt,
        },
      );
      return { success: false };
    }
  }
}

async function main() {
  const args = parseArgs({
    options: {},
  });

  const migration = new BackfillBillingCycleAnchors();
  const { valid, invalidReason } = await migration.validate(args.values);

  if (!valid) {
    logger.error(`[Background Migration] Validation failed: ${invalidReason}`);
    throw new Error(`Validation failed: ${invalidReason}`);
  }

  await migration.run(args.values);
}

// If the script is being executed directly (not imported), run the main function
if (require.main === module) {
  main()
    .then(() => {
      logger.info("[Background Migration] Migration completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      logger.error(
        `[Background Migration] Migration execution failed: ${error}`,
      );
      process.exit(1); // Exit with an error code
    });
}
