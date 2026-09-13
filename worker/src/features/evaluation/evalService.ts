import { randomUUID } from "crypto";
import { z } from "zod";
import {
  EvalTemplateType,
  JobConfigState,
  JobExecutionStatus,
  type JobExecution,
  type JobConfiguration,
} from "@prisma/client";
import {
  QueueJobs,
  QueueName,
  EvalExecutionEvent,
  logger,
  EvalExecutionQueue,
  checkTraceExistsAndGetTimestamp,
  checkObservationExists,
  TraceQueueEventType,
  CreateEvalQueueEventType,
  getTraceById,
  getObservationForTraceIdByName,
  InMemoryFilterService,
  recordIncrement,
  getCurrentSpan,
  instrumentAsync,
  getDatasetItemIdsByTraceIdCh,
  mapDatasetRunItemFilterColumn,
  tableColumnsToSqlFilterAndPrefix,
  LangfuseInternalTraceEnvironment,
  DEFAULT_TRACE_ENVIRONMENT,
  setNoEvalConfigsCache,
  DatasetRunItemUpsertEventType,
  classifyEvaluatorLlmError,
  blockEvaluator,
  buildEvalExecutionData,
  EvaluatorBlockSource,
  executeLlmEvaluator,
  type CodeEvalScoreWithName,
  type EvaluatorLlmErrorClassification,
} from "@langfuse/shared/src/server";
import {
  inMemoryFilterRequiresMetadata,
  mapTraceFilterColumn,
  requiresDatabaseLookup,
} from "./traceFilterUtils";
import {
  Prisma,
  singleFilter,
  variableMappingList,
  evalDatasetFormFilterCols,
  availableDatasetEvalVariables,
  JobTimeScope,
  availableTraceEvalVariables,
  variableMapping,
  TraceDomain,
  Observation,
  EvalTargetObject,
  getEvaluatorBlockMetadata,
  getEvaluatorPromptMessages,
  getBlockReasonForInvalidModelConfig,
  isEvalRuleExecutable,
  type EvalTemplateLlmAsAJudge,
  PersistedEvalOutputDefinitionSchema,
  ScoreDataTypeEnum,
  type EvalOutputResult,
  extractValueFromObject,
  validateEvaluatorFiltersForTarget,
  type EvalExecutionContext,
} from "@langfuse/shared";
import { env } from "../../env";
import { prisma } from "@langfuse/shared/src/db";
import { createW3CTraceId } from "../utils";
import { UnrecoverableError } from "../../errors/UnrecoverableError";
import { ObservationNotFoundError } from "../../errors/ObservationNotFoundError";
import {
  completeEvalExecution,
  type EvalExecutionResult,
} from "./evalCompletion";
import {
  isEvalTargetEnvironmentAllowed,
  isInternalEvalEnvironment,
} from "./isEvalTargetEnvironmentAllowed";
import {
  type EvalExecutionDeps,
  createProductionEvalExecutionDeps,
} from "./evalExecutionDeps";
import { type ExtractedVariable } from "@langfuse/shared/src/server";
import {
  buildEvalExecutionSpanAttributes,
  buildEvaluatorLlmErrorSpanAttributes,
} from "./evalSpanAttributes";
import {
  getDeterministicSamplingValue,
  shouldSampleEvaluation,
} from "./deterministicSampling";

/**
 * Determines which eval jobs to create for a given event (traces or dataset run items).
 * There might be multiple eval jobs to create for a single trace.
 * Supports:
 * - TraceQueue: Live trace data
 * - DatasetRunItemUpsert: Live dataset run items
 * - CreateEvalQueue: Historical batch data (traces or dataset run items)
 *
 * @param {Object} params - Function parameters
 * @param {TraceQueueEventType|DatasetRunItemUpsertEventType|CreateEvalQueueEventType} params.event - Event that triggered job creation
 * @param {Date} params.jobTimestamp - When the job was created
 * @param {JobTimeScope} [params.enforcedJobTimeScope] - Optional filter for job configurations ("NEW"|"EXISTING")
 *
 * Data Flow Architecture for Evaluation Jobs
 *
 * ┌──────────────────────────┐    ┌─────────────────────────┐    ┌─────────────────────────┐
 * │                          │    │                         │    │                         │
 * │  TraceQueue              │    │  DatasetRunItemUpsert   │    │  CreateEvalQueue        │
 * │  - Live trace data       │    │  - Live dataset run item│    │  - Historical batch     │
 * │  - Has timestamp in body │    │  - No timestamp in body │    │  - Has timestamp in body│
 * │  - enforcedTimeScope=NEW │    │  - enforcedTimeScope=NEW│    │  - No enforcedTimeScope │
 * │  - Always linked to      │    │  - Always linked to     │    │  - Always linked to     │
 * │    traces only           │    │    traces & sometimes   │    │    traces & sometimes   │
 * │                          │    │    to observations      │    │    to observations      │
 * └──────────────┬───────────┘    └──────────────┬──────────┘    └──────────────┬──────────┘
 *                │                              │                              │
 *                │                              │                              │
 *                └──────────────────┬───────────┴──────────────────────────────┘
 *                                   │
 *                                   ▼
 * ┌───────────────────────────────────────────────────────────────────────────────────────┐
 * │                                                                                       │
 * │  createEvalJobs function                                                              │
 * │  ───────────────────────                                                              │
 * │                                                                                       │
 * │                     ┌────────────────────────────┐                                    │
 * │                     │                            │                                    │
 * │                     │  1. Fetch & Filter         │                                    │
 * │                     │  - Fetches job configs     │                                    │
 * │                     │  - Filters by time scope   │                                    │
 * │                     │  - Creates evaluation jobs │                                    │
 * │                     │                            │                                    │
 * │                     └───────────────┬────────────┘                                    │
 * │                                     │                                                 │
 * │                                     ▼                                                 │
 * │                     ┌────────────────────────────┐                                    │
 * │                     │                            │                                    │
 * │                     │  2. Validation Checks      │                                    │
 * │                     │                            │                                    │
 * │                     ├────────────────────────────┤                                    │
 * │                     │  ┌────────────────────┐    │                                    │
 * │                     │  │ traceExists        │◄───┼── Always run for all events        │
 * │                     │  └────────────────────┘    │                                    │
 * │                     │                            │                                    │
 * │                     │  ┌────────────────────┐    │                                    │
 * │                     │  │ observationExists  │◄───┼── Only run for DatasetRunItemUpsert│
 * │                     │  └────────────────────┘    │    and CreateEvalQueue if          │
 * │                     │                            │    observationId is set            │
 * │                     └───────────────┬────────────┘                                    │
 * │                                     │                                                 │
 * │                                     ▼                                                 │
 * │                     ┌────────────────────────────┐                                    │
 * │                     │                            │                                    │
 * │                     │  3. EvaluationExecution    │                                    │
 * │                     │  - Jobs queued with delay  │                                    │
 * │                     │  - Includes job parameters │                                    │
 * │                     │                            │                                    │
 * │                     └────────────────────────────┘                                    │
 * │                                                                                       │
 * └───────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────── │
 */
type CreateEvalJobsParams = {
  jobTimestamp: Date;
  enforcedJobTimeScope?: JobTimeScope;
} & (
  | {
      sourceEventType: "trace-upsert";
      event: TraceQueueEventType;
    }
  | {
      sourceEventType: "dataset-run-item-upsert";
      event: DatasetRunItemUpsertEventType;
    }
  | {
      sourceEventType: "ui-create-eval";
      event: CreateEvalQueueEventType;
    }
);

