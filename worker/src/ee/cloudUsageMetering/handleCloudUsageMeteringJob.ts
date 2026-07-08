import { parseDbOrg, Prisma } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import Stripe from "stripe";
import { env } from "../../env";
import {
  CloudUsageMeteringQueue,
  CloudSpendAlertQueue,
  getObservationCountsByProjectInCreationInterval,
  getScoreCountsByProjectInCreationInterval,
  getTraceCountsByProjectInCreationInterval,
  logger,
} from "@langfuse/shared/src/server";
import {
  cloudUsageMeteringDbCronJobName,
  CloudUsageMeteringDbCronJobStates,
} from "./constants";
import {
  QueueJobs,
  recordIncrement,
  traceException,
} from "@langfuse/shared/src/server";
import { Job } from "bullmq";
import { backOff } from "exponential-backoff";

const delayFromStartOfInterval = 3600000 + 5 * 60 * 1000; // 5 minutes after the end of the interval

export const handleCloudUsageMeteringJob = async (job: Job) => {
  if (!env.STRIPE_SECRET_KEY) {
    logger.warn("[CLOUD USAGE METERING] Stripe secret key not found");
    throw new Error("Stripe secret key not found");
  }

  // Get cron job, create if it does not exist
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

  try {
    await prisma.cronJobs.update({
      where: {
        name: cloudUsageMeteringDbCronJobName,
        state: cron.state,
        jobStartedAt: cron.jobStartedAt,
      },
      data: {
        state: CloudUsageMeteringDbCronJobStates.Processing,
        jobStartedAt: new Date(),
      },
    });
  } catch (e) {
    logger.warn(
      "[CLOUD USAGE METERING] Failed to update cron job state, potential race condition, exiting",
      {
        e,
      },
    );
    return;
  }

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
      include: {
        projects: {
          select: {
            id: true,
          },
          where: {
            deletedAt: null,
          },
        },
        cloudSpendAlerts: {
          select: {
            id: true,
          },
        },
      },
    })
  ).map(({ projects, cloudSpendAlerts, ...org }) => ({
    ...parseDbOrg(org),
    projectIds: projects.map((p) => p.id),
    cloudSpendAlertIds: cloudSpendAlerts.map((a) => a.id),
  }));
  logger.info(
    `[CLOUD USAGE METERING] Job for ${organizations.length} organizations`,
  );

  const observationCountsByProject =
    await getObservationCountsByProjectInCreationInterval({
      start: meterIntervalStart,
      end: meterIntervalEnd,
    });
  const traceCountsByProject = await getTraceCountsByProjectInCreationInterval({
    start: meterIntervalStart,
    end: meterIntervalEnd,
  });
  const scoreCountsByProject = await getScoreCountsByProjectInCreationInterval({
    start: meterIntervalStart,
    end: meterIntervalEnd,
  });

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
      recordIncrement(
        "langfuse.queue.cloud_usage_metering_queue.skipped_orgs",
        1,
        {
          unit: "organizations",
        },
      );
      recordIncrement(
        "langfuse.queue.cloud_usage_metering_queue.skipped_orgs_with_errors",
        1,
        {
          unit: "organizations",
        },
      );
      continue;
    }

    // Observations (legacy)
    const countObservations = observationCountsByProject
      .filter((p) => org.projectIds.includes(p.projectId))
      .reduce((sum, p) => sum + p.count, 0);

    logger.info(
      `[CLOUD USAGE METERING] Job for org ${org.id} - ${stripeCustomerId} stripe customer id - ${countObservations} observations`,
    );
    if (countObservations > 0) {
      await backOff(
        async () =>
          await stripe.billing.meterEvents.create({
            event_name: "tracing_observations",
            timestamp: meterIntervalEnd.getTime() / 1000,
            payload: {
              stripe_customer_id: stripeCustomerId,
              value: countObservations.toString(), // value is a string in stripe
            },
          }),
        {
          numOfAttempts: 3,
        },
      );
    }

    // Events
    const countScores = scoreCountsByProject
      .filter((p) => org.projectIds.includes(p.projectId))
      .reduce((sum, p) => sum + p.count, 0);
    const countTraces = traceCountsByProject
      .filter((p) => org.projectIds.includes(p.projectId))
      .reduce((sum, p) => sum + p.count, 0);
    const countEvents = countScores + countTraces + countObservations;
    logger.info(
      `[CLOUD USAGE METERING] Job for org ${org.id} - ${stripeCustomerId} stripe customer id - ${countEvents} events`,
    );
    if (countEvents > 0) {
      // retrying the stripe call in case of an HTTP error
      await backOff(
        async () =>
          await stripe.billing.meterEvents.create({
            event_name: "tracing_events",
            timestamp: meterIntervalEnd.getTime() / 1000,
            payload: {
              stripe_customer_id: stripeCustomerId,
              value: countEvents.toString(), // value is a string in stripe
            },
          }),
        {
          numOfAttempts: 3,
        },
      );
    }

    if (countEvents === 0 && countObservations === 0) {
      recordIncrement(
        "langfuse.queue.cloud_usage_metering_queue.skipped_orgs",
        1,
        {
          unit: "organizations",
        },
      );
    }

    recordIncrement(
      "langfuse.queue.cloud_usage_metering_queue.processed_orgs",
      1,
      {
        unit: "organizations",
      },
    );
    recordIncrement(
      "langfuse.queue.cloud_usage_metering_queue.processed_observations",
      countObservations,
      {
        unit: "observations",
      },
    );
    recordIncrement(
      "langfuse.queue.cloud_usage_metering_queue.processed_events",
      countEvents,
      {
        unit: "events",
      },
    );
    countProcessedOrgs++;
    countProcessedObservations += countObservations;
    countProcessedEvents += countEvents;

    // Trigger spend alert job for orgs with activity and spend alerts configured
    if (org.cloudSpendAlertIds.length > 0) {
      if (countEvents > 0 || countObservations > 0) {
        try {
          await CloudSpendAlertQueue.getInstance()?.add(
            QueueJobs.CloudSpendAlertJob,
            { orgId: org.id },
            { delay: 5 * 60 * 1000 }, // 5 minutes delay
          );
          logger.info(
            `[CLOUD USAGE METERING] Enqueued spend alert job for org ${org.id} with 5min delay`,
          );
        } catch (error) {
          logger.error(
            `[CLOUD USAGE METERING] Failed to enqueue spend alert job for org ${org.id}`,
            { error },
          );
          // Don't fail the metering job if spend alert enqueueing fails
        }
      }
    }
  }

  // update cron job
  await prisma.cronJobs.update({
    where: { name: cloudUsageMeteringDbCronJobName },
    data: {
      lastRun: meterIntervalEnd,
      state: CloudUsageMeteringDbCronJobStates.Queued,
      jobStartedAt: null,
    },
  });

  logger.info(
    `[CLOUD USAGE METERING] Job for interval ${meterIntervalStart.toISOString()} - ${meterIntervalEnd.toISOString()} completed`,
    {
      countProcessedOrgs,
      countProcessedObservations,
      countProcessedEvents,
    },
  );

  if (meterIntervalEnd.getTime() + delayFromStartOfInterval < Date.now()) {
    logger.info(
      `[CLOUD USAGE METERING] Enqueueing next Cloud Usage Metering Job to catch up `,
    );
    recordIncrement(
      "langfuse.queue.cloud_usage_metering_queue.scheduled_catchup_jobs",
      1,
      {
        unit: "jobs",
      },
    );
    await CloudUsageMeteringQueue.getInstance()?.add(
      QueueJobs.CloudUsageMeteringJob,
      {},
    );
  }
};
