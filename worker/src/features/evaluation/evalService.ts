import { randomUUID } from "crypto";
import { z } from "zod";
import {
  JobConfigState,
  JobExecutionStatus,
  type JobExecution,
  type JobConfiguration,
  type EvalTemplate,
} from "@prisma/client";
import {
  QueueJobs,
  QueueName,
  EvalExecutionEvent,
  traceException,
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
  isLLMCompletionError,
  blockEvaluatorConfigs,
  EvaluatorBlockSource,
} from "@langfuse/shared/src/server";
import {
  mapTraceFilterColumn,
  requiresDatabaseLookup,
} from "./traceFilterUtils";
import {
  Prisma,
  compilePersistedEvalOutputDefinition,
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
  EvaluatorBlockReason,
  getEvaluatorBlockMetadata,
  getBlockReasonForInvalidModelConfig,
  isJobConfigExecutable,
  PersistedEvalOutputDefinitionSchema,
  ScoreDataTypeEnum,
  validateEvalOutputResult,
  extractValueFromObject,
  validateEvaluatorFiltersForTarget,
} from "@langfuse/shared";
import { env } from "../../env";
import { prisma } from "@langfuse/shared/src/db";
import { createW3CTraceId } from "../utils";
import { UnrecoverableError } from "../../errors/UnrecoverableError";
import { ObservationNotFoundError } from "../../errors/ObservationNotFoundError";
import {
  compileEvalPrompt,
  buildEvalMessages,
  buildEvalExecutionMetadata,
  getEnvironmentFromVariables,
} from "./evalRuntime";
import { buildEvalScoreWritePayloads } from "./evalScoreEvent";
import {
  type EvalExecutionDeps,
  createProductionEvalExecutionDeps,
} from "./evalExecutionDeps";
import { ExtractedVariable } from "./observationEval/extractObservationVariables";

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

  // Fetch all configs for a given project. Those may be dataset or trace configs.
  const configs = await prisma.jobConfiguration.findMany({
    where: {
      jobType: "EVAL",
      projectId: event.projectId,
      status: "ACTIVE",
      blockedAt: null,
      targetObject: {
        in: [EvalTargetObject.TRACE, EvalTargetObject.DATASET],
      },
      ...("configId" in event ? { id: event.configId } : {}),
      // for dataset_run_item_upsert queue + trace queue, we do not want to execute evals on configs,
      // which were only allowed to run on historic data. Hence, we need to filter all configs which have "NEW" in the time_scope column.
      ...(enforcedJobTimeScope
        ? { timeScope: { has: enforcedJobTimeScope } }
        : {}),
    },
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
  // - Block ALL traces with environment starting with "langfuse-" when coming from trace-upsert queue
  // - This excludes traces from prompt experiments that come via dataset-run-item-upsert queue
  // - Internal traces (e.g., eval executions) use LangfuseInternalTraceEnvironment enum values
  //
  // DUAL SAFEGUARD:
  // - This check prevents eval job CREATION for internal traces
  // - fetchLLMCompletion.ts enforces that internal traces MUST use "langfuse-" prefix
  //
  // See: packages/shared/src/server/llm/fetchLLMCompletion.ts (enforcement)
  // See: packages/shared/src/server/llm/types.ts (LangfuseInternalTraceEnvironment enum)
  if (
    sourceEventType === "trace-upsert" &&
    event.traceEnvironment?.startsWith("langfuse")
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
      // Fetch trace data and store it. If observation data is required, we'll make a separate lookup.
      // Those fields are used rarely, though.
      cachedTrace = await getTraceById({
        traceId: event.traceId,
        projectId: event.projectId,
        timestamp:
          "exactTimestamp" in event && event.exactTimestamp
            ? new Date(event.exactTimestamp)
            : "timestamp" in event
              ? new Date(event.timestamp)
              : new Date(jobTimestamp),
        clickhouseFeatureTag: "eval-create",
        excludeInputOutput: true,
        excludeMetadata: false, // Metadata needed for in-memory filter evaluation
      });

      recordIncrement("langfuse.evaluation-execution.trace_cache_fetch", 1, {
        found: Boolean(cachedTrace).toString(),
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
      let exists: boolean = false;
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
      const jobExecutionId = randomUUID();

      // deduplication: if a job exists already for a trace event, we do not create a new one.
      if (existingJob.length > 0) {
        logger.debug(
          `Eval job for config ${config.id} and trace ${event.traceId} already exists`,
        );
        continue;
      }

      // apply sampling. Only if the job is sampled, we create a job
      // user supplies a number between 0 and 1, which is the probability of sampling
      if (Number(config.sampling) !== 1) {
        const random = Math.random();
        if (random > Number(config.sampling)) {
          logger.debug(
            `Eval job for config ${config.id} and trace ${event.traceId} was sampled out`,
          );
          continue;
        }
      }

      logger.debug(
        `Creating eval job execution for config ${config.id} and trace ${event.traceId}`,
      );

      await prisma.jobExecution.create({
        data: {
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
      });

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
 * - Persisting the score to S3 and queueing for ingestion
 * - Updating job execution status
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
 * @param params.deps - Optional dependency injection for testing (defaults to production deps)
 */
export async function executeLLMAsJudgeEvaluation({
  projectId,
  jobExecutionId,
  job,
  config,
  template,
  extractedVariables,
  environment,
  deps = createProductionEvalExecutionDeps(),
}: {
  projectId: string;
  jobExecutionId: string;
  job: JobExecution;
  config: JobConfiguration;
  template: EvalTemplate;
  extractedVariables: ExtractedVariable[];
  environment: string;
  deps?: EvalExecutionDeps;
}): Promise<void> {
  return instrumentAsync(
    { name: "eval.execute-llm-as-judge" },
    async (span) => {
      span.setAttribute("langfuse.project.id", projectId);
      span.setAttribute("eval.job_execution.id", jobExecutionId);
      span.setAttribute("eval.template.name", template.name);
      span.setAttribute("eval.template.id", template.id);
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

      // Compile the prompt with extracted variables
      let prompt: string;
      try {
        prompt = compileEvalPrompt({
          templatePrompt: template.prompt,
          variables: extractedVariables,
        });
      } catch (e) {
        logger.error(
          `Failed to compile prompt for job ${jobExecutionId}. Eval will fail. ${e}`,
        );
        prompt = template.prompt;
      }

      logger.debug(
        `Compiled prompt for job ${jobExecutionId}: ${prompt.slice(0, 200)}...`,
      );

      // Parse and validate output definition
      const parsedOutputDefinition =
        PersistedEvalOutputDefinitionSchema.safeParse(
          template.outputDefinition,
        );

      if (!parsedOutputDefinition.success) {
        throw new UnrecoverableError(
          "Output definition not found or invalid in evaluation template",
        );
      }

      const compiledOutputDefinition = compilePersistedEvalOutputDefinition(
        parsedOutputDefinition.data,
      );

      span.setAttribute("eval.job_configuration.id", config.id);
      span.setAttribute("eval.template.version", template.version);
      span.setAttribute("eval.score.name", config.scoreName);
      span.setAttribute(
        "eval.score.data_type",
        compiledOutputDefinition.resolvedOutputDefinition.dataType,
      );

      // Get model configuration
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

        await blockEvaluatorConfigs({
          projectId,
          where: { id: config.id },
          blockReason,
          blockMessage: getEvaluatorBlockMetadata(blockReason).message,
          source: EvaluatorBlockSource.INVALID_MODEL_CONFIG,
        });

        logger.warn(
          `Eval job ${jobExecutionId} will fail. ${modelConfig.error}`,
        );
        throw new UnrecoverableError(
          `Invalid model configuration for job ${jobExecutionId}: ${modelConfig.error}`,
        );
      }

      span.setAttribute("eval.model.provider", modelConfig.config.provider);
      span.setAttribute("eval.model.name", modelConfig.config.model);

      // Prepare LLM call
      const messages = buildEvalMessages(prompt);

      const primaryScoreId = randomUUID();
      span.setAttribute("eval.score.id", primaryScoreId);
      const executionTraceId = createW3CTraceId(jobExecutionId);

      const executionMetadata = buildEvalExecutionMetadata({
        jobExecutionId,
        jobConfigurationId: job.jobConfigurationId,
        targetTraceId: job.jobInputTraceId,
        targetObservationId: job.jobInputObservationId,
        targetDatasetItemId: job.jobInputDatasetItemId,
      });

      // Call LLM
      const llmOutput = await instrumentAsync(
        { name: "eval.call-llm" },
        async (llmSpan) => {
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
          llmSpan.setAttribute("eval.model.name", modelConfig.config.model);
          llmSpan.setAttribute(
            "eval.model.adapter",
            modelConfig.config.adapter,
          );

          try {
            return await deps.callLLM({
              messages,
              modelConfig: modelConfig.config,
              structuredOutputSchema:
                compiledOutputDefinition.outputResultSchema,
              traceSinkParams: {
                targetProjectId: projectId,
                traceId: executionTraceId,
                traceName: `Execute evaluator: ${template.name}`,
                environment: LangfuseInternalTraceEnvironment.LLMJudge,
                metadata: {
                  ...executionMetadata,
                  score_id: primaryScoreId,
                },
              },
            });
          } catch (e) {
            if (isLLMCompletionError(e)) {
              llmSpan.setAttribute(
                "http.response.status_code",
                e.responseStatusCode,
              );

              if (e.shouldBlockConfig()) {
                const blockReason =
                  e.getEvaluatorBlockReason() ??
                  EvaluatorBlockReason.EVAL_MODEL_CONFIG_INVALID;

                await blockEvaluatorConfigs({
                  projectId,
                  where: { id: config.id },
                  blockReason,
                  blockMessage: getEvaluatorBlockMetadata(blockReason).message,
                  source: EvaluatorBlockSource.LLM_COMPLETION_ERROR,
                });
              }
            }
            throw e;
          }
        },
      );

      const parsedLLMOutput = validateEvalOutputResult({
        response: llmOutput,
        compiledOutputDefinition,
      });

      if (!parsedLLMOutput.success) {
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

      const scoreWritePayloads = buildEvalScoreWritePayloads({
        outputResult: parsedLLMOutput.data,
        primaryScoreId,
        traceId: job.jobInputTraceId,
        observationId: job.jobInputObservationId,
        scoreName: config.scoreName,
        environment,
        executionTraceId,
        metadata: executionMetadata,
      });

      span.setAttribute("eval.score.count", scoreWritePayloads.length);

      // Write score to S3 and enqueue for ingestion
      try {
        await Promise.all(
          scoreWritePayloads.map(async ({ scoreId, eventId, event }) => {
            await deps.uploadScore({
              projectId,
              scoreId,
              eventId,
              event,
            });

            await deps.enqueueScoreIngestion({
              projectId,
              scoreId,
              eventId,
            });
          }),
        );
      } catch (e) {
        logger.error(`Failed to persist score: ${e}`, e);
        traceException(e);
        throw new Error(
          `Failed to write score ${primaryScoreId} into IngestionQueue`,
        );
      }

      logger.debug(
        `Persisted ${scoreWritePayloads.length} score(s) for job ${jobExecutionId}`,
      );

      // Update job execution status
      await deps.updateJobExecution({
        id: jobExecutionId,
        projectId,
        data: {
          status: JobExecutionStatus.COMPLETED,
          endTime: new Date(),
          jobOutputScoreId: primaryScoreId,
          executionTraceId,
        },
      });

      logger.debug(
        `Eval job ${job.id} completed with ${
          parsedLLMOutput.data.dataType === ScoreDataTypeEnum.NUMERIC
            ? `score ${parsedLLMOutput.data.score}`
            : parsedLLMOutput.data.dataType === ScoreDataTypeEnum.BOOLEAN
              ? `score ${parsedLLMOutput.data.score}`
              : `matches ${parsedLLMOutput.data.matches.join(",")}`
        }`,
      );
    },
  );
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

  // Fetch config to get variable mapping
  const config = await prisma.jobConfiguration.findFirst({
    where: {
      id: job.jobConfigurationId,
      projectId: event.projectId,
    },
  });

  if (!config || !config.evalTemplateId) {
    throw new UnrecoverableError(
      `Job configuration or template not found for job ${job.id}`,
    );
  }

  if (!isJobConfigExecutable(config)) {
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

  // Fetch template to get variable names
  const template = await prisma.evalTemplate.findFirst({
    where: {
      id: config.evalTemplateId,
      OR: [{ projectId: event.projectId }, { projectId: null }],
    },
  });

  if (!template) {
    throw new UnrecoverableError(
      `Evaluation template ${config.evalTemplateId} not found`,
    );
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

  // Execute the shared LLM-as-a-judge evaluation
  await executeLLMAsJudgeEvaluation({
    projectId: event.projectId,
    jobExecutionId: event.jobExecutionId,
    job,
    config,
    template,
    extractedVariables,
    environment:
      getEnvironmentFromVariables(extractedVariables) ??
      DEFAULT_TRACE_ENVIRONMENT,
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
}): Promise<{ var: string; value: string; environment?: string }[]> {
  // Internal cache for this function call to avoid duplicate database lookups.
  // We do not cache dataset items as Postgres is cheaper than ClickHouse.
  const traceCache = new Map<string, TraceDomain | null>();
  const observationCache = new Map<string, Observation | null>();

  const results: { var: string; value: string; environment?: string }[] = [];

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
        value: parseDatabaseRowToString(datasetItem, mapping),
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
        trace = await getTraceById({
          traceId,
          projectId,
          timestamp: traceTimestamp,
          clickhouseFeatureTag: "eval-execution",
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
        value: parseDatabaseRowToString(trace, mapping),
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
        value: parseDatabaseRowToString(observation, mapping),
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

export const parseDatabaseRowToString = (
  dbRow: Record<string, unknown>,
  mapping: z.infer<typeof variableMapping>,
): string => {
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

export const parseUnknownToString = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value.toString();
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  if (typeof value === "symbol") {
    return value.toString();
  }

  return String(value);
};