// Only what toTraceEvalConfig reads. Selecting the evaluator wholesale would carry its prompt
// and source code (up to 256KB) into a query that runs per trace.
const traceRuleSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  projectId: true,
  status: true,
  targetObject: true,
  filter: true,
  sampling: true,
  delay: true,
  timeScope: true,
  assignments: {
    orderBy: { createdAt: "asc" },
    select: {
      variableMapping: true,
      evaluator: {
        select: {
          id: true,
          name: true,
          type: true,
          blockedAt: true,
          versions: {
            orderBy: { version: "desc" },
            take: 1,
            select: { id: true, variableMapping: true },
          },
        },
      },
    },
  },
} satisfies Prisma.EvaluationRuleSelect;

type TraceRule = Prisma.EvaluationRuleGetPayload<{
  select: typeof traceRuleSelect;
}>;

type TraceEvalConfig = JobConfiguration & {
  evaluatorId: string;
  evaluationRuleId: string;
};

function toTraceEvalConfig(rule: TraceRule): TraceEvalConfig | null {
  // TRACE/DATASET are legacy-target rules and intentionally retain the old
  // one-rule/one-evaluator contract. Multi-assignment rules belong to the
  // modern EVENT/EXPERIMENT flow and must not be flattened ambiguously here.
  if (rule.assignments.length !== 1) return null;
  const assignment = rule.assignments[0];
  const evaluator = assignment.evaluator;
  const version = evaluator.versions[0];
  if (
    !version ||
    evaluator.blockedAt ||
    evaluator.type !== EvalTemplateType.LLM_AS_JUDGE
  ) {
    return null;
  }

  return {
    id: rule.id,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
    projectId: rule.projectId,
    jobType: "EVAL",
    status: rule.status,
    blockedAt: null,
    blockReason: null,
    blockMessage: null,
    evalTemplateId: version.id,
    scoreName: evaluator.name,
    filter: rule.filter,
    targetObject: rule.targetObject,
    variableMapping:
      assignment.variableMapping ?? version.variableMapping ?? [],
    sampling: rule.sampling,
    delay: rule.delay,
    timeScope: rule.timeScope,
    evaluatorId: evaluator.id,
    evaluationRuleId: rule.id,
  };
}

/**
 * Stable id for a trace/dataset eval execution, derived from the same key the
 * dedup lookup uses.
 *
 * Two producers (trace-upsert shards, dataset-run-item-upsert, CreateEvalQueue)
 * can observe the same trace concurrently and both pass the read-then-write
 * existence check. A random id lets both inserts succeed, which doubles LLM
 * spend and — because score ids are derived from the job execution id — shows
 * up as duplicate scores. Deriving the id from the dedup key lets the primary
 * key reject the loser instead.
 */
function createDeterministicJobExecutionId(params: {
  projectId: string;
  configId: string;
  traceId: string;
  datasetItemId: string | null;
  observationId: string | null;
}): string {
  return createW3CTraceId(
    JSON.stringify([
      "trace-eval",
      params.projectId,
      params.configId,
      params.traceId,
      params.datasetItemId,
      params.observationId,
    ]),
  );
}

