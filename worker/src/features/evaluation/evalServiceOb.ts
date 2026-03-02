import { randomUUID } from "crypto";
import { sql } from "kysely";
import { z } from "zod/v4";
import { JobConfigState } from "@prisma/client";
import {
  QueueJobs,
  QueueName,
  EvalExecutionEvent,
  tableColumnsToSqlFilterAndPrefix,
  traceException,
  setNoEvalConfigsCache,
  logger,
  EvalExecutionQueue,
  checkTraceExistsAndGetTimestamp,
  checkObservationExists,
  DatasetRunItemUpsertEventType,
  TraceQueueEventType,
  CreateEvalQueueEventType,
  getTraceById,
  getObservationForTraceIdByName,
  InMemoryFilterService,
  recordIncrement,
  getCurrentSpan,
  getDatasetItemIdsByTraceIdCh,
  mapDatasetRunItemFilterColumn,
  convertDateToDateTime,
  LangfuseInternalTraceEnvironment,
} from "@langfuse/shared/src/server";
import {
  mapTraceFilterColumn,
  requiresDatabaseLookup,
} from "./traceFilterUtils";
import {
  EvalTargetObject,
  LangfuseNotFoundError,
  Prisma,
  singleFilter,
  InvalidRequestError,
  variableMappingList,
  evalDatasetFormFilterCols,
  availableDatasetEvalVariables,
  JobTimeScope,
  availableTraceEvalVariables,
  variableMapping,
  TraceDomain,
  Observation,
} from "@langfuse/shared";
import { kyselyPrisma, prisma } from "@langfuse/shared/src/db";
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
import { createProductionEvalExecutionDeps } from "./evalExecutionDeps";
import { createW3CTraceId } from "../utils";
import { JSONPath } from "jsonpath-plus";
import { ObservationNotFoundError } from "../../errors/ObservationNotFoundError";
import { UnrecoverableError } from "../../errors/UnrecoverableError";
import { JobExecutionStatus } from "@langfuse/shared";

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
 * ┌─────────────────────────┐    ┌─────────────────────────┐    ┌─────────────────────────┐
 * │                         │    │                         │    │                         │
 * │  TraceQueue             │    │  DatasetRunItemUpsert   │    │  CreateEvalQueue        │
 * │  - Live trace data      │    │  - Live dataset run item│    │  - Historical batch     │
 * │  - No timestamp in body │    │  - No timestamp in body │    │  - Has timestamp in body│
 * │  - enforcedTimeScope=NEW│    │  - enforcedTimeScope=NEW│    │  - No enforcedTimeScope │
 * │  - Always linked to     │    │  - Always linked to     │    │  - Always linked to     │
 * │    traces only          │    │    traces & sometimes   │    │    traces & sometimes   │
 * │                         │    │    to observations      │    │    to observations      │
 * └──────────────┬──────────┘    └──────────────┬──────────┘    └──────────────┬──────────┘
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
 * ────────────────────────────────────────────────────────────────────────────────────────── │
 */
