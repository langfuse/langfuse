import { parseDbOrg, Prisma } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import Stripe from "stripe";
import { env } from "../../env";
import logger from "../../logger";
import {
  cloudUsageMeteringDbCronJobName,
  CloudUsageMeteringDbCronJobStates,
} from "./constants";
import { cloudUsageMeteringQueue } from "../../queues/cloudUsageMeteringQueue";
import {
  QueueJobs,
  recordGauge,
  traceException,
} from "@langfuse/shared/src/server";
import { Job } from "bullmq";

const delayFromStartOfInterval = 3600000 + 5 * 60 * 1000; // 5 minutes after the end of the interval

export const handleCloudUsageMeteringJob = async (job: Job) => {
  if (!env.STRIPE_SECRET_KEY) {
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
    throw new Error("Cloud Usage Metering Cron Job last run not found");
  }
  if (cron.lastRun.getTime() % 3600000 !== 0) {
    throw new Error(
      "Cloud Usage Metering Cron Job last run is not on the full hour"
    );
  }
  if (cron.lastRun.getTime() + delayFromStartOfInterval > Date.now()) {
    logger.info(`Next Cloud Usage Metering Job is not due yet`);
    return;
  }

  if (cron.state === CloudUsageMeteringDbCronJobStates.Processing) {
    if (
      cron.jobStartedAt &&
      cron.jobStartedAt < new Date(Date.now() - 1200000)
    ) {
      logger.warn(
        "Last cloud usage metering job started at is older than 20 minutes, retrying job"
      );
    } else {
      logger.warn("Cloud Usage Metering Job already in progress");
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
    `Cloud Usage Metering Job running for interval ${meterIntervalStart.toISOString()} - ${meterIntervalEnd.toISOString()}`
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
    `Cloud Usage Metering Job for ${organizations.length} organizations`
  );

  // setup stripe client
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);

  // for each org, calculate the meter and push to stripe
  let countProcessedOrgs = 0;
  let countProcessedObservations = 0;
  for (const org of organizations) {
    // update progress to prevent job from being stalled
    job.updateProgress(countProcessedOrgs / organizations.length);

    const stripeCustomerId = org.cloudConfig?.stripe?.customerId;
    if (!stripeCustomerId) {
      // should not happen
      traceException(`Stripe customer id not found for org ${org.id}`);
      logger.error(`Stripe customer id not found for org ${org.id}`);
      continue;
    }

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
      `Cloud Usage Metering Job for org ${org.id} - ${stripeCustomerId} stripe customer id - ${countObservations} observations`
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

    countProcessedOrgs++;
    countProcessedObservations += countObservations;
  }

  recordGauge("cloud_usage_metering_processed_orgs", countProcessedOrgs, {
    unit: "organizations",
  });
  recordGauge(
    "cloud_usage_metering_processed_observations",
    countProcessedObservations,
    {
      unit: "observations",
    }
  );

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
    logger.info(`Enqueueing next Cloud Usage Metering Job to catch up `);
    recordGauge("cloud_usage_metering_scheduled_catchup_jobs", 1, {
      unit: "jobs",
    });
    await cloudUsageMeteringQueue?.add(QueueJobs.CloudUsageMeteringJob, {});
  }
};