export const createEvalJobs = async ({
  event,
  sourceEventType,
  jobTimestamp,
  enforcedJobTimeScope,
}: CreateEvalJobsParams) => {
  const span = getCurrentSpan();
  if (span) {
    span.setAttribute("messaging.bullmq.job.input.projectId", event.projectId);
  }

  // TRACE/DATASET rules are stored in the evaluator v2 model. The executor
  // still consumes a config-shaped projection.
  const rules = await prisma.evaluationRule.findMany({
    where: {
      projectId: event.projectId,
      status: "ACTIVE",
      targetObject: {
        in: [EvalTargetObject.TRACE, EvalTargetObject.DATASET],
      },
      ...("configId" in event ? { id: event.configId } : {}),
      // for dataset_run_item_upsert queue + trace queue, we do not want to execute evals on configs,
      // which were only allowed to run on historic data. Hence, we need to filter all configs which have "NEW" in the time_scope column.
      ...(enforcedJobTimeScope
        ? { timeScope: { has: enforcedJobTimeScope } }
        : {}),
      // `some` picks which rules load, not which assignments. Filtering the nested assignments
      // would shrink a two-evaluator rule to the one assignment toTraceEvalConfig then runs.
      assignments: {
        some: {
          projectId: event.projectId,
          evaluator: { blockedAt: null, type: EvalTemplateType.LLM_AS_JUDGE },
        },
      },
    },
    select: traceRuleSelect,
  });
  const configs = rules.flatMap((rule) => {
    const config = toTraceEvalConfig(rule);
    return config ? [config] : [];
  });
  if (configs.length === 0) {
    logger.debug(
      "No active evaluation jobs found for project",
      event.projectId,
    );

    // Cache the fact that there are no job configurations for this project
    // This helps avoid unnecessary database queries and queue processing
    await setNoEvalConfigsCache(event.projectId, "traceBased");

    return;
  }

  logger.debug(
    `Creating eval jobs for trace ${event.traceId} on project ${event.projectId}`,
  );

  // Early exit: Skip eval job creation for internal Langfuse traces from trace-upsert queue
  //
  // CONTEXT: Prevent infinite eval loops
  // Without this safeguard: user trace → eval → eval trace → another eval → infinite loop
  //
  // IMPLEMENTATION:
  // - Block internal environments and their public-ingestion aliases when coming from trace-upsert queue
  // - This excludes traces from prompt experiments that come via dataset-run-item-upsert queue
  // - Internal traces (e.g., eval executions) use LangfuseInternalTraceEnvironment enum values
  //
  // DEFENSE IN DEPTH:
  // - This check prevents eval job CREATION for internal traces
  // - Eval executors repeat the same environment check before execution
  //
  // See: packages/shared/src/server/llm (enforcement)
  // See: packages/shared/src/server/llm/types.ts (LangfuseInternalTraceEnvironment enum)
  if (
    sourceEventType === "trace-upsert" &&
    isInternalEvalEnvironment(event.traceEnvironment)
  ) {
    logger.debug("Skipping eval job creation for internal Langfuse trace", {
      traceId: event.traceId,
      environment: event.traceEnvironment,
    });

    return;
  }

  // Optimization: Fetch trace data once if we have multiple configs
  let cachedTrace: TraceDomain | undefined | null = null;
  recordIncrement("langfuse.evaluation-execution.config_count", configs.length);
  if (configs.length > 1) {
    try {
      // Metadata is the heaviest column on this fetch. Skip it unless a
      // trace-target config's filter reads it during in-memory evaluation;
      // keep it for unparsable filters so a metadata filter never evaluates
      // against an empty object.
      const cachedTraceNeedsMetadata = configs.some((config) => {
        if (config.targetObject !== EvalTargetObject.TRACE) {
          return false;
        }
        const parsedFilter = z.array(singleFilter).safeParse(config.filter);
        return (
          !parsedFilter.success ||
          inMemoryFilterRequiresMetadata(parsedFilter.data)
        );
      });

      // Fetch trace data and store it. If observation data is required, we'll make a separate lookup.
      // Those fields are used rarely, though.
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      cachedTrace = await getTraceById({
        traceId: event.traceId,
        projectId: event.projectId,
        timestamp:
          "exactTimestamp" in event && event.exactTimestamp
            ? new Date(event.exactTimestamp)
            : "timestamp" in event
              ? new Date(event.timestamp)
              : new Date(jobTimestamp),
        excludeInputOutput: true,
        excludeMetadata: !cachedTraceNeedsMetadata,
      });

      recordIncrement("langfuse.evaluation-execution.trace_cache_fetch", 1, {
        found: Boolean(cachedTrace).toString(),
        withMetadata: cachedTraceNeedsMetadata.toString(),
      });
      logger.debug("Fetched trace for evaluation optimization", {
        traceId: event.traceId,
        projectId: event.projectId,
        found: Boolean(cachedTrace),
        configCount: configs.length,
      });
    } catch (error) {
      logger.error("Failed to fetch trace for evaluation optimization", {
        error,
        traceId: event.traceId,
        projectId: event.projectId,
      });
      // Continue without cached trace - will fall back to individual queries
    }
  }

  // Note: We could parallelize this cache fetch with the getTraceById call above.
  // This should increase throughput, but will also put more pressure on ClickHouse.
  // Will keep it as-is for now, but that might be a useful change.
  const datasetConfigs = configs.filter(
    (c) => c.targetObject === EvalTargetObject.DATASET,
  );
  let cachedDatasetItemIds: { id: string; datasetId: string }[] | null = null;
  if (datasetConfigs.length > 1) {
    try {
      cachedDatasetItemIds = await getDatasetItemIdsByTraceIdCh({
        projectId: event.projectId,
        traceId: event.traceId,
        filter: [],
      });
      recordIncrement(
        "langfuse.evaluation-execution.dataset_item_cache_fetch",
        1,
        {
          found: Boolean(cachedDatasetItemIds.length > 0).toString(),
        },
      );
      logger.debug("Fetched dataset item ids for evaluation optimization", {
        traceId: event.traceId,
        projectId: event.projectId,
        found: Boolean(cachedDatasetItemIds.length > 0),
        configCount: datasetConfigs.length,
      });
    } catch (error) {
      logger.error(
        "Failed to fetch datasetItemIds for evaluation optimization",
        {
          error,
          traceId: event.traceId,
          projectId: event.projectId,
        },
      );
      // Continue without cached dataset item ids - will fall back to individual queries
    }
  }

  // Optimization: Batch query for existing job executions
  // Instead of querying once per config (N queries), fetch all at once and filter in-memory
  const configIds = configs
    .filter((c) => c.status !== JobConfigState.INACTIVE)
    .map((c) => c.id);

  const allExistingJobs =
    configIds.length > 0
      ? await prisma.jobExecution.findMany({
          select: {
            id: true,
            jobConfigurationId: true,
            jobInputDatasetItemId: true,
            jobInputObservationId: true,
          },
          where: {
            projectId: event.projectId,
            jobInputTraceId: event.traceId,
            jobConfigurationId: { in: configIds },
          },
        })
      : [];

  logger.debug(
    `Batched query for ${configIds.length} configs, found ${allExistingJobs.length} existing jobs`,
  );

  // Helper function to find matching job for a config
  const findMatchingJob = (
    configId: string,
    datasetItemId: string | null,
    observationId: string | null,
  ) => {
    return allExistingJobs.find(
      (job) =>
        job.jobConfigurationId === configId &&
        job.jobInputDatasetItemId === datasetItemId &&
        job.jobInputObservationId === observationId,
    );
  };

  const samplingTargetId =
    "observationId" in event && event.observationId
      ? event.observationId
      : event.traceId;
  const samplingValue = getDeterministicSamplingValue(samplingTargetId);

  for (const config of configs) {
    if (config.status === JobConfigState.INACTIVE) {
      logger.debug(`Skipping inactive config ${config.id}`);
      continue;
    }

    // Self-hosted only: Skip trace-level evaluators with invalid filters.
    // A bug (ff4b03c0b, Feb 2026) allowed score filters on trace evaluators, which the worker doesn't support.
    // Cloud deployments are fixed; self-hosters need this runtime check.
    if (
      !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION &&
      config.targetObject === EvalTargetObject.TRACE
    ) {
      const filterValidation = validateEvaluatorFiltersForTarget({
        targetObject: EvalTargetObject.TRACE,
        filter: config.filter,
      });
      if (!filterValidation.isValid) {
        logger.debug(
          `Skipping trace evaluator ${config.id} with invalid filters: ${filterValidation.issues[0]?.message}`,
        );
        continue;
      }
    }

    logger.debug("Creating eval job for config", config.id);
    const validatedFilter = z.array(singleFilter).parse(config.filter);

    const maxTimeStamp =
      "timestamp" in event &&
      new Date(event.timestamp).getTime() === new Date("2020-01-01").getTime() // min time for historic evals
        ? new Date()
        : undefined;

    // Check whether the trace already exists in the database.
    let traceExists = false;
    let traceTimestamp: Date | undefined = cachedTrace?.timestamp;

    let traceExistsDecisionSource: string;

    // Use cached trace for in-memory filtering when possible, i.e. all fields can
    // be checked in-memory.
    const traceFilter =
      config.targetObject === EvalTargetObject.TRACE ? validatedFilter : [];
    if (cachedTrace && !requiresDatabaseLookup(traceFilter)) {
      // Evaluate filter in memory using the cached trace
      traceExists = InMemoryFilterService.evaluateFilter(
        cachedTrace,
        traceFilter,
        mapTraceFilterColumn,
      );

      traceExistsDecisionSource = "cache";

      recordIncrement("langfuse.evaluation-execution.trace_cache_check", 1, {
        matches: traceExists ? "true" : "false",
      });
      logger.debug("Evaluated trace filter in memory", {
        traceId: event.traceId,
        configId: config.id,
        matches: traceExists,
        filterCount: traceFilter.length,
      });
    } else {
      // If the event is not a DatasetRunItemUpsertEventType and the trace has no special filters, we can already assume it's present
      let exists = false;
      let timestamp: Date | undefined = undefined;
      if (!("datasetItemId" in event) && traceFilter.length === 0) {
        exists = true;
        timestamp =
          "exactTimestamp" in event && event.exactTimestamp
            ? new Date(event.exactTimestamp)
            : undefined;

        traceExistsDecisionSource = "identifier";
      } else {
        // Fall back to database query for complex filters or when no cached trace
        ({ exists, timestamp } = await checkTraceExistsAndGetTimestamp({
          projectId: event.projectId,
          traceId: event.traceId,
          // Fallback to jobTimestamp if no payload timestamp is set to allow for successful retry attempts.
          timestamp:
            "timestamp" in event
              ? new Date(event.timestamp)
              : new Date(jobTimestamp),
          filter: traceFilter,
          maxTimeStamp,
          exactTimestamp:
            "exactTimestamp" in event && event.exactTimestamp
              ? new Date(event.exactTimestamp)
              : undefined,
        }));
        traceExistsDecisionSource = "lookup";
      }

      traceExists = exists;
      traceTimestamp = timestamp;
      recordIncrement("langfuse.evaluation-execution.trace_db_lookup", 1, {
        hasCached: Boolean(cachedTrace).toString(),
        requiredDatabaseLookup: requiresDatabaseLookup(traceFilter)
          ? "true"
          : "false",
      });
    }

    recordIncrement("langfuse.evaluation-execution.trace_exists_check", 1, {
      decisionSource: traceExistsDecisionSource,
      exists: String(traceExists),
    });

    const isDatasetConfig = config.targetObject === EvalTargetObject.DATASET;
    let datasetItem:
      | { id: string }
      | { id: string; observationId: string | null; validFrom?: Date }
      | undefined;
    if (isDatasetConfig) {
      const condition = tableColumnsToSqlFilterAndPrefix(
        config.targetObject === EvalTargetObject.DATASET ? validatedFilter : [],
        evalDatasetFormFilterCols,
        "dataset_items",
      );

      // If the target object is a dataset and the event type has a datasetItemId, we try to fetch it based on our filter
      if ("datasetItemId" in event && event.datasetItemId) {
        const versionCondition = event.datasetItemValidFrom
          ? Prisma.sql`AND valid_from = ${event.datasetItemValidFrom}::timestamp with time zone at time zone 'UTC'`
          : Prisma.sql`AND valid_to IS NULL`;

        const datasetItems = await prisma.$queryRaw<
          Array<{ id: string; valid_from: Date }>
        >(Prisma.sql`
          SELECT id, valid_from
          FROM (
            SELECT id, is_deleted, valid_from
            FROM dataset_items as di
            WHERE project_id = ${event.projectId}
              ${versionCondition}
              AND id = ${event.datasetItemId}
              ${condition}
            LIMIT 1
          ) latest
          WHERE is_deleted = false
        `);
        const latestDatasetItem = datasetItems.shift();
        datasetItem = latestDatasetItem
          ? {
              id: latestDatasetItem.id,
              validFrom: latestDatasetItem.valid_from,
            }
          : undefined;
      } else {
        // If the cached items are not null, we fetched all available datasetItemIds from the DB.
        // The dataset is the only allowed filter today, so it should be easy to check using our existing in memory filter.
        if (cachedDatasetItemIds !== null) {
          // Try to find from cache
          // Note that the entity is _NOT_ a true datasetRunItem here. The mapping logic works, but we need to keep in mind
          // that the `id` column is the `datasetItemId` _not_ the `datasetRunItemId`!
          datasetItem = cachedDatasetItemIds.find((di) =>
            InMemoryFilterService.evaluateFilter(
              di,
              config.targetObject === EvalTargetObject.DATASET
                ? validatedFilter
                : [],
              mapDatasetRunItemFilterColumn,
            ),
          );
        } else {
          const datasetItemIds = await getDatasetItemIdsByTraceIdCh({
            projectId: event.projectId,
            traceId: event.traceId,
            filter:
              config.targetObject === EvalTargetObject.DATASET
                ? validatedFilter
                : [],
          });
          datasetItem = datasetItemIds.shift();
        }
      }
    }

    // we must check if the dataset run item is linked at the observation level, if so, we must skip the eval job
    // triggered by the trace-upsert queue as it would prematurely create a score at the trace level which is incorrect.
    if (
      sourceEventType === "trace-upsert" &&
      !!datasetItem &&
      "observationId" in datasetItem &&
      !!datasetItem.observationId
    ) {
      logger.info(
        `Eval job for project ${event.projectId} and dataset item ${datasetItem.id} should be evaluated at observation level`,
      );
      continue;
    }

    // We also need to validate that the observation exists in case an observationId is set
    // If it's not set, we go into the retry loop. For the other events, we expect that the rerun
    // is unnecessary, as we're triggering this flow if either event comes in.
    const observationId =
      "observationId" in event && event.observationId
        ? event.observationId
        : undefined;
    if (observationId) {
      const observationExists = await checkObservationExists(
        event.projectId,
        observationId,
        // Fallback to jobTimestamp if no payload timestamp is set to allow for successful retry attempts.
        "timestamp" in event
          ? new Date(event.timestamp)
          : new Date(jobTimestamp),
      );
      if (!observationExists) {
        logger.warn(
          `Observation ${observationId} not found, will retry with exponential backoff`,
        );
        throw new ObservationNotFoundError({
          message: "Observation not found, retrying later",
          observationId,
        });
      }
    }

    // Find the existing job for the given configuration from the batched results.
    // We either use it for deduplication or we cancel it in case it became "deselected".
    const matchingJob = findMatchingJob(
      config.id,
      datasetItem?.id ?? null,
      observationId ?? null,
    );
    const existingJob = matchingJob ? [matchingJob] : [];

    // If we matched a trace for a trace event, we create a job or
    // if we have both trace and datasetItem.
    if (traceExists && (!isDatasetConfig || Boolean(datasetItem))) {
      // Derive the id from the dedup key instead of randomising it, so two
      // producers racing on the same (config, trace, dataset item, observation)
      // compute the same primary key. The insert below then relies on the
      // primary key to reject the loser atomically, which the read-then-write
      // existence check above cannot do on its own.
      const jobExecutionId = createDeterministicJobExecutionId({
        projectId: event.projectId,
        configId: config.id,
        traceId: event.traceId,
        datasetItemId: datasetItem?.id ?? null,
        observationId: observationId ?? null,
      });

      // deduplication: if a job exists already for a trace event, we do not create a new one.
      if (existingJob.length > 0) {
        logger.debug(
          `Eval job for config ${config.id} and trace ${event.traceId} already exists`,
        );
        continue;
      }

      const samplingRate = Number(config.sampling);
      if (
        !shouldSampleEvaluation({
          samplingValue,
          samplingRate,
        })
      ) {
        logger.debug(
          `Eval job for config ${config.id} and trace ${event.traceId} was sampled out`,
        );
        continue;
      }

      logger.debug(
        `Creating eval job execution for config ${config.id} and trace ${event.traceId}`,
      );

      // `createMany` with `skipDuplicates` turns the insert into an
      // INSERT ... ON CONFLICT DO NOTHING on the primary key. The racing loser
      // gets `count: 0` and must not enqueue, so one execution stays one
      // execution (and one score, since score ids derive from this id).
      const { count: insertedCount } = await prisma.jobExecution.createMany({
        data: [
          {
            id: jobExecutionId,
            projectId: event.projectId,
            jobConfigurationId: config.id,
            jobInputTraceId: event.traceId,
            jobInputTraceTimestamp: traceTimestamp,
            jobTemplateId: config.evalTemplateId,
            status: "PENDING",
            startTime: new Date(),
            ...(datasetItem
              ? {
                  jobInputDatasetItemId: datasetItem.id,
                  ...("validFrom" in datasetItem && {
                    jobInputDatasetItemValidFrom: datasetItem.validFrom,
                  }),
                  jobInputObservationId: observationId || null,
                }
              : {}),
          },
        ],
        skipDuplicates: true,
      });

      if (insertedCount === 0) {
        logger.debug(
          `Concurrent producer already created eval job ${jobExecutionId} for config ${config.id} and trace ${event.traceId}`,
        );
        continue;
      }

      try {
        // add the job to the next queue so that eval can be executed
        const shardingKey = `${event.projectId}-${jobExecutionId}`;
        await EvalExecutionQueue.getInstance({ shardingKey })?.add(
          QueueName.EvaluationExecution,
          {
            name: QueueJobs.EvaluationExecution,
            id: randomUUID(),
            timestamp: new Date(),
            payload: {
              projectId: event.projectId,
              jobExecutionId: jobExecutionId,
              delay: config.delay,
              ...(config.evaluatorId
                ? {
                    evaluatorId: config.evaluatorId,
                    evaluationRuleId: config.evaluationRuleId,
                  }
                : {}),
            },
            retryBaggage: {
              originalJobTimestamp: new Date(),
              attempt: 0,
            },
          },
          {
            delay: config.delay, // milliseconds
          },
        );
      } catch (e) {
        // The row exists but nothing will ever pick it up. Without this
        // compensating delete the BullMQ redelivery would hit the dedup check
        // above and skip re-enqueueing, stranding the execution at PENDING.
        logger.warn(
          `Failed to enqueue eval execution ${jobExecutionId}, removing the orphaned job execution so the retry can recreate it`,
          e,
        );
        await prisma.jobExecution.deleteMany({
          where: {
            id: jobExecutionId,
            projectId: event.projectId,
            status: JobExecutionStatus.PENDING,
          },
        });
        throw e;
      }
    } else {
      // if we do not have a match, and execution exists, we mark the job as cancelled
      // we do this, because a second trace event might 'deselect' a trace
      logger.debug(`Eval job for config ${config.id} did not match trace`);
      if (existingJob.length > 0) {
        logger.debug(
          `Cancelling eval job for config ${config.id} and trace ${event.traceId}`,
        );

        // Note: we use updateMany to gracefully handle case where execution is already completed; we silently skip the update.
        await prisma.jobExecution.updateMany({
          where: {
            id: existingJob[0].id,
            projectId: event.projectId,
            status: {
              not: JobExecutionStatus.COMPLETED,
            },
          },
          data: {
            status: JobExecutionStatus.CANCELLED,
            endTime: new Date(),
          },
        });
      }
    }

    // Yield to event loop between config iterations to prevent stalls
    await new Promise((resolve) => setImmediate(resolve));
  }
};

