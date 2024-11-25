import { parseDbOrg, Prisma } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import Stripe from "stripe";
import { env } from "../../env";
import { CloudUsageMeteringQueue, logger } from "@langfuse/shared/src/server";
import {
  cloudUsageMeteringDbCronJobName,
  CloudUsageMeteringDbCronJobStates,
} from "./constants";
import {
  QueueJobs,
  recordGauge,
  traceException,
} from "@langfuse/shared/src/server";
import { Job } from "bullmq";

const delayFromStartOfInterval = 3600000 + 5 * 60 * 1000; // 5 minutes after the end of the interval

export const handleCloudUsageMeteringJob = async (job: Job) => {
  if (!env.STRIPE_SECRET_KEY) {
    logger.warn("[CLOUD USAGE METERING] Stripe secret key not found");
    throw new Error("Stripe secret key not found");
  }

  const cron = await prisma.cronJobs.upsert({
    where: { name: cloudUsageMeteringDbCronJobName },
    create: {
      name: cloudUsageMeteringDbCronJobName,
      state: CloudUsageMeteringDbCronJobStates.Queued,
      lastRun: new Date(Date.now() - ((Date.now() % 3600000) + 3600000)), // beginning of the last full hour
    },
    update: {},
  });
  if (!cron.lastRun) {
    logger.warn("[CLOUD USAGE METERING] Cron job last run not found");
    throw new Error("Cloud Usage Metering Cron Job last run not found");
  }
  if (cron.lastRun.getTime() % 3600000 !== 0) {
    logger.warn(
      "[CLOUD USAGE METERING] Cron job last run is not on the full hour",
    );
    throw new Error(
      "Cloud Usage Metering Cron Job last run is not on the full hour",
    );
  }
  if (cron.lastRun.getTime() + delayFromStartOfInterval > Date.now()) {
    logger.info(`[CLOUD USAGE METERING] Next Job is not due yet`);
    return;
  }

  if (cron.state === CloudUsageMeteringDbCronJobStates.Processing) {
    if (
      cron.jobStartedAt &&
      cron.jobStartedAt < new Date(Date.now() - 1200000)
    ) {
      logger.warn(
        "[CLOUD USAGE METERING] Last job started at is older than 20 minutes, retrying job",
      );
    } else {
      logger.warn("[CLOUD USAGE METERING] Job already in progress");
      return;
    }
  }

  await prisma.cronJobs.update({
    where: { name: cloudUsageMeteringDbCronJobName },
    data: {
      state: CloudUsageMeteringDbCronJobStates.Processing,
      jobStartedAt: new Date(),
    },
  });

  // timing
  const meterIntervalStart = cron.lastRun;
  const meterIntervalEnd = new Date(cron.lastRun.getTime() + 3600000);
  logger.info(
    `[CLOUD USAGE METERING] Job running for interval ${meterIntervalStart.toISOString()} - ${meterIntervalEnd.toISOString()}`,
  );

  // find all organizations which have a stripe org id set up
  const organizations = (
    await prisma.organization.findMany({
      where: {
        cloudConfig: {
          path: ["stripe", "customerId"],
          not: Prisma.DbNull,
        },
      },
    })
  ).map(parseDbOrg);
  logger.info(
    `[CLOUD USAGE METERING] Job for ${organizations.length} organizations`,
  );

  // setup stripe client
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);

  // for each org, calculate the meter and push to stripe
  let countProcessedOrgs = 0;
  let countProcessedObservations = 0;
  let countProcessedEvents = 0;
  for (const org of organizations) {
    // update progress to prevent job from being stalled
    job.updateProgress(countProcessedOrgs / organizations.length);

    const stripeCustomerId = org.cloudConfig?.stripe?.customerId;
    if (!stripeCustomerId) {
      // should not happen
      traceException(
        `[CLOUD USAGE METERING] Stripe customer id not found for org ${org.id}`,
      );
      logger.error(
        `[CLOUD USAGE METERING] Stripe customer id not found for org ${org.id}`,
      );
      continue;
    }

    // Observations (legacy)
    const countObservations = await prisma.observation.count({
      where: {
        project: {
          orgId: org.id,
        },
        createdAt: {
          gte: meterIntervalStart,
          lt: meterIntervalEnd,
        },
      },
    });
    logger.info(
      `[CLOUD USAGE METERING] Job for org ${org.id} - ${stripeCustomerId} stripe customer id - ${countObservations} observations`,
    );
    if (countObservations > 0) {
      await stripe.billing.meterEvents.create({
        event_name: "tracing_observations",
        timestamp: meterIntervalEnd.getTime() / 1000,
        payload: {
          stripe_customer_id: stripeCustomerId,
          value: countObservations.toString(), // value is a string in stripe
        },
      });
    }

    // Events
    const countScores = await prisma.score.count({
      where: {
        project: {
          orgId: org.id,
        },
        createdAt: {
          gte: meterIntervalStart,
          lt: meterIntervalEnd,
        },
      },
    });
    const countTraces = await prisma.trace.count({
      where: {
        project: {
          orgId: org.id,
        },
        createdAt: {
          gte: meterIntervalStart,
          lt: meterIntervalEnd,
        },
      },
    });
    const countEvents = countScores + countTraces + countObservations;
    logger.info(
      `[CLOUD USAGE METERING] Job for org ${org.id} - ${stripeCustomerId} stripe customer id - ${countEvents} events`,
    );
    if (countEvents > 0) {
      await stripe.billing.meterEvents.create({
        event_name: "tracing_events",
        timestamp: meterIntervalEnd.getTime() / 1000,
        payload: {
          stripe_customer_id: stripeCustomerId,
          value: countEvents.toString(), // value is a string in stripe
        },
      });
    }

    countProcessedOrgs++;
    countProcessedObservations += countObservations;
    countProcessedEvents += countEvents;
  }

  recordGauge("cloud_usage_metering_processed_orgs", countProcessedOrgs, {
    unit: "organizations",
  });
  recordGauge(
    "cloud_usage_metering_processed_observations",
    countProcessedObservations,
    {
      unit: "observations",
    },
  );
  recordGauge("cloud_usage_metering_processed_events", countProcessedEvents, {
    unit: "events",
  });

  // update cron job
  await prisma.cronJobs.update({
    where: { name: cloudUsageMeteringDbCronJobName },
    data: {
      lastRun: meterIntervalEnd,
      state: CloudUsageMeteringDbCronJobStates.Queued,
      jobStartedAt: null,
    },
  });

  if (meterIntervalEnd.getTime() + delayFromStartOfInterval < Date.now()) {
    logger.info(
      `[CLOUD USAGE METERING] Enqueueing next Cloud Usage Metering Job to catch up `,
    );
    recordGauge("cloud_usage_metering_scheduled_catchup_jobs", 1, {
      unit: "jobs",
    });
    await CloudUsageMeteringQueue.getInstance()?.add(
      QueueJobs.CloudUsageMeteringJob,
      {},
    );
  }
};
