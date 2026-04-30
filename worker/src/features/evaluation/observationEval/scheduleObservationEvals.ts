import {
  type ObservationForEval,
  type ObservationEvalConfig,
  type ObservationEvalSchedulerDeps,
} from "./types";
import { InMemoryFilterService, logger } from "@langfuse/shared/src/server";
import {
  EvalTargetObject,
  JobExecutionStatus,
  type FilterState,
  isJobConfigExecutable,
  mapEventEvalFilterColumnIdToField,
} from "@langfuse/shared";
import {
  createEventEvaluatorExecutionIdentity,
  createEvaluatorExecutionId,
  createExperimentEvaluatorExecutionIdentity,
  EvaluatorType,
  shouldSampleEvaluatorExecution,
  type EvaluatorExecutionTriggerSource,
  type EvaluatorExecutionQueueMetadata,
} from "@langfuse/shared/src/server";
import { writeScheduledEvaluatorExecutionEvent } from "../evaluatorExecutionEventWriter";

interface ScheduleObservationEvalsParams {
  observation: ObservationForEval;
  configs: ObservationEvalConfig[];
  schedulerDeps: ObservationEvalSchedulerDeps;
  triggerSource?: EvaluatorExecutionTriggerSource;
}

/**
 * Schedule observation evals for a given observation.
 *
 * This function receives pre-fetched configs (already filtered by targetObject: "event" or "experiment"
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

  // Filter configs that match this observation (filter + sampling).
  // This is done before S3 upload to avoid unnecessary uploads.
  const matchingConfigs = configs.filter((config) => {
    if (!isJobConfigExecutable(config)) {
      logger.debug("Skipping non-executable observation eval config", {
        configId: config.id,
      });

      return false;
    }

    // Check filter
    const isTargeted = evaluateFilter(observation, config);
    if (!isTargeted) {
      logger.debug("Observation does not match eval config filter", {
        configId: config.id,
        observationId: observation.span_id,
      });

      return false;
    }

    const jobExecutionId = createEvaluatorExecutionId(
      buildObservationEvalJobExecutionIdentity({
        observation,
        matchingConfig: config,
      }),
    );
    const samplingRate = config.sampling.toNumber();
    if (
      !shouldSampleEvaluatorExecution({
        evaluatorExecutionId: jobExecutionId,
        samplingRate,
      })
    ) {
      logger.debug("Observation sampled out for eval config", {
        configId: config.id,
        observationId: observation.span_id,
        samplingRate,
      });

      return false;
    }

    return true;
  });

  // Early return if no configs match - no S3 upload needed
  if (matchingConfigs.length === 0) return;

  // Upload observation to S3 once
  const observationS3Path = await schedulerDeps.uploadObservationToS3({
    projectId: observation.project_id,
    observationId: observation.span_id,
    data: observation,
  });

  // Process each matching config
  await Promise.all(
    matchingConfigs.map((matchingConfig) =>
      processMatchingConfig({
        observation,
        matchingConfig,
        observationS3Path,
        schedulerDeps,
        triggerSource: params.triggerSource,
      }).catch((error) => {
        logger.error("Failed to process observation eval config", {
          configId: matchingConfig.id,
          observationId: observation.span_id,
          projectId: observation.project_id,
          error,
        });
      }),
    ),
  );
}

interface ProcessConfigParams {
  observation: ObservationForEval;
  matchingConfig: ObservationEvalConfig;
  observationS3Path: string;
  schedulerDeps: ObservationEvalSchedulerDeps;
  triggerSource?: EvaluatorExecutionTriggerSource;
}

async function processMatchingConfig(
  params: ProcessConfigParams,
): Promise<void> {
  const { observation, matchingConfig, observationS3Path, schedulerDeps } =
    params;

  const jobExecutionId = createEvaluatorExecutionId(
    buildObservationEvalJobExecutionIdentity({
      observation,
      matchingConfig,
    }),
  );

  // Create job execution
  const scheduledAt = new Date();
  await schedulerDeps.upsertJobExecution({
    id: jobExecutionId,
    projectId: observation.project_id,
    jobConfigurationId: matchingConfig.id,
    jobInputTraceId: observation.trace_id,
    jobInputObservationId: observation.span_id,
    jobTemplateId: matchingConfig.evalTemplateId,
    status: JobExecutionStatus.PENDING,
    scheduledAt,
  });

  const metadata: EvaluatorExecutionQueueMetadata = {
    evaluationRuleId: matchingConfig.id,
    evaluatorId: matchingConfig.evalTemplateId,
    evaluatorType: EvaluatorType.LLM_AS_JUDGE,
    triggerSource: params.triggerSource ?? "",
    scoreName: matchingConfig.scoreName,
    targetObject:
      matchingConfig.targetObject as EvaluatorExecutionQueueMetadata["targetObject"],
    targetTraceId: observation.trace_id,
    targetObservationId: observation.span_id,
    scheduledAt,
    scheduleDelayMs: 0,
  };

  writeScheduledEvaluatorExecutionEvent({
    projectId: observation.project_id,
    evaluatorExecutionId: jobExecutionId,
    metadata,
  });

  // Enqueue eval job
  await schedulerDeps.enqueueEvalJob({
    jobExecutionId,
    projectId: observation.project_id,
    observationS3Path,
    delay: 0,
    metadata,
  });

  logger.debug("Scheduled observation eval job", {
    configId: matchingConfig.id,
    observationId: observation.span_id,
    jobExecutionId,
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
  const isExperimentConfig =
    config.targetObject === EvalTargetObject.EXPERIMENT;
  const isExperimentRoot =
    observation.span_id === observation.experiment_item_root_span_id;

  // Empty filter matches all (for filter purposes)
  const isEmptyFilter =
    !filterConditions ||
    !Array.isArray(filterConditions) ||
    filterConditions.length === 0;

  // Map filter column IDs to observation field values for in-memory filtering
  const fieldMapper = (obs: ObservationForEval, column: string) =>
    mapEventEvalFilterColumnIdToField(obs, column);

  // Use InMemoryFilterService to evaluate filter if there are conditions
  const isFilterMatch = isEmptyFilter
    ? true
    : InMemoryFilterService.evaluateFilter(
        observation,
        filterConditions,
        fieldMapper,
      );

  // For experiment configs, must also match experiment root span
  return isExperimentConfig ? isFilterMatch && isExperimentRoot : isFilterMatch;
}

function buildObservationEvalJobExecutionIdentity(params: {
  observation: ObservationForEval;
  matchingConfig: ObservationEvalConfig;
}) {
  const { observation, matchingConfig } = params;

  return matchingConfig.targetObject === EvalTargetObject.EXPERIMENT
    ? createExperimentEvaluatorExecutionIdentity({
        projectId: observation.project_id,
        evaluationRuleId: matchingConfig.id,
        targetTraceId: observation.trace_id,
        targetObservationId: observation.span_id,
      })
    : createEventEvaluatorExecutionIdentity({
        projectId: observation.project_id,
        evaluationRuleId: matchingConfig.id,
        targetTraceId: observation.trace_id,
        targetObservationId: observation.span_id,
      });
}