/**
 * Core LLM-as-a-judge evaluation execution.
 *
 * This is the shared core logic used by both trace-level evals (via `evaluate()`)
 * and observation-level evals (via observation eval processor).
 *
 * It handles:
 * - Compiling the prompt with extracted variables
 * - Calling the LLM with structured output
 * - Returning the validated eval output and completion metadata
 *
 * Note: Callers are responsible for:
 * - Fetching and validating job, config, and template
 * - Checking if job is cancelled
 * - Extracting variables from trace/observation data
 *
 * @param params.projectId - The project ID
 * @param params.jobExecutionId - The job execution ID
 * @param params.job - Pre-fetched job execution
 * @param params.config - Pre-fetched job configuration
 * @param params.template - Pre-fetched eval template
 * @param params.extractedVariables - Pre-extracted variables from trace/observation data
 * @param params.executionMetadata - Metadata identifying this eval execution
 * @param params.deps - Optional dependency injection for testing (defaults to production deps)
 * @param params.evaluatorId - Evaluator v2 identity, when the execution came from an evaluation rule
 */
export async function runLLMAsJudgeEvaluation({
  projectId,
  jobExecutionId,
  job,
  config,
  template,
  extractedVariables,
  executionMetadata,
  evaluationContext,
  deps,
  evaluatorId,
}: {
  projectId: string;
  jobExecutionId: string;
  job: JobExecution;
  config: JobConfiguration;
  template: EvalTemplateLlmAsAJudge;
  extractedVariables: ExtractedVariable[];
  executionMetadata: Record<string, string>;
  evaluationContext: EvalExecutionContext;
  deps: EvalExecutionDeps;
  /**
   * Evaluator v2 identity, when the execution came from an evaluation rule.
   * It selects where a self-inflicted pause is recorded: on the evaluator, so
   * every rule using it stops, rather than on a single job configuration.
   */
  evaluatorId?: string;
}): Promise<EvalExecutionResult> {
  const pauseEvaluator = (
    blockReason: Parameters<typeof blockEvaluator>[0]["blockReason"],
    source: EvaluatorBlockSource,
  ) => {
    if (!evaluatorId) {
      throw new UnrecoverableError(
        `Evaluator identity missing for job ${jobExecutionId}`,
      );
    }
    const blockMessage = getEvaluatorBlockMetadata(blockReason).message;
    return blockEvaluator({
      projectId,
      evaluatorId,
      blockReason,
      blockMessage,
      source,
    });
  };

  return instrumentAsync(
    { name: "eval.execute-llm-as-judge" },
    async (span) => {
      span.setAttribute("langfuse.project.id", projectId);
      span.setAttribute("eval.job_execution.id", jobExecutionId);
      span.setAttribute("eval.template.name", template.name);
      span.setAttribute("eval.template.id", template.id);
      span.setAttribute("eval.template.version", template.version);
      span.setAttribute("eval.score.name", config.scoreName);
      span.setAttributes(buildEvalExecutionSpanAttributes({ config }));
      span.setAttribute("eval.execution.stage", "compile_prompt");
      if (job.jobInputTraceId) {
        span.setAttribute("eval.target.trace_id", job.jobInputTraceId);
      }
      if (job.jobInputObservationId) {
        span.setAttribute(
          "eval.target.observation_id",
          job.jobInputObservationId,
        );
      }
      if (job.jobInputDatasetItemId) {
        span.setAttribute(
          "eval.target.dataset_item_id",
          job.jobInputDatasetItemId,
        );
      }

      logger.debug(
        `Executing LLM-as-judge evaluation for job ${jobExecutionId} in project ${projectId}`,
      );

      // Parse and validate output definition
      span.setAttribute("eval.execution.stage", "validate_template");
      const parsedOutputDefinition =
        PersistedEvalOutputDefinitionSchema.safeParse(
          template.outputDefinition,
        );

      if (!parsedOutputDefinition.success) {
        span.setAttribute("eval.execution.outcome", "invalid_template");
        throw new UnrecoverableError(
          "Output definition not found or invalid in evaluation template",
        );
      }

      // Get model configuration
      span.setAttribute("eval.execution.stage", "resolve_model_config");
      const modelConfig = await deps.fetchModelConfig({
        projectId,
        provider: template.provider ?? undefined,
        model: template.model ?? undefined,
        modelParams: template.modelParams as Record<string, unknown> | null,
      });

      if (!modelConfig.valid) {
        const blockReason = getBlockReasonForInvalidModelConfig({
          templateProvider: template.provider,
          templateModel: template.model,
          error: modelConfig.error,
        });

        span.setAttributes({
          "eval.execution.outcome": "blocked",
          "eval.llm.blocked": true,
          "eval.llm.block.reason": blockReason,
          "eval.llm.block.source": EvaluatorBlockSource.INVALID_MODEL_CONFIG,
        });

        await pauseEvaluator(
          blockReason,
          EvaluatorBlockSource.INVALID_MODEL_CONFIG,
        );
        span.setAttribute("eval.llm.block.applied", true);

        logger.warn(
          `Eval job ${jobExecutionId} will fail. ${modelConfig.error}`,
        );
        throw new UnrecoverableError(
          `Invalid model configuration for job ${jobExecutionId}: ${modelConfig.error}`,
        );
      }

      span.setAttribute("eval.model.provider", modelConfig.config.provider);
      span.setAttribute("eval.model.name", modelConfig.config.model);
      span.setAttribute("eval.model.adapter", modelConfig.config.adapter);

      const executionTraceId = createW3CTraceId(jobExecutionId);
      span.setAttributes({
        "eval.execution.trace_id": executionTraceId,
        "eval.execution.stage": "call_llm",
      });

      // Call LLM
      let llmErrorClassification:
        | EvaluatorLlmErrorClassification
        | null
        | undefined;
      let evaluatorExecution: Awaited<ReturnType<typeof executeLlmEvaluator>>;
      try {
        evaluatorExecution = await executeLlmEvaluator({
          promptMessages: getEvaluatorPromptMessages({
            prompt: template.prompt,
            promptMessages: template.promptMessages,
          }),
          variables: extractedVariables,
          outputDefinition: parsedOutputDefinition.data,
          callLlm: async ({
            messages,
            compiledOutputDefinition,
            interpolatedPrompt,
          }) => {
            logger.debug(
              `Compiled prompt for job ${jobExecutionId}: ${interpolatedPrompt.slice(0, 200)}...`,
            );
            span.setAttribute(
              "eval.score.data_type",
              compiledOutputDefinition.resolvedOutputDefinition.dataType,
            );

            return instrumentAsync(
              { name: "eval.call-llm" },
              async (llmSpan) => {
                llmSpan.setAttribute("langfuse.project.id", projectId);
                llmSpan.setAttribute("eval.job_execution.id", jobExecutionId);
                llmSpan.setAttribute(
                  "eval.execution.trace_id",
                  executionTraceId,
                );
                llmSpan.setAttribute("eval.job_configuration.id", config.id);
                llmSpan.setAttribute("eval.template.id", template.id);
                llmSpan.setAttribute("eval.template.version", template.version);
                llmSpan.setAttribute("eval.score.name", config.scoreName);
                llmSpan.setAttribute(
                  "eval.score.data_type",
                  compiledOutputDefinition.resolvedOutputDefinition.dataType,
                );
                llmSpan.setAttribute(
                  "eval.model.provider",
                  modelConfig.config.provider,
                );
                llmSpan.setAttribute(
                  "eval.model.name",
                  modelConfig.config.model,
                );
                llmSpan.setAttribute(
                  "eval.model.adapter",
                  modelConfig.config.adapter,
                );

                try {
                  const output = await deps.callLLM({
                    messages,
                    modelConfig: modelConfig.config,
                    structuredOutputSchema:
                      compiledOutputDefinition.outputResultSchema,
                    traceSinkParams: {
                      targetProjectId: projectId,
                      traceId: executionTraceId,
                      traceName: `Execute evaluator: ${template.name}`,
                      environment: LangfuseInternalTraceEnvironment.LLMJudge,
                      metadata: executionMetadata,
                      evaluationContext,
                    },
                  });
                  llmSpan.setAttribute("eval.llm.outcome", "success");
                  return output;
                } catch (e) {
                  llmErrorClassification = classifyEvaluatorLlmError(e);
                  llmSpan.setAttributes(
                    buildEvaluatorLlmErrorSpanAttributes(
                      llmErrorClassification,
                    ),
                  );
                  llmSpan.setAttribute(
                    "eval.llm.outcome",
                    llmErrorClassification?.blockReason ? "blocked" : "error",
                  );
                  throw e;
                }
              },
            );
          },
        });
      } catch (e) {
        const classification =
          llmErrorClassification ?? classifyEvaluatorLlmError(e);
        span.setAttributes(
          buildEvaluatorLlmErrorSpanAttributes(classification),
        );
        span.setAttribute(
          "eval.execution.outcome",
          classification?.blockReason ? "blocked" : "llm_error",
        );

        if (classification?.blockReason) {
          const blockReason = classification.blockReason;
          await pauseEvaluator(
            blockReason,
            EvaluatorBlockSource.LLM_COMPLETION_ERROR,
          );
          span.setAttribute("eval.llm.block.applied", true);
        }

        throw e;
      }

      span.setAttribute("eval.execution.stage", "validate_llm_output");
      const parsedLLMOutput = evaluatorExecution.output;

      if (!parsedLLMOutput.success) {
        span.setAttribute("eval.execution.outcome", "invalid_model_output");
        throw new UnrecoverableError(
          `Invalid LLM response format from model ${modelConfig.config.model}. Error: ${parsedLLMOutput.error}`,
        );
      }

      logger.debug(
        `Job ${jobExecutionId} received LLM output: ${
          parsedLLMOutput.data.dataType === ScoreDataTypeEnum.NUMERIC
            ? `score=${parsedLLMOutput.data.score}`
            : parsedLLMOutput.data.dataType === ScoreDataTypeEnum.BOOLEAN
              ? `score=${parsedLLMOutput.data.score}`
              : `matches=${parsedLLMOutput.data.matches.join(",")}`
        }`,
      );

      const scores = toNormalizedScores({
        outputResult: parsedLLMOutput.data,
        scoreName: config.scoreName,
      });

      span.setAttribute("eval.score.count", scores.length);
      span.setAttributes({
        "eval.execution.stage": "completed",
        "eval.execution.outcome": "success",
      });

      return {
        scores,
        executionTraceId,
        metadata: executionMetadata,
        evaluationContext,
      };
    },
  );
}