type CreateEvalJobsParams = {
  jobTimestamp: Date;
  enforcedJobTimeScope?: JobTimeScope;
} & (
  | { sourceEventType: "trace-upsert"; event: TraceQueueEventType }
  | {
      sourceEventType: "dataset-run-item-upsert";
      event: DatasetRunItemUpsertEventType;
    }
  | { sourceEventType: "ui-create-eval"; event: CreateEvalQueueEventType }
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
    .where(sql.raw("CAST(job_type AS CHAR)"), "=", "EVAL")
    .where("project_id", "=", event.projectId)
    .where(sql.raw("CAST(status AS CHAR)"), "=", "ACTIVE")
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
    // OceanBase/MySQL: JSON_CONTAINS(array_column, '"value"', '$') to check array contains scalar
    const jsonValue = JSON.stringify(enforcedJobTimeScope);
    configsQuery = configsQuery.where(
      sql`JSON_CONTAINS(time_scope, ${jsonValue}, '$')`,
      "=",
      1,
    );
  }

  const configs = await configsQuery.execute();

  if (configs.length === 0) {
    logger.debug(
      "No active evaluation jobs found for project",
      event.projectId,
    );

    await setNoEvalConfigsCache(event.projectId, "traceBased");
    return;
  }

  logger.debug(
    `Creating eval jobs for trace ${event.traceId} on project ${event.projectId}`,
  );

  // Early exit: Skip eval job creation for internal Langfuse traces from trace-upsert queue (mirror CH)
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

  // Optimization: Batch query for existing job executions (mirror CH)
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

  const findMatchingJob = (
    configId: string,
    datasetItemId: string | null,
    observationId: string | null,
  ) =>
    allExistingJobs.find(
      (job) =>
        job.job_configuration_id === configId &&
        job.job_input_dataset_item_id === datasetItemId &&
        job.job_input_observation_id === observationId,
    );

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

    // Check whether the trace already exists in the database (mirror CH).
    let traceExists = false;
    let traceTimestamp: Date | undefined = cachedTrace?.timestamp;
    let traceExistsDecisionSource: string;

    const traceFilter =
      config.target_object === EvalTargetObject.TRACE ? validatedFilter : [];
    if (cachedTrace && !requiresDatabaseLookup(traceFilter)) {
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
      if (!("datasetItemId" in event) && traceFilter.length === 0) {
        traceExists = true;
        traceTimestamp =
          "exactTimestamp" in event && event.exactTimestamp
            ? new Date(event.exactTimestamp)
            : undefined;
        traceExistsDecisionSource = "identifier";
      } else {
        const { exists, timestamp } = await checkTraceExistsAndGetTimestamp({
          projectId: event.projectId,
          traceId: event.traceId,
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
        });
        traceExists = exists;
        traceTimestamp = timestamp;
        traceExistsDecisionSource = "lookup";
        recordIncrement("langfuse.evaluation-execution.trace_db_lookup", 1, {
          hasCached: Boolean(cachedTrace).toString(),
          requiredDatabaseLookup: requiresDatabaseLookup(traceFilter)
            ? "true"
            : "false",
        });
      }
    }

    recordIncrement("langfuse.evaluation-execution.trace_exists_check", 1, {
      decisionSource: traceExistsDecisionSource,
      exists: String(traceExists),
    });

    const isDatasetConfig = config.target_object === EvalTargetObject.DATASET;
    let datasetItem:
      | { id: string }
      | { id: string; observationId?: string | null; validFrom?: Date }
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
        // Align with evalService.ts: use cache or getDatasetItemIdsByTraceIdCh
        if (cachedDatasetItemIds !== null) {
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
          if (event.traceId) {
            const datasetItemIds = await getDatasetItemIdsByTraceIdCh({
              projectId: event.projectId,
              traceId: event.traceId,
              filter:
                config.target_object === EvalTargetObject.DATASET
                  ? validatedFilter
                  : [],
            });
            datasetItem = datasetItemIds.shift();
          } else {
            logger.debug(
              "No traceId provided, cannot find dataset items through dataset run items",
              {
                configId: config.id,
                projectId: event.projectId,
              },
            );
          }
        }
      }
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

    // Skip eval job when trace-upsert triggers for a dataset item that should be evaluated at observation level (mirror CH)
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

    const matchingJob = findMatchingJob(
      config.id,
      datasetItem?.id ?? null,
      observationId ?? null,
    );
    const existingJob = matchingJob ? [matchingJob] : [];

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

      await kyselyPrisma.$kysely
        .insertInto("job_executions")
        .values({
          id: jobExecutionId,
          project_id: event.projectId,
          job_configuration_id: config.id,
          job_input_trace_id: event.traceId,
          job_input_trace_timestamp: traceTimestamp
            ? sql`CAST(${convertDateToDateTime(traceTimestamp)} AS DATETIME)`
            : null,
          job_template_id: config.eval_template_id,
          status: sql`CAST('PENDING' AS CHAR)`,
          start_time: new Date(),
          ...(datasetItem
            ? {
                job_input_dataset_item_id: datasetItem.id,
                ...("validFrom" in datasetItem &&
                  datasetItem.validFrom && {
                    job_input_dataset_item_valid_from: datasetItem.validFrom,
                  }),
                job_input_observation_id: observationId || null,
              }
            : {}),
        })
        .execute();

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
      logger.debug(`Eval job for config ${config.id} did not match trace`);
      if (existingJob.length > 0) {
        logger.debug(
          `Cancelling eval job for config ${config.id} and trace ${event.traceId}`,
        );
        await kyselyPrisma.$kysely
          .updateTable("job_executions")
          .set("status", JobExecutionStatus.CANCELLED)
          .set("end_time", new Date())
          .where("id", "=", existingJob[0].id)
          .where("project_id", "=", event.projectId)
          .where("status", "!=", JobExecutionStatus.COMPLETED)
          .execute();
      }
    }

    await new Promise((resolve) => setImmediate(resolve));
  }
};

