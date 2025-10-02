import { prisma } from "@langfuse/shared/src/db";
import { logger, recordGauge } from "@langfuse/shared/src/server";
import {
  usageThresholdDbCronJobName,
  UsageThresholdDbCronJobStates,
} from "./constants";
import { Job } from "bullmq";
import { processUsageAggregationForAllOrgs } from "./usageAggregation";
import { backfillBillingCycleAnchors } from "./backfillBillingCycleAnchors";

export const handleCloudFreeTierUsageThresholdJob = async (job: Job) => {
  // TECH DEBT: Backfill billing cycle anchors for organizations without one
  // TODO: Remove this call once all organizations have been backfilled (target: Q2 2025)
  let backfillTotal = 0;
  let backfillSuccessful = 0;
  let backfillErrors = 0;

  try {
    const backfillResult = await backfillBillingCycleAnchors();
    backfillTotal = backfillResult.total;
    backfillSuccessful = backfillResult.backfilled;
    backfillErrors = backfillResult.errors;
  } catch (error) {
    // Log but don't fail the job - backfill is not critical
    logger.error(
      "[USAGE THRESHOLDS] Failed to backfill billing cycle anchors",
      { error },
    );
  }

  // Get cron job, create if it does not exist
  const cron = await prisma.cronJobs.upsert({
    where: { name: usageThresholdDbCronJobName },
    create: {
      name: usageThresholdDbCronJobName,
      state: UsageThresholdDbCronJobStates.Queued,
      lastRun: null,
    },
    update: {},
  });

  // Check if job is already processing
  if (cron.state === UsageThresholdDbCronJobStates.Processing) {
    if (
      cron.jobStartedAt &&
      cron.jobStartedAt < new Date(Date.now() - 1200000) // 20 minutes
    ) {
      logger.warn(
        "[USAGE THRESHOLDS] Last job started at is older than 20 minutes, retrying job",
      );
    } else {
      logger.warn("[USAGE THRESHOLDS] Job already in progress");
      return;
    }
  }

  // Optimistic locking: Update state to Processing with race condition protection
  try {
    await prisma.cronJobs.update({
      where: {
        name: usageThresholdDbCronJobName,
        state: cron.state,
        jobStartedAt: cron.jobStartedAt,
      },
      data: {
        state: UsageThresholdDbCronJobStates.Processing,
        jobStartedAt: new Date(),
      },
    });
  } catch (e) {
    logger.warn(
      "[USAGE THRESHOLDS] Failed to update cron job state, potential race condition, exiting",
      {
        e,
      },
    );
    return;
  }

  logger.info("[USAGE THRESHOLDS] Job started");

  try {
    const stats = await processUsageAggregationForAllOrgs(
      new Date(),
      async (progress) => {
        // Update job progress to prevent staleness
        await job.updateProgress(progress * 100); // BullMQ expects 0-100
      },
    );

    // Update cron job on success
    await prisma.cronJobs.update({
      where: { name: usageThresholdDbCronJobName },
      data: {
        lastRun: new Date(),
        state: UsageThresholdDbCronJobStates.Queued,
        jobStartedAt: null,
      },
    });

    /**
     * TECH DEBT: This section records DataDog metrics for the backfill process.
     * TODO: Remove this section once all organizations have been backfilled
     */

    // Total number of organizations found with null billingCycleAnchor
    recordGauge(
      "langfuse.queue.usage_threshold_queue.backfill_total",
      backfillTotal,
      { unit: "organizations" },
    );

    // Number of organizations successfully backfilled with billingCycleAnchor
    recordGauge(
      "langfuse.queue.usage_threshold_queue.backfill_successful",
      backfillSuccessful,
      { unit: "organizations" },
    );

    // Number of organizations that failed during backfill process
    recordGauge(
      "langfuse.queue.usage_threshold_queue.backfill_errors",
      backfillErrors,
      { unit: "organizations" },
    );

    logger.info("[USAGE THRESHOLDS] Job completed successfully", {
      stats,
      backfill: {
        total: backfillTotal,
        successful: backfillSuccessful,
        errors: backfillErrors,
      },
    });
  } catch (error) {
    logger.error("[USAGE THRESHOLDS] Job failed", error);

    // Reset state on error
    await prisma.cronJobs.update({
      where: { name: usageThresholdDbCronJobName },
      data: {
        state: UsageThresholdDbCronJobStates.Queued,
        jobStartedAt: null,
      },
    });

    throw error;
  }
};