function toNormalizedScores(params: {
  outputResult: EvalOutputResult;
  scoreName: string;
}): CodeEvalScoreWithName[] {
  const { outputResult, scoreName } = params;
  const baseFields = {
    name: scoreName,
    comment: outputResult.reasoning,
  };

  if (outputResult.dataType === ScoreDataTypeEnum.NUMERIC) {
    return [
      {
        ...baseFields,
        dataType: ScoreDataTypeEnum.NUMERIC,
        value: outputResult.score,
      },
    ];
  }

  if (outputResult.dataType === ScoreDataTypeEnum.BOOLEAN) {
    return [
      {
        ...baseFields,
        dataType: ScoreDataTypeEnum.BOOLEAN,
        value: outputResult.score ? 1 : 0,
      },
    ];
  }

  return outputResult.matches.map((value) => ({
    ...baseFields,
    dataType: ScoreDataTypeEnum.CATEGORICAL,
    value,
  }));
}

export async function executeLLMAsJudgeEvaluation(
  params: Omit<
    Parameters<typeof runLLMAsJudgeEvaluation>[0],
    "deps" | "executionMetadata" | "evaluationContext"
  > & {
    environment: string;
    deps?: EvalExecutionDeps;
    evaluationRuleId?: string;
    assignmentId?: string;
    evaluatorVersionId?: string;
  },
): Promise<void> {
  const deps = params.deps ?? createProductionEvalExecutionDeps();
  const executionData = buildEvalExecutionData({
    type: "JOB",
    jobExecutionId: params.jobExecutionId,
    jobConfigurationId: params.job.jobConfigurationId,
    ...(params.evaluatorId
      ? {
          evaluationRuleId: params.evaluationRuleId,
          assignmentId: params.assignmentId,
          evaluatorId: params.evaluatorId,
          evaluatorVersionId: params.evaluatorVersionId,
        }
      : {}),
    targetTraceId: params.job.jobInputTraceId,
    targetObservationId: params.job.jobInputObservationId,
    targetDatasetItemId: params.job.jobInputDatasetItemId,
  });
  const result = await runLLMAsJudgeEvaluation({
    ...params,
    deps,
    ...executionData,
  });

  await completeEvalExecution({
    projectId: params.projectId,
    jobExecutionId: params.jobExecutionId,
    traceId: params.job.jobInputTraceId,
    observationId: params.job.jobInputObservationId,
    environment: params.environment,
    deps,
    result,
  });
}

