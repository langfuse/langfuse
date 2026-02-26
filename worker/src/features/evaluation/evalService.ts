import { randomUUID } from "crypto";
import { sql } from "kysely";
import { z } from "zod/v4";
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
} from "@langfuse/shared/src/server";
import {
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
  DatasetItem,
  EvalTargetObject,
} from "@langfuse/shared";
import { kyselyPrisma, prisma } from "@langfuse/shared/src/db";
import { createW3CTraceId } from "../utils";
import { JSONPath } from "jsonpath-plus";
import { UnrecoverableError } from "../../errors/UnrecoverableError";
import { ObservationNotFoundError } from "../../errors/ObservationNotFoundError";
import {
  compileEvalPrompt,
  buildEvalScoreSchema,
  buildExecutionMetadata,
  buildEvalMessages,
  buildScoreEvent,
  getEnvironmentFromVariables,
  evalTemplateOutputSchema,
  validateLLMResponse,
} from "./evalExecutionUtils";
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
  let configsQuery = kyselyPrisma.$kysely
    .selectFrom("job_configurations")
    .selectAll()
    .where(sql.raw("job_type::text"), "=", "EVAL")
    .where("project_id", "=", event.projectId)
    .where(sql.raw("status::text"), "=", "ACTIVE")
    .where("target_object", "in", [
      EvalTargetObject.TRACE,
      EvalTargetObject.DATASET,
    ]);

  if ("configId" in event) {
    // if configid is set in the event, we only want to fetch the one config
    configsQuery = configsQuery.where("id", "=", event.configId);
  }

  // for dataset_run_item_upsert queue + trace queue, we do not want to execute evals on configs,
  // which were only allowed to run on historic data. Hence, we need to filter all configs which have "NEW" in the time_scope column.
  if (enforcedJobTimeScope) {
    configsQuery = configsQuery.where(
      "time_scope",
      "@>",
      sql<string[]>`ARRAY[${enforcedJobTimeScope}]`,
    );
  }

  const configs = await configsQuery.execute();

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
    (c) => c.target_object === EvalTargetObject.DATASET,
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
      ? await kyselyPrisma.$kysely
          .selectFrom("job_executions")
          .select([
            "id",
            "job_configuration_id",
            "job_input_dataset_item_id",
            "job_input_observation_id",
          ])
          .where("project_id", "=", event.projectId)
          .where("job_input_trace_id", "=", event.traceId)
          .where("job_configuration_id", "in", configIds)
          .execute()
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
        job.job_configuration_id === configId &&
        job.job_input_dataset_item_id === datasetItemId &&
        job.job_input_observation_id === observationId,
    );
  };

  for (const config of configs) {
    if (config.status === JobConfigState.INACTIVE) {
      logger.debug(`Skipping inactive config ${config.id}`);
      continue;
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
      config.target_object === EvalTargetObject.TRACE ? validatedFilter : [];
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

    const isDatasetConfig = config.target_object === EvalTargetObject.DATASET;
    let datasetItem:
      | { id: string }
      | { id: string; observationId: string | null; validFrom?: Date }
      | undefined;
    if (isDatasetConfig) {
      const condition = tableColumnsToSqlFilterAndPrefix(
        config.target_object === EvalTargetObject.DATASET
          ? validatedFilter
          : [],
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
              config.target_object === EvalTargetObject.DATASET
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
              config.target_object === EvalTargetObject.DATASET
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
      if (parseFloat(config.sampling) !== 1) {
        const random = Math.random();
        if (random > parseFloat(config.sampling)) {
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
          jobTemplateId: config.eval_template_id,
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
      await EvalExecutionQueue.getInstance()?.add(
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

      // Parse and validate output schema
      const parsedOutputSchema = evalTemplateOutputSchema.safeParse(
        template.outputSchema,
      );

      if (!parsedOutputSchema.success) {
        throw new UnrecoverableError(
          "Output schema not found or invalid in evaluation template",
        );
      }

      const evalScoreSchema = buildEvalScoreSchema(parsedOutputSchema.data);

      // Get model configuration
      const modelConfig = await deps.fetchModelConfig({
        projectId,
        provider: template.provider ?? undefined,
        model: template.model ?? undefined,
        modelParams: template.modelParams as Record<string, unknown> | null,
      });

      if (!modelConfig.valid) {
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

      const scoreId = randomUUID();
      span.setAttribute("eval.score.id", scoreId);
      const executionTraceId = createW3CTraceId(jobExecutionId);

      const executionMetadata = buildExecutionMetadata({
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
          llmSpan.setAttribute(
            "eval.model.provider",
            modelConfig.config.provider,
          );
          llmSpan.setAttribute("eval.model.name", modelConfig.config.model);
          llmSpan.setAttribute(
            "eval.model.adapter",
            modelConfig.config.adapter,
          );

          return deps.callLLM({
            messages,
            modelConfig: modelConfig.config,
            structuredOutputSchema: evalScoreSchema,
            traceSinkParams: {
              targetProjectId: projectId,
              traceId: executionTraceId,
              traceName: `Execute evaluator: ${template.name}`,
              environment: LangfuseInternalTraceEnvironment.LLMJudge,
              metadata: {
                ...executionMetadata,
                score_id: scoreId,
              },
            },
          });
        },
      );

      const parsedLLMOutput = validateLLMResponse({
        response: llmOutput,
        schema: evalScoreSchema,
      });

      if (!parsedLLMOutput.success) {
        throw new UnrecoverableError(
          `Invalid LLM response format from model ${modelConfig.config.model}. Error: ${parsedLLMOutput.error}`,
        );
      }

      logger.debug(
        `Job ${jobExecutionId} received LLM output: score=${parsedLLMOutput.data.score}`,
      );

      // Build and persist score
      const eventId = randomUUID();
      const scoreEvent = buildScoreEvent({
        eventId,
        scoreId,
        traceId: job.jobInputTraceId,
        observationId: job.jobInputObservationId,
        scoreName: config.scoreName,
        value: parsedLLMOutput.data.score,
        reasoning: parsedLLMOutput.data.reasoning,
        environment,
        executionTraceId,
        metadata: executionMetadata,
      });

      // Write score to S3 and enqueue for ingestion
      try {
        await deps.uploadScore({
          projectId,
          scoreId,
          eventId,
          event: scoreEvent,
        });

        await deps.enqueueScoreIngestion({
          projectId,
          scoreId,
          eventId,
        });
      } catch (e) {
        logger.error(`Failed to persist score: ${e}`, e);
        traceException(e);
        throw new Error(`Failed to write score ${scoreId} into IngestionQueue`);
      }

      logger.debug(`Persisted score ${scoreId} for job ${jobExecutionId}`);

      // Update job execution status
      await deps.updateJobExecution({
        id: jobExecutionId,
        projectId,
        data: {
          status: JobExecutionStatus.COMPLETED,
          endTime: new Date(),
          jobOutputScoreId: scoreId,
          executionTraceId,
        },
      });

      logger.debug(
        `Eval job ${job.id} completed with score ${parsedLLMOutput.data.score}`,
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

      let query = kyselyPrisma.$kysely
        .selectFrom("dataset_items as d")
        .select(
          sql`${sql.raw(safeInternalColumn.internal)}`.as(
            safeInternalColumn.id,
          ),
        )
        .where("id", "=", datasetItemId)
        .where("project_id", "=", projectId);

      // Conditional: exact match if version known, otherwise latest
      if (datasetItemValidFrom) {
        query = query.where("valid_from", "=", datasetItemValidFrom);
      } else {
        query = query.where("valid_to", "is", null);
      }
      const datasetItem = (await query.executeTakeFirst()) as DatasetItem;

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

export const parseDatabaseRowToString = (
  dbRow: Record<string, unknown>,

  mapping: z.infer<typeof variableMapping>,
): string => {
  const selectedColumn = dbRow[mapping.selectedColumnId];

  let jsonSelectedColumn;

  if (mapping.jsonSelector) {
    if (logger.isLevelEnabled("debug")) {
      logger.debug(
        `Parsing JSON for json selector ${mapping.jsonSelector} from ${JSON.stringify(selectedColumn)}`,
      );
    }

    try {
      jsonSelectedColumn = JSONPath({
        path: mapping.jsonSelector,

        json:
          typeof selectedColumn === "string"
            ? JSON.parse(selectedColumn)
            : selectedColumn,
      });
    } catch (error) {
      logger.error(
        `Error parsing JSON for json selector ${mapping.jsonSelector}. Falling back to original value.`,

        error,
      );

      jsonSelectedColumn = selectedColumn;
    }
  } else {
    jsonSelectedColumn = selectedColumn;
  }

  return parseUnknownToString(jsonSelectedColumn);
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
