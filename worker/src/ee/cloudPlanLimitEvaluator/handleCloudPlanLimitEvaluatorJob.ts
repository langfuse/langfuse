import { prisma } from "@langfuse/shared/src/db";
import { Job } from "bullmq";
import {
  cloudPlanLimitEvaluatorDbCronJobName,
  CloudPlanLimitEvaluatorDbCronJobStates,
  OBSERVATION_MONTHLY_LIMIT,
} from "./constants";
import { logger, recordGauge } from "@langfuse/shared/src/server";
import { getObservationCountsByProjectInCreationInterval } from "@langfuse/shared/src/server";

export const handleCloudPlanLimitEvaluatorJob = async (job: Job) => {
  // Get or create cron job entry
  const cron = await prisma.cronJobs.upsert({
    where: { name: cloudPlanLimitEvaluatorDbCronJobName },
    create: {
      name: cloudPlanLimitEvaluatorDbCronJobName,
      state: CloudPlanLimitEvaluatorDbCronJobStates.Queued,
      lastRun: new Date(Date.now() - (Date.now() % 3600000)), // beginning of current hour
    },
    update: {},
  });

  // Check if job is already running
  if (cron.state === CloudPlanLimitEvaluatorDbCronJobStates.Processing) {
    if (
      cron.jobStartedAt &&
      cron.jobStartedAt < new Date(Date.now() - 1200000)
    ) {
      logger.warn(
        "[CLOUD PLAN LIMIT EVALUATOR] Last job started at is older than 20 minutes, retrying job",
      );
    } else {
      logger.warn("[CLOUD PLAN LIMIT EVALUATOR] Job already in progress");
      return;
    }
  }

  // Update job state to processing
  try {
    await prisma.cronJobs.update({
      where: {
        name: cloudPlanLimitEvaluatorDbCronJobName,
        state: CloudPlanLimitEvaluatorDbCronJobStates.Queued,
      },
      data: {
        state: CloudPlanLimitEvaluatorDbCronJobStates.Processing,
        jobStartedAt: new Date(),
      },
    });
  } catch (e) {
    logger.warn(
      "[CLOUD PLAN LIMIT EVALUATOR] Failed to update cron job state, potential race condition, exiting",
      { e },
    );
    return;
  }

  // Get start of current month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Get observation counts for all projects this month
  const observationCountsByProject =
    await getObservationCountsByProjectInCreationInterval({
      start: startOfMonth,
      end: now,
    });

  // Get all organizations and their projects
  const organizations = await prisma.organization.findMany({
    include: {
      projects: {
        select: {
          id: true,
        },
      },
    },
  });

  let updatedOrgs = 0;
  for (const org of organizations) {
    // Update progress
    job.updateProgress(updatedOrgs / organizations.length);

    // Calculate total observations for this org
    const totalObservations = observationCountsByProject
      .filter((p) =>
        org.projects.some((orgProject) => orgProject.id === p.projectId),
      )
      .reduce((sum, p) => sum + p.count, 0);

    // Determine if org should be flagged
    const shouldFlag =
      totalObservations > OBSERVATION_MONTHLY_LIMIT && !org.cloudConfig;

    // Update organization if flag state needs to change
    if (org.cloudAbovePlanIngestionLimit !== shouldFlag) {
      try {
        await prisma.organization.update({
          where: { id: org.id },
          data: {
            cloudAbovePlanIngestionLimit: shouldFlag,
          },
        });
        logger.info(
          `[CLOUD PLAN LIMIT EVALUATOR] Updated organization ${org.id} flag to ${shouldFlag}`,
          {
            organizationId: org.id,
            totalObservations,
            monthlyLimit: OBSERVATION_MONTHLY_LIMIT,
            hasCloudConfig: !!org.cloudConfig,
          },
        );
        updatedOrgs++;
      } catch (error) {
        logger.error(
          `[CLOUD PLAN LIMIT EVALUATOR] Failed to update organization ${org.id}`,
          {
            error,
            organizationId: org.id,
            totalObservations,
            monthlyLimit: OBSERVATION_MONTHLY_LIMIT,
            hasCloudConfig: !!org.cloudConfig,
          },
        );
      }
    }
  }

  // Record metrics
  recordGauge(
    "cloud_plan_limit_evaluator_processed_orgs",
    organizations.length,
    {
      unit: "organizations",
    },
  );
  recordGauge("cloud_plan_limit_evaluator_updated_orgs", updatedOrgs, {
    unit: "organizations",
  });

  // Update cron job state
  await prisma.cronJobs.update({
    where: { name: cloudPlanLimitEvaluatorDbCronJobName },
    data: {
      lastRun: new Date(),
      state: CloudPlanLimitEvaluatorDbCronJobStates.Queued,
      jobStartedAt: null,
    },
  });

  logger.info("[CLOUD PLAN LIMIT EVALUATOR] Job completed", {
    totalOrgs: organizations.length,
    updatedOrgs,
  });
};