const traceEvaluatorInclude = {
  versions: { orderBy: { version: "desc" as const }, take: 1 },
} satisfies Prisma.EvaluatorInclude;

async function resolveTraceExecution(params: {
  event: z.infer<typeof EvalExecutionEvent>;
  job: JobExecution;
}) {
  const { event, job } = params;
  if (event.evaluatorId && !event.evaluationRuleId) {
    return { type: "cancelled" as const, reason: "rule-identity-missing" };
  }

  // The evaluator-v2 backfill preserves job_configuration.id as the rule id.
  // This lets jobs queued before the new identity fields were added resolve
  // through the migrated rule and block the evaluator row on failure.
  const evaluationRuleId = event.evaluationRuleId ?? job.jobConfigurationId;
  const assignment = await prisma.evaluationRuleEvaluatorAssignment.findFirst({
    where: {
      projectId: event.projectId,
      evaluationRuleId,
      ...(event.evaluatorId ? { evaluatorId: event.evaluatorId } : {}),
      evaluator: {
        projectId: event.projectId,
        type: EvalTemplateType.LLM_AS_JUDGE,
      },
    },
    include: {
      evaluationRule: true,
      evaluator: { include: traceEvaluatorInclude },
    },
  });
  if (!assignment) {
    return { type: "cancelled" as const, reason: "assignment-unavailable" };
  }
  const { evaluationRule: rule, evaluator } = assignment;
  if (rule.status !== JobConfigState.ACTIVE || evaluator.blockedAt) {
    return { type: "cancelled" as const, reason: "rule-not-executable" };
  }
  const version = evaluator.versions[0];
  if (!version?.prompt || !version.outputDefinition) {
    return { type: "cancelled" as const, reason: "version-unavailable" };
  }

  const config = {
    id: rule.id,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
    projectId: rule.projectId,
    jobType: "EVAL",
    status: rule.status,
    blockedAt: null,
    blockReason: null,
    blockMessage: null,
    evalTemplateId: version.id,
    scoreName: evaluator.name,
    filter: rule.filter,
    targetObject: rule.targetObject,
    variableMapping:
      assignment.variableMapping ?? version.variableMapping ?? [],
    sampling: rule.sampling,
    delay: rule.delay,
    timeScope: rule.timeScope,
  } as JobConfiguration;
  const template = {
    id: version.id,
    createdAt: version.createdAt,
    updatedAt: version.createdAt,
    projectId: evaluator.projectId,
    name: evaluator.name,
    version: version.version,
    prompt: version.prompt,
    promptMessages: version.promptMessages,
    type: evaluator.type,
    partner: version.partner,
    model: version.model,
    provider: version.provider,
    modelParams: version.modelParams,
    vars: version.vars,
    outputDefinition: version.outputDefinition,
    sourceCode: null,
    sourceCodeLanguage: null,
  } as EvalTemplateLlmAsAJudge;
  return {
    type: "v2" as const,
    config,
    template,
    evaluationRuleId: rule.id,
    assignmentId: assignment.id,
    evaluatorId: evaluator.id,
    evaluatorVersionId: version.id,
  };
}

