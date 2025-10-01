import { prisma } from "@langfuse/shared/src/db";
import { logger, recordGauge } from "@langfuse/shared/src/server";
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
    // Call the main usage aggregation function from GTM-1461
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

    // Record DataDog metrics
    recordGauge(
      "langfuse.queue.usage_threshold_queue.total_orgs",
      stats.totalOrgs,
      { unit: "organizations" },
    );

    recordGauge(
      "langfuse.queue.usage_threshold_queue.paid_plan_orgs",
      stats.paidPlanOrgs,
      { unit: "organizations" },
    );

    recordGauge(
      "langfuse.queue.usage_threshold_queue.free_tier_orgs",
      stats.freeTierOrgs,
      { unit: "organizations" },
    );

    // Total number of organizations currently in WARNING state (not newly detected)
    recordGauge(
      "langfuse.queue.usage_threshold_queue.warning_orgs_total",
      stats.currentWarningOrgs,
      { unit: "organizations" },
    );

    // Total number of organizations currently in BLOCKED state (not newly detected)
    recordGauge(
      "langfuse.queue.usage_threshold_queue.blocked_orgs_total",
      stats.currentBlockedOrgs,
      { unit: "organizations" },
    );

    // Number of warning emails sent for newly detected threshold crossings in this job run
    recordGauge(
      "langfuse.queue.usage_threshold_queue.warning_emails_sent",
      stats.warningEmailsSent,
      { unit: "emails" },
    );

    // Number of blocking emails sent for newly detected threshold crossings in this job run
    recordGauge(
      "langfuse.queue.usage_threshold_queue.blocking_emails_sent",
      stats.blockingEmailsSent,
      { unit: "emails" },
    );

    // Number of emails that failed to send in this job run
    recordGauge(
      "langfuse.queue.usage_threshold_queue.email_failures",
      stats.emailFailures,
      { unit: "emails" },
    );

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
