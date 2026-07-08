import { Processor } from "bullmq";
import { logger } from "@langfuse/shared/src/server";
import { Prisma, prisma } from "@langfuse/shared/src/db";
import { env } from "../../env";
import Stripe from "stripe";
import { parseDbOrg } from "@langfuse/shared";

export const meteringDataPostgresExportProcessor: Processor =
  async (): Promise<void> => {
    logger.info(
      "[METERING POSTGRES EXPORT] Starting metering data Postgres export",
    );

    if (!env.STRIPE_SECRET_KEY) {
      logger.warn("[METERING POSTGRES EXPORT] Stripe secret key not found");
      throw new Error("Stripe secret key not found");
    }

    // setup stripe client
    const stripe = new Stripe(env.STRIPE_SECRET_KEY);

    const endTime = Math.floor(new Date().setUTCHours(0, 0, 0, 0) / 1000);
    const startTime = endTime - 100 * 24 * 60 * 60; // 100 days ago, stripe exports 100 days at a time

    const activeMeters = (await stripe.billing.meters.list()).data.filter(
      (meter) => meter.status === "active",
    );

    const billingOrganizations = (
      await prisma.organization.findMany({
        where: {
          cloudConfig: { not: Prisma.DbNull },
        },
      })
    )
      .map(parseDbOrg)
      .filter((org) => org.cloudConfig?.stripe?.customerId);

    logger.info(
      `[METERING POSTGRES EXPORT] Found ${activeMeters.length} meters and ${billingOrganizations.length} organizations`,
    );

    // purge all existing backups
    await prisma.billingMeterBackup.deleteMany();
    logger.debug("[METERING POSTGRES EXPORT] Deleted existing rows in table");

    for (const meter of activeMeters) {
      for (const org of billingOrganizations) {
        // type check
        const stripeCustomerId = org.cloudConfig?.stripe?.customerId;
        if (!stripeCustomerId) continue;

        try {
          const eventSummaries = await stripe.billing.meters.listEventSummaries(
            meter.id,
            {
              customer: stripeCustomerId,
              start_time: startTime,
              end_time: endTime,
              limit: 100,
              value_grouping_window: "day",
            },
          );

          await prisma.billingMeterBackup.createMany({
            data: eventSummaries.data.map((event) => ({
              orgId: org.id,
              meterId: meter.id,
              eventName: meter.event_name,
              stripeCustomerId,
              startTime: new Date(event.start_time * 1000),
              endTime: new Date(event.end_time * 1000),
              aggregatedValue: event.aggregated_value,
            })),
          });
        } catch (error) {
          logger.error(
            `[METERING POSTGRES EXPORT] Error exporting meter ${meter.id} for org ${org.id}: ${error}`,
          );
        }
      }
    }

    logger.info(
      "[METERING POSTGRES EXPORT] Finished metering data Postgres export",
    );
  };