async function cancelTraceExecution(
  job: JobExecution,
  projectId: string,
  reason: string,
) {
  logger.debug("Cancelling trace evaluation job", {
    jobExecutionId: job.id,
    projectId,
    reason,
  });
  await prisma.jobExecution.update({
    where: { id: job.id, projectId },
    data: { status: JobExecutionStatus.CANCELLED, endTime: new Date() },
  });
}

/**
 * Evaluates a trace-level job by extracting variables from tracing data
 * and calling the shared LLM-as-a-judge execution.
 */
export const evaluate = async ({
  event,
}: {
  event: z.infer<typeof EvalExecutionEvent>;
}) => {
  logger.debug(
    `Evaluating trace-level job ${event.jobExecutionId} for project ${event.projectId}`,
  );

  // Fetch job to get trace info for variable extraction
  const job = await prisma.jobExecution.findFirst({
    where: {
      id: event.jobExecutionId,
      projectId: event.projectId,
    },
  });

  if (!job) {
    logger.info(
      `Job execution ${event.jobExecutionId} not found. It may have been deleted.`,
    );
    return;
  }

  if (job.status === "CANCELLED" || !job.jobInputTraceId) {
    logger.debug(`Job ${job.id} was cancelled or has no trace input.`);
    await prisma.jobExecution.delete({
      where: {
        id: job.id,
        projectId: event.projectId,
      },
    });
    return;
  }

  const resolved = await resolveTraceExecution({ event, job });
  if (resolved.type === "cancelled") {
    await cancelTraceExecution(job, event.projectId, resolved.reason);
    return;
  }
  const { config, template } = resolved;

  if (!isEvalRuleExecutable(config)) {
    logger.debug(
      `Skipping non-executable config ${config.id} for job ${job.id}`,
    );
    await prisma.jobExecution.update({
      where: {
        id: job.id,
        projectId: event.projectId,
      },
      data: {
        status: JobExecutionStatus.CANCELLED,
        endTime: new Date(),
      },
    });
    return;
  }

  // Extract variables from tracing data
  const parsedVariableMapping = variableMappingList.parse(
    config.variableMapping,
  );

  const extractedVariables = await extractVariablesFromTracingData({
    projectId: event.projectId,
    variables: template.vars,
    traceId: job.jobInputTraceId,
    traceTimestamp: job.jobInputTraceTimestamp ?? undefined,
    datasetItemId: job.jobInputDatasetItemId ?? undefined,
    datasetItemValidFrom: job.jobInputDatasetItemValidFrom ?? undefined,
    variableMapping: parsedVariableMapping,
  });

  logger.debug(
    `Extracted ${extractedVariables.length} variables for job ${event.jobExecutionId}`,
  );

  const environment =
    extractedVariables.find((variable) => variable.environment)?.environment ??
    DEFAULT_TRACE_ENVIRONMENT;

  // Final fail-closed loop safeguard: never execute an eval whose target
  // lives in an internal Langfuse environment, regardless of which scheduling
  // path created the job. See isEvalTargetEnvironmentAllowed. The environment
  // is derived from the extracted trace/observation variables; mappings
  // without any tracing-data variable fall back to the default environment
  // and rely on the scheduling-time guards.
  if (!isEvalTargetEnvironmentAllowed(environment)) {
    logger.warn(
      "Cancelling eval job targeting an internal Langfuse environment",
      {
        jobExecutionId: event.jobExecutionId,
        projectId: event.projectId,
        environment,
        traceId: job.jobInputTraceId,
      },
    );
    recordIncrement(
      "langfuse.evaluation-execution.internal_target_blocked",
      1,
      {
        source: "trace-eval",
      },
    );
    await prisma.jobExecution.update({
      where: { id: job.id, projectId: event.projectId },
      data: { status: JobExecutionStatus.CANCELLED, endTime: new Date() },
    });

    return;
  }

  // Execute the shared LLM-as-a-judge evaluation
  await executeLLMAsJudgeEvaluation({
    projectId: event.projectId,
    jobExecutionId: event.jobExecutionId,
    job,
    config,
    template: template as EvalTemplateLlmAsAJudge,
    extractedVariables,
    environment,
    ...(resolved.type === "v2"
      ? {
          evaluationRuleId: resolved.evaluationRuleId,
          assignmentId: resolved.assignmentId,
          evaluatorId: resolved.evaluatorId,
          evaluatorVersionId: resolved.evaluatorVersionId,
        }
      : {}),
  });
};

