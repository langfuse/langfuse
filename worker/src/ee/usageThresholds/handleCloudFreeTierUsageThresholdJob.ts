import { prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";
import {
  usageThresholdDbCronJobName,
  UsageThresholdDbCronJobStates,
} from "./constants";
import { Job } from "bullmq";
import { processUsageAggregationForAllOrgs } from "./usageAggregation";

export const handleCloudFreeTierUsageThresholdJob = async (job: Job) => {
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

    logger.info("[USAGE THRESHOLDS] Job completed successfully", {
      stats,
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