// for a single eval job, this function is used to evaluate the job
export const evaluate = async ({
  event,
}: {
  event: z.infer<typeof EvalExecutionEvent>;
}) => {
  const span = getCurrentSpan();
  if (span) {
    span.setAttribute("messaging.bullmq.job.input.projectId", event.projectId);
  }

  logger.debug(
    `Evaluating job ${event.jobExecutionId} for project ${event.projectId}`,
  );
  // first, fetch all the context required for the evaluation
  const job = await kyselyPrisma.$kysely
    .selectFrom("job_executions")
    .selectAll()
    .where("id", "=", event.jobExecutionId)
    .where("project_id", "=", event.projectId)
    .executeTakeFirst();

  if (!job) {
    logger.info(
      `Job execution with id ${event.jobExecutionId} for project ${event.projectId} not found. This was likely deleted by the user.`,
    );
    return;
  }

  if (job.status === "CANCELLED" || !job?.job_input_trace_id) {
    logger.debug(`Job ${job.id} for project ${event.projectId} was cancelled.`);

    await kyselyPrisma.$kysely
      .deleteFrom("job_executions")
      .where("id", "=", job.id)
      .where("project_id", "=", event.projectId)
      .execute();

    return;
  }

  const config = await kyselyPrisma.$kysely
    .selectFrom("job_configurations")
    .selectAll()
    .where("id", "=", job.job_configuration_id)
    .where("project_id", "=", event.projectId)
    .executeTakeFirstOrThrow();

  if (!config || !config.eval_template_id) {
    logger.error(
      `Eval template not found for config ${config.eval_template_id}`,
    );
    throw new InvalidRequestError(
      `Eval template not found for config ${config.eval_template_id}`,
    );
  }

  const template = await prisma.evalTemplate.findFirstOrThrow({
    where: {
      id: config.eval_template_id,
      OR: [{ projectId: event.projectId }, { projectId: null }],
    },
  });

  logger.debug(
    `Evaluating job ${job.id} for project ${event.projectId} with template ${template.id}. Searching for context...`,
  );

  // selectedcolumnid is not safe to use, needs validation in extractVariablesFromTrace()
  const parsedVariableMapping = variableMappingList.parse(
    config.variable_mapping,
  );

  // extract the variables which need to be inserted into the prompt
  const mappingResult = await extractVariablesFromTracingData({
    projectId: event.projectId,
    variables: template.vars as string[],
    traceId: job.job_input_trace_id,
    traceTimestamp: job.job_input_trace_timestamp ?? undefined,
    datasetItemId: job.job_input_dataset_item_id ?? undefined,
    variableMapping: parsedVariableMapping,
  });

  logger.debug(
    `Evaluating job ${event.jobExecutionId} extracted variables ${JSON.stringify(mappingResult)} `,
  );

  // Align with evalService: use evalExecutionUtils + deps for prompt, LLM call, score persistence
  const environment = getEnvironmentFromVariables(mappingResult) ?? "default";
  const deps = createProductionEvalExecutionDeps();

  let prompt: string;
  try {
    prompt = compileEvalPrompt({
      templatePrompt: template.prompt,
      variables: mappingResult,
    });
  } catch (e) {
    logger.error(
      `Evaluating job ${event.jobExecutionId} failed to compile prompt. Eval will fail. ${e}`,
    );
    prompt = template.prompt;
  }

  logger.debug(
    `Evaluating job ${event.jobExecutionId} compiled prompt ${prompt.slice(0, 200)}...`,
  );

  const parsedOutputSchema = evalTemplateOutputSchema.safeParse(
    template.outputSchema,
  );
  if (!parsedOutputSchema.success) {
    throw new UnrecoverableError(
      "Output schema not found or invalid in evaluation template",
    );
  }
  const evalScoreSchema = buildEvalScoreSchema(parsedOutputSchema.data);

  const modelConfig = await deps.fetchModelConfig({
    projectId: event.projectId,
    provider: template.provider ?? undefined,
    model: template.model ?? undefined,
    modelParams: template.modelParams as Record<string, unknown> | null,
  });
  if (!modelConfig.valid) {
    logger.warn(
      `Evaluating job ${event.jobExecutionId} will fail. ${modelConfig.error}`,
    );
    throw new UnrecoverableError(
      `Invalid model configuration for job ${event.jobExecutionId}: ${modelConfig.error}`,
    );
  }

  const messages = buildEvalMessages(prompt);
  const scoreId = randomUUID();
  const executionTraceId = createW3CTraceId(event.jobExecutionId);
  const executionMetadata = buildExecutionMetadata({
    jobExecutionId: event.jobExecutionId,
    jobConfigurationId: job.job_configuration_id,
    targetTraceId: job.job_input_trace_id,
    targetObservationId: job.job_input_observation_id,
    targetDatasetItemId: job.job_input_dataset_item_id,
  });

  const llmOutput = await deps.callLLM({
    messages,
    modelConfig: modelConfig.config,
    structuredOutputSchema: evalScoreSchema,
    traceSinkParams: {
      targetProjectId: event.projectId,
      traceId: executionTraceId,
      traceName: `Execute evaluator: ${template.name}`,
      environment: LangfuseInternalTraceEnvironment.LLMJudge,
      metadata: {
        ...executionMetadata,
        score_id: scoreId,
      },
    },
  });

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
    `Job ${event.jobExecutionId} received LLM output: score=${parsedLLMOutput.data.score}`,
  );

  const eventId = randomUUID();
  const scoreEvent = buildScoreEvent({
    eventId,
    scoreId,
    traceId: job.job_input_trace_id,
    observationId: job.job_input_observation_id,
    scoreName: config.score_name,
    value: parsedLLMOutput.data.score,
    reasoning: parsedLLMOutput.data.reasoning,
    environment,
    executionTraceId,
    metadata: executionMetadata,
  });

  try {
    await deps.uploadScore({
      projectId: event.projectId,
      scoreId,
      eventId,
      event: scoreEvent,
    });
    await deps.enqueueScoreIngestion({
      projectId: event.projectId,
      scoreId,
      eventId,
    });
  } catch (e) {
    logger.error(`Failed to persist score: ${e}`, e);
    traceException(e);
    throw new Error(`Failed to write score ${scoreId} into IngestionQueue`);
  }

  logger.debug(
    `Evaluating job ${event.jobExecutionId} persisted score ${scoreId} for trace ${job.job_input_trace_id}`,
  );

  await deps.updateJobExecution({
    id: job.id,
    projectId: event.projectId,
    data: {
      status: JobExecutionStatus.COMPLETED,
      endTime: new Date(),
      jobOutputScoreId: scoreId,
      executionTraceId,
    },
  });

  logger.debug(
    `Eval job ${job.id} for project ${event.projectId} completed with score ${parsedLLMOutput.data.score}`,
  );
};

