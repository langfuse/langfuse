import {
  type ObservationForEval,
  type ObservationEvalConfig,
  type ObservationEvalSchedulerDeps,
} from "./types";
import { shouldSampleObservation } from "./shouldSampleObservation";
import { InMemoryFilterService, logger } from "@langfuse/shared/src/server";
import { JobExecutionStatus, type FilterState } from "@langfuse/shared";

interface ScheduleObservationEvalsParams {
  observation: ObservationForEval;
  configs: ObservationEvalConfig[];
  schedulerDeps: ObservationEvalSchedulerDeps;
}

/**
 * Schedule observation evals for a given observation.
 *
 * This function receives pre-fetched configs (already filtered by filterTarget: "observation"
 * and project). It evaluates each config's filter and sampling against the observation,
 * checks for deduplication, and creates job executions for matching configs.
 *
 * The observation is uploaded to S3 once (not per config) for efficiency.
 *
 * @param params.observation - The ObservationForEval (converted from processToEvent() or ClickHouse)
 * @param params.configs - Pre-fetched observation eval configs for this project
 * @param params.schedulerDeps - Dependencies for scheduling (S3, job execution, queue)
 */
export async function scheduleObservationEvals(
  params: ScheduleObservationEvalsParams,
): Promise<void> {
  const { observation, configs, schedulerDeps } = params;

  // Early return if no configs
  if (configs.length === 0) {
    return;
  }

  // Upload observation to S3 once (not per config)
  const observationS3Path = await schedulerDeps.uploadObservationToS3({
    projectId: observation.projectId,
    observationId: observation.id,
    data: observation,
  });

  // Process each config
  for (const config of configs) {
    try {
      await processConfig({
        observation,
        config,
        observationS3Path,
        schedulerDeps,
      });
    } catch (error) {
      logger.error("Failed to process observation eval config", {
        configId: config.id,
        observationId: observation.id,
        projectId: observation.projectId,
        error,
      });
    }
  }
}

interface ProcessConfigParams {
  observation: ObservationForEval;
  config: ObservationEvalConfig;
  observationS3Path: string;
  schedulerDeps: ObservationEvalSchedulerDeps;
}

async function processConfig(params: ProcessConfigParams): Promise<void> {
  const { observation, config, observationS3Path, schedulerDeps } = params;

  // Step 1: Evaluate filter
  const isTargeted = evaluateFilter(observation, config);
  if (!isTargeted) {
    logger.debug("Observation does not match eval config filter", {
      configId: config.id,
      observationId: observation.id,
    });

    return;
  }

  // Step 2: Check sampling
  const samplingRate = config.sampling.toNumber();
  if (!shouldSampleObservation({ samplingRate })) {
    logger.debug("Observation sampled out for eval config", {
      configId: config.id,
      observationId: observation.id,
      samplingRate,
    });

    return;
  }

  // Step 3: Check deduplication (job already exists?)
  const existingJob = await schedulerDeps.findExistingJobExecution({
    projectId: observation.projectId,
    jobConfigurationId: config.id,
    jobInputObservationId: observation.id,
  });

  if (existingJob) {
    logger.debug("Job already exists for observation and config", {
      configId: config.id,
      observationId: observation.id,
      existingJobId: existingJob.id,
    });

    return;
  }

  // Step 4: Create job execution
  const jobExecution = await schedulerDeps.createJobExecution({
    projectId: observation.projectId,
    jobConfigurationId: config.id,
    jobInputTraceId: observation.traceId,
    jobInputObservationId: observation.id,
    status: JobExecutionStatus.PENDING,
  });

  // Step 5: Enqueue eval job
  await schedulerDeps.enqueueEvalJob({
    jobExecutionId: jobExecution.id,
    projectId: observation.projectId,
    observationS3Path,
    delay: config.delay,
  });

  logger.debug("Scheduled observation eval job", {
    configId: config.id,
    observationId: observation.id,
    jobExecutionId: jobExecution.id,
  });
}

/**
 * Evaluate filter conditions against observation.
 * Returns true if observation matches all filter conditions (or filter is empty).
 */
function evaluateFilter(
  observation: ObservationForEval,
  config: ObservationEvalConfig,
): boolean {
  const filterConditions = config.filter as FilterState;

  // Empty filter matches all
  if (
    !filterConditions ||
    !Array.isArray(filterConditions) ||
    filterConditions.length === 0
  ) {
    return true;
  }

  // Use InMemoryFilterService to evaluate filter
  // Column IDs are typed as keyof ObservationForEval, so direct property access is safe
  return InMemoryFilterService.evaluateFilter(
    observation,
    filterConditions,
    (obs, columnId) => obs[columnId as keyof ObservationForEval],
  );
}
