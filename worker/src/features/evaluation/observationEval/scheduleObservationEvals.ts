import type { ObservationVariableMapping } from "@langfuse/shared";
import {
  type ObservationForEval,
  type ObservationEvalAssignment,
  type ObservationEvalRule,
  type ObservationEvalSchedulerDeps,
} from "./types";
import {
  getDeterministicSamplingValue,
  shouldSampleEvaluation,
} from "../deterministicSampling";
import {
  InMemoryFilterService,
  LangfuseInternalTraceEnvironment,
  logger,
} from "@langfuse/shared/src/server";
import {
  JobExecutionStatus,
  type FilterState,
  type EvalExecutionMode,
  canRunEvalRule,
  mapEventEvalFilterColumnIdToField,
  observationVariableMappingList,
} from "@langfuse/shared";
import { createW3CTraceId } from "../../utils";
import { isInternalEvalEnvironment } from "../isEvalTargetEnvironmentAllowed";

interface ScheduleObservationEvalsParams {
  observation: ObservationForEval;
  configs: ObservationEvalRule[];
  schedulerDeps: ObservationEvalSchedulerDeps;
  executionMode?: EvalExecutionMode;
  /**
   * Extra identity for this scheduling pass so overlapping runs of the same
   * evaluator on the same observation do not share a job id. Live ingestion
   * omits it; batch passes the batch-action id so retries of that run stay
   * stable while a second run gets its own executions.
   */
  executionScopeId?: string;
}

/**
 * Whether queue-driven (asynchronous OTel ingestion) observation-eval
 * scheduling is allowed for an observation.
 *
 * Internal Langfuse environments and public-ingestion aliases are excluded:
 * LLM-as-a-judge executions
 * publish their own telemetry through the OTel ingestion pipeline
 * (shared AI SDK LLM runtime), and scheduling evals on eval
 * observations would recurse indefinitely — the observation-eval counterpart
 * of the trace-upsert safeguard in evalService.ts createEvalJobs().
 *
 * Single exception: prompt-experiment run-item ROOT observations
 * (span_id === experiment_item_root_span_id), so experiments executed on the
 * AI SDK engine get their evals scheduled from the queue — the async
 * equivalent of internal tracing's synchronous onRootEventRecordReady
 * scheduling, which only ever offers the root record. Loop safety holds
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
  if (!isInternalEvalEnvironment(observation.environment)) {
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
  const {
    observation,
    configs,
    schedulerDeps,
    executionMode,
    executionScopeId,
  } = params;

  // Early return if no configs
  if (configs.length === 0) {
    return;
  }

  const samplingValue = getDeterministicSamplingValue(observation.span_id);

  // Filter configs that match this observation (filter + sampling) and resolve
  // their executable assignments in one pass. This is done before S3 upload to
  // avoid unnecessary uploads.
  const matchingConfigs = configs.flatMap((config) => {
    if (
      !canRunEvalRule(
        {
          status: config.status,
          blockedAt: "blockedAt" in config ? config.blockedAt : null,
        },
        executionMode,
      )
    ) {
      logger.debug("Skipping non-executable observation eval config", {
        configId: config.id,
      });

      return [];
    }

    // Check filter
    const isTargeted = evaluateFilter(observation, config);
    if (!isTargeted) {
      logger.debug("Observation does not match eval config filter", {
        configId: config.id,
        observationId: observation.span_id,
      });

      return [];
    }

    // Check sampling
    const samplingRate = config.sampling.toNumber();
    if (
      !shouldSampleEvaluation({
        samplingValue,
        samplingRate,
      })
    ) {
      logger.debug("Observation sampled out for eval config", {
        configId: config.id,
        observationId: observation.span_id,
        samplingRate,
      });

      return [];
    }

    const assignments = getExecutableAssignments(config);
    return assignments.length > 0 ? [{ config, assignments }] : [];
  });

  // Early return if no configs match - no S3 upload needed
  if (matchingConfigs.length === 0) return;

  // Upload observation to S3 once
  const observationS3Path = await schedulerDeps.uploadObservationToS3({
    projectId: observation.project_id,
    traceId: observation.trace_id,
    observationId: observation.span_id,
    data: observation,
  });

  // Process each assignment of every matching rule/config.
  await Promise.all(
    matchingConfigs.flatMap(({ config, assignments }) =>
      assignments.map((assignment) =>
        processMatchingConfig({
          observation,
          matchingConfig: config,
          assignment,
          observationS3Path,
          schedulerDeps,
          executionMode,
          executionScopeId,
        }).catch((error) => {
          logger.error("Failed to process observation eval assignment", {
            configId: config.id,
            assignmentId: assignment.id,
            observationId: observation.span_id,
            projectId: observation.project_id,
            error,
          });
        }),
      ),
    ),
  );
}

interface ProcessConfigParams {
  observation: ObservationForEval;
  matchingConfig: ObservationEvalRule;
  assignment: ScheduledObservationEvalAssignment;
  observationS3Path: string;
  schedulerDeps: ObservationEvalSchedulerDeps;
  executionMode?: EvalExecutionMode;
  executionScopeId?: string;
}

async function processMatchingConfig(
  params: ProcessConfigParams,
): Promise<void> {
  const {
    observation,
    matchingConfig,
    assignment,
    observationS3Path,
    schedulerDeps,
    executionMode,
    executionScopeId,
  } = params;

  const jobIdentity: string[] =
    "assignments" in matchingConfig
      ? [
          "observation-eval",
          matchingConfig.id,
          assignment.id,
          observation.trace_id,
          observation.span_id,
        ]
      : [
          "observation-eval",
          matchingConfig.id,
          observation.trace_id,
          observation.span_id,
        ];
  if (executionScopeId) {
    jobIdentity.push(executionScopeId);
  }
  const jobExecutionId = createW3CTraceId(JSON.stringify(jobIdentity));

  // Create job execution
  await schedulerDeps.upsertJobExecution({
    id: jobExecutionId,
    projectId: observation.project_id,
    jobConfigurationId: matchingConfig.id,
    jobInputTraceId: observation.trace_id,
    jobInputObservationId: observation.span_id,
    // Legacy configs pin their `eval_templates` row here. Evaluator v2 jobs
    // resolve the definition at pickup, and record the version that actually
    // ran in the execution metadata instead.
    jobTemplateId: assignment.evalTemplateId,
    status: JobExecutionStatus.PENDING,
  });

  // Enqueue eval job. The evaluator identity travels with the payload so the
  // executor never has to re-derive it from ids the legacy backfill reuses.
  await schedulerDeps.enqueueEvalJob({
    jobExecutionId,
    projectId: observation.project_id,
    observationS3Path,
    delay: 0,
    evalTemplateType: assignment.evaluatorType,
    ...(executionMode ? { executionMode } : {}),
    ...(assignment.evaluatorId
      ? {
          evaluatorId: assignment.evaluatorId,
          ...(assignment.evaluationRuleId
            ? { evaluationRuleId: assignment.evaluationRuleId }
            : {}),
        }
      : {}),
    ...(assignment.variableMapping != null
      ? { variableMapping: assignment.variableMapping }
      : {}),
  });

  logger.debug("Scheduled observation eval job", {
    configId: matchingConfig.id,
    observationId: observation.span_id,
    jobExecutionId,
  });
}

type ScheduledObservationEvalAssignment = {
  id: string;
  /** Set for evaluator v2; null when scheduling a legacy config. */
  evaluatorId: string | null;
  evaluationRuleId: string | null;
  /** Legacy template id, or evaluator id for a ruleless V2 batch run. */
  evalTemplateId: string | null;
  evaluatorType: ObservationEvalAssignment["evaluator"]["type"];
  /**
   * Mapping override for a ruleless batch run. Omitted when the run should
   * inherit the evaluator version mapping, and never set for rule-backed jobs
   * (those load the assignment row at pickup).
   */
  variableMapping?: ObservationVariableMapping[];
};