export async function extractVariablesFromTracingData({
  projectId,
  variables,
  traceId,
  variableMapping,
  traceTimestamp,
  datasetItemId,
  datasetItemValidFrom,
}: {
  projectId: string;
  variables: string[];
  traceId: string;
  // this here are variables which were inserted by users. Need to validate before DB query.
  variableMapping: z.infer<typeof variableMappingList>;
  traceTimestamp?: Date;
  datasetItemId?: string;
  datasetItemValidFrom?: Date;
}): Promise<ExtractedVariable[]> {
  // Internal cache for this function call to avoid duplicate database lookups.
  // We do not cache dataset items as Postgres is cheaper than ClickHouse.
  const traceCache = new Map<string, TraceDomain | null>();
  const observationCache = new Map<string, Observation | null>();

  const results: ExtractedVariable[] = [];

  // We run through this list sequentially to make use of caching.
  // The performance improvement by parallel execution should be less than the improvement we gain by caching.
  for (const variable of variables) {
    const mapping = variableMapping.find(
      (m) => m.templateVariable === variable,
    );

    // validation ensures that mapping is always defined for a variable
    if (!mapping) {
      logger.debug(`No mapping found for variable ${variable}`);
      results.push({ var: variable, value: "" });
      continue;
    }
    if (mapping.langfuseObject === "dataset_item") {
      if (!datasetItemId) {
        logger.warn(
          `No dataset item id found for variable ${variable}. Eval will succeed without dataset item input.`,
        );
        results.push({ var: variable, value: "" });
        continue;
      }

      // find the internal definitions of the column
      const safeInternalColumn = availableDatasetEvalVariables
        .find((o) => o.id === "dataset_item")
        ?.availableColumns.find((col) => col.id === mapping.selectedColumnId);

      // if no column was found, we still process with an empty variable
      if (!safeInternalColumn?.id) {
        logger.error(
          `No column found for variable ${variable} and column ${mapping.selectedColumnId}`,
        );
        results.push({ var: variable, value: "" });
        continue;
      }

      const prismaField = snakeToCamel(safeInternalColumn.id);
      const datasetItem = await prisma.datasetItem.findFirst({
        select: { [prismaField]: true },
        where: {
          id: datasetItemId,
          projectId,
          // Conditional: exact match if version known, otherwise latest
          ...(datasetItemValidFrom
            ? { validFrom: datasetItemValidFrom }
            : { validTo: null }),
        },
      });

      // user facing errors
      if (!datasetItem) {
        logger.error(
          `Dataset item ${datasetItemId} for project ${projectId} not found. Please ensure the mapped data on the dataset item exists and consider extending the job delay.`,
        );
        // this should only happen for deleted data.
        throw Error(
          `Dataset item ${datasetItemId} for project ${projectId} not found. Please ensure the mapped data on the dataset item exists and consider extending the job delay.`,
        );
      }

      results.push({
        var: variable,
        value: parseDatabaseRowValue(datasetItem, mapping),
      });
      continue;
    }

    if (mapping.langfuseObject === "trace") {
      // find the internal definitions of the column
      const safeInternalColumn = availableTraceEvalVariables
        .find((o) => o.id === "trace")
        ?.availableColumns.find((col) => col.id === mapping.selectedColumnId);

      // if no column was found, we still process with an empty variable
      if (!safeInternalColumn?.id) {
        logger.error(
          `No column found for variable ${variable} and column ${mapping.selectedColumnId}`,
        );
        results.push({ var: variable, value: "" });
        continue;
      }

      const traceCacheKey = `${projectId}:${traceId}`;
      let trace = traceCache.get(traceCacheKey);
      if (!traceCache.has(traceCacheKey)) {
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        trace = await getTraceById({
          traceId,
          projectId,
          timestamp: traceTimestamp,
        });
        traceCache.set(traceCacheKey, trace ?? null);
      }

      // user facing errors
      if (!trace) {
        logger.warn(
          `Trace ${traceId} for project ${projectId} not found. Please ensure the mapped data on the trace exists and consider extending the job delay.`,
        );
        // this should only happen for deleted data or replication lags across clickhouse nodes.
        throw Error(
          `Trace ${traceId} for project ${projectId} not found. Please ensure the mapped data on the trace exists and consider extending the job delay.`,
        );
      }

      results.push({
        var: variable,
        value: parseDatabaseRowValue(trace, mapping),
        environment: trace.environment,
      });
      continue;
    }

    const observationTypes = availableTraceEvalVariables
      .filter((obj) => obj.id !== "trace") // trace is handled separately above
      .map((obj) => obj.id);

    if (
      mapping.langfuseObject &&
      observationTypes.includes(mapping.langfuseObject)
    ) {
      const safeInternalColumn = availableTraceEvalVariables
        .find((o) => o.id === mapping.langfuseObject)
        ?.availableColumns.find((col) => col.id === mapping.selectedColumnId);

      if (!mapping.objectName) {
        logger.info(
          `No object name found for variable ${variable} and object ${mapping.langfuseObject}`,
        );
        results.push({ var: variable, value: "" });
        continue;
      }

      if (!safeInternalColumn?.id) {
        logger.warn(
          `No column found for variable ${variable} and column ${mapping.selectedColumnId}`,
        );
        results.push({ var: variable, value: "" });
        continue;
      }

      const observationCacheKey = `${projectId}:${traceId}:${mapping.objectName}`;
      let observation = observationCache.get(observationCacheKey);
      if (!observationCache.has(observationCacheKey)) {
        const observations = await getObservationForTraceIdByName({
          traceId,
          projectId,
          name: mapping.objectName,
          timestamp: traceTimestamp,
          fetchWithInputOutput: true,
        });
        observation = observations.shift() || null; // We only take the first match and ignore duplicate generation-names in a trace.
        observationCache.set(observationCacheKey, observation);
      }

      // user facing errors
      if (!observation) {
        logger.warn(
          `Observation ${mapping.objectName} for trace ${traceId} not found. Please ensure the mapped data exists and consider extending the job delay.`,
        );
        // this should only happen for deleted data or data replication lags across clickhouse nodes.
        throw new UnrecoverableError(
          `Observation ${mapping.objectName} for trace ${traceId} not found. Please ensure the mapped data exists and consider extending the job delay.`,
        );
      }

      results.push({
        var: variable,
        value: parseDatabaseRowValue(observation, mapping),
        environment: observation.environment,
      });
      continue;
    }

    throw new Error(`Unknown object type ${mapping.langfuseObject}`);
  }

  return results;
}

const snakeToCamel = (s: string) =>
  s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

// Returns the typed value extracted from a database row. The shared LLM
// evaluator runtime stringifies it during prompt substitution; code-based
// evaluators consume the typed value directly.
const parseDatabaseRowValue = (
  dbRow: Record<string, unknown>,
  mapping: z.infer<typeof variableMapping>,
): unknown => {
  // Prisma returns camelCase keys, but selectedColumnId may be snake_case
  const selectedColumn =
    dbRow[mapping.selectedColumnId] ??
    dbRow[snakeToCamel(mapping.selectedColumnId)];

  if (logger.isLevelEnabled("debug") && mapping.jsonSelector) {
    logger.debug(
      `Parsing JSON for json selector ${mapping.jsonSelector} from ${JSON.stringify(selectedColumn)}`,
    );
  }

  const { value, error } = extractValueFromObject(
    { [mapping.selectedColumnId]: selectedColumn },
    mapping.selectedColumnId,
    mapping.jsonSelector ?? undefined,
  );

  if (error) {
    logger.error(
      `Error parsing JSON for json selector ${mapping.jsonSelector}. Falling back to original value.`,
      error,
    );
  }

  return value;
};
