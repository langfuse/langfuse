import { prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";
import {
  usageThresholdDbCronJobName,
  UsageThresholdDbCronJobStates,
} from "./constants";
import { Job } from "bullmq";
import { processUsageAggregationForAllOrgs } from "./usageAggregation";
import { backfillBillingCycleAnchors } from "./backfillBillingCycleAnchors";

export const handleUsageThresholdJob = async (job: Job) => {
  // TECH DEBT: Backfill billing cycle anchors for organizations without one
  // TODO: Remove this call once all organizations have been backfilled (target: Q2 2025)
  try {
    await backfillBillingCycleAnchors();
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
    // Call the main usage aggregation function from GTM-1461
    await processUsageAggregationForAllOrgs(new Date(), async (progress) => {
      // Update job progress to prevent staleness
      await job.updateProgress(progress * 100); // BullMQ expects 0-100
    });

    // Update cron job on success
    await prisma.cronJobs.update({
      where: { name: usageThresholdDbCronJobName },
      data: {
        lastRun: new Date(),
        state: UsageThresholdDbCronJobStates.Queued,
        jobStartedAt: null,
      },
    });

    logger.info("[USAGE THRESHOLDS] Job completed successfully");
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
