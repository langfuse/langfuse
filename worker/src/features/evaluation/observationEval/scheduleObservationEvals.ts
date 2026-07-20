import {
  type ObservationForEval,
  type ObservationEvalConfig,
  type ObservationEvalSchedulerDeps,
} from "./types";
import { shouldSampleObservation } from "./shouldSampleObservation";
import {
  InMemoryFilterService,
  LangfuseInternalTraceEnvironment,
  logger,
} from "@langfuse/shared/src/server";
import {
  EvalTargetObject,
  JobExecutionStatus,
  type FilterState,
  type JobConfigExecutionMode,
  isJobConfigExecutableForExecutionMode,
  mapEventEvalFilterColumnIdToField,
} from "@langfuse/shared";
import { createW3CTraceId } from "../../utils";

interface ScheduleObservationEvalsParams {
  observation: ObservationForEval;
  configs: ObservationEvalConfig[];
  schedulerDeps: ObservationEvalSchedulerDeps;
  executionMode?: JobConfigExecutionMode;
}

/**
 * Whether queue-driven (asynchronous OTel ingestion) observation-eval
 * scheduling is allowed for an observation.
 *
 * Internal Langfuse environments are excluded: LLM-as-a-judge executions
 * publish their own telemetry through the OTel ingestion pipeline
 * (fetchLLMCompletion AI SDK engine), and scheduling evals on eval
 * observations would recurse indefinitely — the observation-eval counterpart
 * of the trace-upsert safeguard in evalService.ts createEvalJobs().
 *
 * Single exception: prompt-experiment run-item ROOT observations
 * (span_id === experiment_item_root_span_id), so experiments executed on the
 * AI SDK engine get their evals scheduled from the queue — the async
 * equivalent of the LangChain path's synchronous onRootEventRecordReady
 * scheduling, which only ever offered the root record. Loop safety holds
 * because evals triggered on experiment roots execute in the
 * langfuse-llm-as-a-judge environment, which stays blocked here, and
 * experiment child spans carry the root's span id, so they never match.
 */
export function isObservationAllowedForQueuedObservationEvals(
  observation: Pick<
    ObservationForEval,
    "environment" | "span_id" | "experiment_item_root_span_id"
  >,
): boolean {
  if (!observation.environment?.startsWith("langfuse")) {
    return true;
  }

  return (
    observation.environment ===
      LangfuseInternalTraceEnvironment.PromptExperiments &&
    observation.experiment_item_root_span_id != null &&
    observation.span_id === observation.experiment_item_root_span_id
  );
}

/**
 * Schedule observation evals for a given observation.
 *
 * This function receives pre-fetched configs (already filtered by targetObject: "event" or "experiment"
 * and project). It evaluates each attached scope's filter and sampling against
 * the observation, then creates one job execution per matching evaluator-scope
 * pair. Evaluators without scope assignments retain the legacy config-level
 * execution behavior.
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
  const { observation, configs, schedulerDeps, executionMode } = params;

  // Early return if no configs
  if (configs.length === 0) {
    return;
  }

  // Resolve every matching evaluator-scope pair before uploading the input.
  // Separate executions preserve which shared scope caused each run.
  const matchingConfigScopes = configs.flatMap((config) => {
    if (!isJobConfigExecutableForExecutionMode(config, executionMode)) {
      logger.debug("Skipping non-executable observation eval config", {
        configId: config.id,
      });

      return [];
    }

    const hasAttachedScopes = Boolean(config.targetingScopes?.length);
    const targetingScopes = hasAttachedScopes
      ? config.targetingScopes!
      : [config];
    const matchingScopes = targetingScopes.flatMap((scope) => {
      if ("enabled" in scope && !scope.enabled) return [];
      if (!evaluateFilter(observation, scope)) return [];
      if (
        !shouldSampleObservation({
          samplingRate: scope.sampling.toNumber(),
        })
      ) {
        return [];
      }

      return [
        {
          matchingConfig: config,
          ...(hasAttachedScopes ? { runScopeId: scope.id } : {}),
        },
      ];
    });

    if (matchingScopes.length === 0) {
      logger.debug("Observation does not match eval config filter", {
        configId: config.id,
        observationId: observation.span_id,
      });
    }

    return matchingScopes;
  });

  // Early return if no configs match - no S3 upload needed
  if (matchingConfigScopes.length === 0) return;

  // Upload observation to S3 once
  const observationS3Path = await schedulerDeps.uploadObservationToS3({
    projectId: observation.project_id,
    traceId: observation.trace_id,
    observationId: observation.span_id,
    data: observation,
  });

  // Process each matching config
  await Promise.all(
    matchingConfigScopes.map(({ matchingConfig, runScopeId }) =>
      processMatchingConfig({
        observation,
        matchingConfig,
        runScopeId,
        observationS3Path,
        schedulerDeps,
        executionMode,
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
  runScopeId?: string;
  observationS3Path: string;
  schedulerDeps: ObservationEvalSchedulerDeps;
  executionMode?: JobConfigExecutionMode;
}

async function processMatchingConfig(
  params: ProcessConfigParams,
): Promise<void> {
  const {
    observation,
    matchingConfig,
    runScopeId,
    observationS3Path,
    schedulerDeps,
    executionMode,
  } = params;

  const jobExecutionIdentity = runScopeId
    ? [
        "observation-eval",
        matchingConfig.id,
        runScopeId,
        observation.trace_id,
        observation.span_id,
      ]
    : [
        "observation-eval",
        matchingConfig.id,
        observation.trace_id,
        observation.span_id,
      ];
  const jobExecutionId = createW3CTraceId(JSON.stringify(jobExecutionIdentity));

  // Create job execution
  await schedulerDeps.upsertJobExecution({
    id: jobExecutionId,
    projectId: observation.project_id,
    jobConfigurationId: matchingConfig.id,
    ...(runScopeId ? { runScopeId } : {}),
    jobInputTraceId: observation.trace_id,
    jobInputObservationId: observation.span_id,
    jobTemplateId: matchingConfig.evalTemplateId,
    status: JobExecutionStatus.PENDING,
  });

  // Enqueue eval job
  await schedulerDeps.enqueueEvalJob({
    jobExecutionId,
    projectId: observation.project_id,
    observationS3Path,
    delay: 0,
    evalTemplateType: matchingConfig.evalTemplate.type,
    ...(executionMode ? { executionMode } : {}),
  });

  logger.debug("Scheduled observation eval job", {
    configId: matchingConfig.id,
    runScopeId,
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
  config: Pick<ObservationEvalConfig, "filter" | "targetObject">,
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
