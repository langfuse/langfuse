import { logger } from "@langfuse/shared/src/server";
import { prisma, Prisma } from "@langfuse/shared/src/db";
import { parseDbOrg } from "@langfuse/shared";
import { createStripeAlert } from "../../../../web/src/ee/features/billing/server/stripeAlertService";

export const setupDefaultBillingAlerts = async () => {
  logger.info("Starting setupDefaultBillingAlerts script");

  const DEFAULT_THRESHOLD = 1000; // $1,000 default threshold
  const DEFAULT_CURRENCY = "USD";

  try {
    // Find organizations with active Stripe subscriptions but no billing alerts configured
    const organizations = await prisma.organization.findMany({
      where: {
        cloudConfig: {
          path: ["stripe", "activeSubscriptionId"],
          not: Prisma.AnyNull,
        },
        // Only process organizations that don't already have billing alerts
        NOT: {
          cloudConfig: {
            path: ["billingAlerts"],
            not: Prisma.AnyNull,
          },
        },
      },
    });

    logger.info(`Found ${organizations.length} organizations to process`);

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const org of organizations) {
      try {
        processed++;
        logger.info(
          `Processing organization ${org.id} (${processed}/${organizations.length})`,
        );

        const parsedOrg = parseDbOrg(org);
        const stripeCustomerId = parsedOrg.cloudConfig?.stripe?.customerId;

        if (!stripeCustomerId) {
          logger.warn(
            `Organization ${org.id} has no Stripe customer ID, skipping`,
          );
          continue;
        }

        // Create Stripe alert
        const stripeAlert = await createStripeAlert({
          customerId: stripeCustomerId,
          threshold: DEFAULT_THRESHOLD,
          meterId: STRIPE_METERS.TRACING_EVENTS,
          currency: DEFAULT_CURRENCY,
        });

        // Update organization with default billing alerts configuration
        const defaultBillingAlerts = {
          enabled: true,
          thresholdAmount: DEFAULT_THRESHOLD,
          currency: DEFAULT_CURRENCY,
          stripeAlertId: stripeAlert.id,
          notifications: {
            email: true,
            recipients: [],
          },
        };

        const updatedCloudConfig = {
          ...parsedOrg.cloudConfig,
          billingAlerts: defaultBillingAlerts,
        };

        await prisma.organization.update({
          where: {
            id: org.id,
          },
          data: {
            cloudConfig: updatedCloudConfig,
          },
        });

        succeeded++;
        logger.info(
          `Successfully set up billing alerts for organization ${org.id}`,
        );
      } catch (error) {
        failed++;
        logger.error(
          `Failed to set up billing alerts for organization ${org.id}`,
          {
            error,
            organizationId: org.id,
          },
        );
      }
    }

    logger.info(`setupDefaultBillingAlerts completed`, {
      total: organizations.length,
      processed,
      succeeded,
      failed,
    });

    return {
      total: organizations.length,
      processed,
      succeeded,
      failed,
    };
  } catch (error) {
    logger.error("setupDefaultBillingAlerts failed", { error });
    throw error;
  }
};

// If running directly (not imported), execute the script
if (require.main === module) {
  setupDefaultBillingAlerts()
    .then((result) => {
      console.log("Script completed successfully:", result);
      process.exit(0);
    })
    .catch((error) => {
      console.error("Script failed:", error);
      process.exit(1);
    });
}