function getExecutableAssignments(
  rule: ObservationEvalRule,
): ScheduledObservationEvalAssignment[] {
  if (!("assignments" in rule)) {
    return rule.evalTemplateId
      ? [
          {
            id: rule.id,
            evaluatorId: null,
            evaluationRuleId: null,
            evalTemplateId: rule.evalTemplateId,
            evaluatorType: rule.evalTemplate.type,
          },
        ]
      : [];
  }

  return rule.assignments.flatMap((assignment) => {
    // Blocked evaluators are already excluded by the query; this guards the
    // tenant boundary for callers that build assignments by hand.
    if (assignment.evaluator.projectId !== rule.projectId) {
      logger.warn("Skipping cross-project observation eval assignment", {
        ruleId: rule.id,
        assignmentId: assignment.id,
        evaluatorId: assignment.evaluatorId,
      });
      return [];
    }

    const parsedMapping = observationVariableMappingList.safeParse(
      assignment.variableMapping,
    );

    return [
      {
        id: assignment.id,
        evaluatorId: assignment.evaluator.id,
        evaluationRuleId: rule.ruleId,
        // Ruleless batch runs use the evaluator as the legacy template anchor.
        evalTemplateId: rule.ruleId === null ? assignment.evaluator.id : null,
        evaluatorType: assignment.evaluator.type,
        ...(rule.ruleId === null && parsedMapping.success
          ? { variableMapping: parsedMapping.data }
          : {}),
      },
    ];
  });
}

/**
 * Evaluate filter conditions against observation.
 * Returns true if observation matches all filter conditions (or filter is empty).
 */
function evaluateFilter(
  observation: ObservationForEval,
  config: ObservationEvalRule,
): boolean {
  const filterConditions = config.filter as FilterState;

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

  return isFilterMatch;
}