export async function extractVariablesFromTracingData({
  projectId,
  variables,
  traceId,
  variableMapping,
  traceTimestamp,
  datasetItemId,
}: {
  projectId: string;
  variables: string[];
  traceId: string;
  // this here are variables which were inserted by users. Need to validate before DB query.
  variableMapping: z.infer<typeof variableMappingList>;
  traceTimestamp?: Date;
  datasetItemId?: string;
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

      const datasetItem = await kyselyPrisma.$kysely
        .selectFrom("dataset_items as d")
        .select(
          sql`${sql.raw(safeInternalColumn.internal)}`.as(
            safeInternalColumn.id,
          ),
        ) // query the internal column name raw
        .where("id", "=", datasetItemId)
        .where("project_id", "=", projectId)
        .executeTakeFirst();

      // user facing errors
      if (!datasetItem) {
        logger.error(
          `Dataset item ${datasetItemId} for project ${projectId} not found. Please ensure the mapped data on the dataset item exists and consider extending the job delay.`,
        );
        // this should only happen for deleted data.
        throw new LangfuseNotFoundError(
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
        });
        traceCache.set(traceCacheKey, trace ?? null);
      }

      // user facing errors
      if (!trace) {
        logger.warn(
          `Trace ${traceId} for project ${projectId} not found. Please ensure the mapped data on the trace exists and consider extending the job delay.`,
        );
        // this should only happen for deleted data or replication lags across clickhouse nodes.
        throw new LangfuseNotFoundError(
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

    if (observationTypes.includes(mapping.langfuseObject)) {
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
        throw new LangfuseNotFoundError(
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
    logger.debug(
      `Parsing JSON for json selector ${mapping.jsonSelector} from ${JSON.stringify(selectedColumn)}`,
    );

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
