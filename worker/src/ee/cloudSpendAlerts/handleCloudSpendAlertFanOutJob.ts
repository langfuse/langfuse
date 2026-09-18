import { Prisma, prisma } from "@langfuse/shared/src/db";
import {
  CloudSpendAlertQueue,
  logger,
  QueueJobs,
  recordIncrement,
} from "@langfuse/shared/src/server";

import { isChbConfigured } from "./chbApiClient";

/**
 * Hourly trigger for ClickHouse-billed organizations' spend alerts.
 *
 * Stripe-billed orgs get theirs from the usage metering job, which enqueues a
 * per-org alert job after pushing the hour's meter events. That job iterates
 * orgs by Stripe customer id, so it never sees a CHB org — CHB meters by
 * polling our metrics API instead, and there is no corresponding local loop.
 * This fan-out is that loop: it finds CHB orgs with alerts configured and
 * enqueues one evaluation job each.
 *
 * Scoped to CHB orgs on purpose. Stripe orgs are already covered, and
 * including them here would double their preview-invoice calls.
 */
export const handleCloudSpendAlertFanOutJob = async () => {
  if (!isChbConfigured()) {
    // A Stripe-only deployment still runs this schedule; there is simply
    // nothing for it to do.
    logger.debug(
      "[CLOUD SPEND ALERTS] CHB is not configured, nothing to fan out",
    );
    return;
  }

  const orgs = await prisma.organization.findMany({
    where: {
      // Carrying an attached plan is what makes an org CHB-billed and paying.
      // A cancelled org keeps `clickhouse.organizationId` but loses this.
      cloudConfig: {
        path: ["clickhouse", "attachedPlanId"],
        not: Prisma.DbNull,
      },
      cloudSpendAlerts: { some: {} },
    },
    select: { id: true },
  });

  if (orgs.length === 0) {
    logger.debug(
      "[CLOUD SPEND ALERTS] No ClickHouse-billed orgs with spend alerts",
    );
    return;
  }

  logger.info(
    `[CLOUD SPEND ALERTS] Fanning out to ${orgs.length} ClickHouse-billed organizations`,
  );

  const queue = CloudSpendAlertQueue.getInstance();
  if (!queue) {
    logger.error(
      "[CLOUD SPEND ALERTS] Spend alert queue unavailable, cannot fan out",
    );
    return;
  }

  let enqueued = 0;
  for (const org of orgs) {
    try {
      await queue.add(QueueJobs.CloudSpendAlertJob, { orgId: org.id });
      enqueued += 1;
    } catch (error) {
      // One org failing to enqueue must not cost the rest their hour.
      logger.error(
        `[CLOUD SPEND ALERTS] Failed to enqueue spend alert job for org ${org.id}`,
        error,
      );
    }
  }

  recordIncrement(
    "langfuse.queue.cloud_spend_alert_queue.fanned_out_orgs",
    enqueued,
    { unit: "organizations" },
  );
};
