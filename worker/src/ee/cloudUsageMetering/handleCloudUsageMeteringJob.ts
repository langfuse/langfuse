import { getBillingProvider, parseDbOrg, Prisma } from "@langfuse/shared";
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

// Stripe deduplicates meter events by identifier, so deriving it from the tuple
// that defines the billable fact makes a replayed interval idempotent instead of
// adding a second time to the customer's usage. The meter name is part of the key
// because both meters are reported for the same org and interval - without it the
// two would collide and Stripe would drop one of them.
const meterEventIdentifier = (
  eventName: string,
  orgId: string,
  intervalStart: Date,
) => `${eventName}:${orgId}:${intervalStart.getTime()}`;

// Stripe does not silently drop a meter event whose identifier it has already
// seen - it answers with a 400. Left to propagate, the first replayed org ends
// the whole run, and because `lastRun` only advances after the org loop the same
// interval is claimed again on the next tick: the replay the identifier was
// added to make harmless instead stalls metering outright.
const isDuplicateMeterEventError = (error: unknown): boolean => {
  const stripeError = error as
    | { statusCode?: unknown; rawType?: unknown; message?: unknown }
    | null
    | undefined;

  return (
    typeof stripeError === "object" &&
    stripeError !== null &&
    stripeError.statusCode === 400 &&
    stripeError.rawType === "invalid_request_error" &&
    typeof stripeError.message === "string" &&
    /already exists with identifier/i.test(stripeError.message)
  );
};

// Every other rejection still fails the job. Only the duplicate is safe to
// swallow, because the identifier is derived from the tuple that defines the
// billable fact, so Stripe already holding it is proof this usage was delivered.
const sendMeterEvent = async (
  stripe: Stripe,
  params: Stripe.Billing.MeterEventCreateParams,
) => {
  try {
    // retrying the stripe call in case of an HTTP error
    await backOff(async () => await stripe.billing.meterEvents.create(params), {
      numOfAttempts: 3,
      // Stripe returns `stripe-should-retry: false` on a duplicate, so retrying
      // only multiplies the rejection.
      retry: (e) => !isDuplicateMeterEventError(e),
    });
  } catch (e) {
    if (!isDuplicateMeterEventError(e)) {
      throw e;
    }

    // Skip only this meter event, not the rest of the organization. Both meters
    // are sent sequentially, so a run that died between them leaves one
    // delivered and the other missing - skipping the org here would under-bill
    // it for this interval for good.
    logger.info(
      `[CLOUD USAGE METERING] Stripe already holds meter event ${params.identifier}, skipping`,
    );
    recordIncrement(
      "langfuse.queue.cloud_usage_metering_queue.duplicate_meter_events",
      1,
      {
        unit: "events",
      },
    );
  }
};

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

  const jobStartedAt = new Date();
  try {
    await prisma.cronJobs.update({
      where: {
        name: cloudUsageMeteringDbCronJobName,
        state: cron.state,
        jobStartedAt: cron.jobStartedAt,
      },
      data: {
        state: CloudUsageMeteringDbCronJobStates.Processing,
        jobStartedAt,
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

    // Defensive guard: the org selection above keys on stripe.customerId,
    // which CHB-billed orgs never get (their `stripe` block stays empty).
    // If that invariant ever breaks, skip + count instead of double-metering —
    // CHB meters its orgs by polling our billing metrics API.
    if (
      getBillingProvider(org, {
        cutoff: env.LANGFUSE_CLOUD_BILLING_CHB_CUTOFF_DATE,
      }) !== "stripe"
    ) {
      traceException(
        `[CLOUD USAGE METERING] Org ${org.id} resolves to a non-Stripe billing provider but carries a Stripe customer id, skipping`,
      );
      logger.error(
        `[CLOUD USAGE METERING] Org ${org.id} resolves to a non-Stripe billing provider but carries a Stripe customer id, skipping`,
      );
      recordIncrement(
        "langfuse.queue.cloud_usage_metering_queue.skipped_non_stripe_orgs",
        1,
        {
          unit: "organizations",
        },
      );
      continue;
    }

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
      await sendMeterEvent(stripe, {
        event_name: "tracing_observations",
        identifier: meterEventIdentifier(
          "tracing_observations",
          org.id,
          meterIntervalStart,
        ),
        timestamp: meterIntervalEnd.getTime() / 1000,
        payload: {
          stripe_customer_id: stripeCustomerId,
          value: countObservations.toString(), // value is a string in stripe
        },
      });
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
      await sendMeterEvent(stripe, {
        event_name: "tracing_events",
        identifier: meterEventIdentifier(
          "tracing_events",
          org.id,
          meterIntervalStart,
        ),
        timestamp: meterIntervalEnd.getTime() / 1000,
        payload: {
          stripe_customer_id: stripeCustomerId,
          value: countEvents.toString(), // value is a string in stripe
        },
      });
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

  // Advance the cron job only while still holding the lease claimed above. The
  // stale-job takeover can hand this interval to another run mid-flight; without
  // the predicate a superseded run would still move lastRun forward and mask the
  // fact that another run owns the interval.
  try {
    await prisma.cronJobs.update({
      where: {
        name: cloudUsageMeteringDbCronJobName,
        state: CloudUsageMeteringDbCronJobStates.Processing,
        jobStartedAt,
      },
      data: {
        lastRun: meterIntervalEnd,
        state: CloudUsageMeteringDbCronJobStates.Queued,
        jobStartedAt: null,
      },
    });
  } catch (e) {
    logger.warn(
      "[CLOUD USAGE METERING] Job lease was taken over before completion, leaving cron state to the run that owns it now",
      { e },
    );
    recordIncrement(
      "langfuse.queue.cloud_usage_metering_queue.lost_job_lease",
      1,
      {
        unit: "jobs",
      },
    );
    // Returning rather than throwing keeps the queue wrapper from resetting the
    // state and replaying this interval on top of the run that took it over.
    return;
  }

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
