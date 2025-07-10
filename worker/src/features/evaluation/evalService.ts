import { randomUUID } from "crypto";
import { sql } from "kysely";
import { z } from "zod/v4";
import { z as zodV3 } from "zod/v3";
import { JobConfigState } from "@prisma/client";
import {
  QueueJobs,
  QueueName,
  EvalExecutionEvent,
  tableColumnsToSqlFilterAndPrefix,
  traceException,
  eventTypes,
  redis,
  IngestionQueue,
  logger,
  EvalExecutionQueue,
  checkTraceExists,
  checkObservationExists,
  DatasetRunItemUpsertEventType,
  TraceQueueEventType,
  StorageService,
  StorageServiceFactory,
  CreateEvalQueueEventType,
  ChatMessageType,
  DefaultEvalModelService,
  getTraceById,
  getObservationForTraceIdByName,
  InMemoryFilterService,
  recordIncrement,
} from "@langfuse/shared/src/server";
import {
  mapTraceFilterColumn,
  requiresDatabaseLookup,
} from "./traceFilterUtils";
import {
  ChatMessageRole,
  ForbiddenError,
  LangfuseNotFoundError,
  Prisma,
  singleFilter,
  InvalidRequestError,
  variableMappingList,
  evalDatasetFormFilterCols,
  availableDatasetEvalVariables,
  JobTimeScope,
  ScoreSource,
  availableTraceEvalVariables,
  variableMapping,
  TraceDomain,
  Observation,
  DatasetItem,
  QUEUE_ERROR_MESSAGES,
} from "@langfuse/shared";
import { kyselyPrisma, prisma } from "@langfuse/shared/src/db";
import { backOff } from "exponential-backoff";
import { callStructuredLLM, compileHandlebarString } from "../utils";
import { env } from "../../env";
import { JSONPath } from "jsonpath-plus";

let s3StorageServiceClient: StorageService;

const getS3StorageServiceClient = (bucketName: string): StorageService => {
  if (!s3StorageServiceClient) {
    s3StorageServiceClient = StorageServiceFactory.getInstance({
      bucketName,
      accessKeyId: env.LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID,
      secretAccessKey: env.LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY,
      endpoint: env.LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT,
      region: env.LANGFUSE_S3_EVENT_UPLOAD_REGION,
      forcePathStyle: env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
      awsSse: env.LANGFUSE_S3_EVENT_UPLOAD_SSE,
      awsSseKmsKeyId: env.LANGFUSE_S3_EVENT_UPLOAD_SSE_KMS_KEY_ID,
    });
  }
  return s3StorageServiceClient;
};

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
 * ─────────────────────────────────────────────────────────────────────────────────────────── │
 */
export const createEvalJobs = async ({
  event,
  jobTimestamp,
  enforcedJobTimeScope,
}: {
  event:
    | TraceQueueEventType
    | DatasetRunItemUpsertEventType
    | CreateEvalQueueEventType;
  jobTimestamp: Date;
  enforcedJobTimeScope?: JobTimeScope;
}) => {
  // Fetch all configs for a given project. Those may be dataset or trace configs.
  let configsQuery = kyselyPrisma.$kysely
    .selectFrom("job_configurations")
    .selectAll()
    .where(sql.raw("job_type::text"), "=", "EVAL")
    .where("project_id", "=", event.projectId)
    .where(sql.raw("status::text"), "=", "ACTIVE");

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
    return;
  }

  logger.debug(
    `Creating eval jobs for trace ${event.traceId} on project ${event.projectId}`,
  );

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
          "timestamp" in event
            ? new Date(event.timestamp)
            : new Date(jobTimestamp),
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

    // Use cached trace for in-memory filtering when possible, i.e. all fields can
    // be checked in-memory.
    const traceFilter = config.target_object === "trace" ? validatedFilter : [];
    if (cachedTrace && !requiresDatabaseLookup(traceFilter)) {
      // Evaluate filter in memory using the cached trace
      traceExists = InMemoryFilterService.evaluateFilter(
        cachedTrace,
        traceFilter,
        mapTraceFilterColumn,
      );

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
      // Fall back to database query for complex filters or when no cached trace
      traceExists = await checkTraceExists({
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
      });
      recordIncrement("langfuse.evaluation-execution.trace_db_lookup", 1, {
        hasCached: Boolean(cachedTrace).toString(),
        requiredDatabaseLookup: requiresDatabaseLookup(traceFilter)
          ? "true"
          : "false",
      });
    }

    const isDatasetConfig = config.target_object === "dataset";
    let datasetItem: { id: string } | undefined;
    if (isDatasetConfig) {
      const condition = tableColumnsToSqlFilterAndPrefix(
        config.target_object === "dataset" ? validatedFilter : [],
        evalDatasetFormFilterCols,
        "dataset_items",
      );

      // If the target object is a dataset and the event type has a datasetItemId, we try to fetch it based on our filter
      if ("datasetItemId" in event && event.datasetItemId) {
        const datasetItems = await prisma.$queryRaw<
          Array<{ id: string }>
        >(Prisma.sql`
          SELECT id
          FROM dataset_items as di
          WHERE project_id = ${event.projectId}
            AND id = ${event.datasetItemId}
            ${condition}
        `);
        datasetItem = datasetItems.shift();
      } else {
        // Otherwise, try to find the dataset item id from datasetRunItems.
        // Here, we can search for the traceId and projectId and should only get one result.
        const datasetItems = await prisma.$queryRaw<
          Array<{ id: string }>
        >(Prisma.sql`
          SELECT dataset_item_id as id
          FROM dataset_run_items as dri
          JOIN dataset_items as di ON di.id = dri.dataset_item_id AND di.project_id = ${event.projectId}
          WHERE dri.project_id = ${event.projectId}
            AND dri.trace_id = ${event.traceId}
            ${condition}
        `);
        datasetItem = datasetItems.shift();
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
          `Observation ${observationId} not found, retrying dataset eval later`,
        );
        throw new Error(
          "Observation not found. Rejecting job to use retry-attempts.",
        );
      }
    }

    // Fetch the existing job for the given configuration.
    // We either use it for deduplication or we cancel it in case it became "deselected".
    const existingJob = await kyselyPrisma.$kysely
      .selectFrom("job_executions")
      .select("id")
      .where("project_id", "=", event.projectId)
      .where("job_configuration_id", "=", config.id)
      .where("job_input_trace_id", "=", event.traceId)
      .where(
        "job_input_dataset_item_id",
        datasetItem ? "=" : "is",
        datasetItem ? datasetItem.id : null,
      )
      .where(
        "job_input_observation_id",
        observationId ? "=" : "is",
        observationId || null,
      )
      .execute();

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
          jobTemplateId: config.eval_template_id,
          status: "PENDING",
          startTime: new Date(),
          ...(datasetItem
            ? {
                jobInputDatasetItemId: datasetItem.id,
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
        await kyselyPrisma.$kysely
          .updateTable("job_executions")
          .set("status", sql`'CANCELLED'::"JobExecutionStatus"`)
          .set("end_time", new Date())
          .where("id", "=", existingJob[0].id)
          .execute();
      }
    }
  }
};

// for a single eval job, this function is used to evaluate the job
export const evaluate = async ({
  event,
}: {
  event: z.infer<typeof EvalExecutionEvent>;
}) => {
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

  if (!job?.job_input_trace_id) {
    throw new ForbiddenError(
      "Jobs can only be executed on traces and dataset runs for now.",
    );
  }

  if (job.status === "CANCELLED") {
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
    variables: template.vars,
    traceId: job.job_input_trace_id,
    datasetItemId: job.job_input_dataset_item_id ?? undefined,
    variableMapping: parsedVariableMapping,
  });

  logger.debug(
    `Evaluating job ${event.jobExecutionId} extracted variables ${JSON.stringify(mappingResult)} `,
  );

  // Get environment from trace or observation variables
  const environment = mappingResult.find((r) => r.environment)?.environment;

  // compile the prompt and send out the LLM request
  let prompt;
  try {
    prompt = compileHandlebarString(template.prompt, {
      ...Object.fromEntries(
        mappingResult.map(({ var: key, value }) => [key, value]),
      ),
    });
  } catch (e) {
    // in case of a compilation error, we use the original prompt without adding variables.
    logger.error(
      `Evaluating job ${event.jobExecutionId} failed to compile prompt. Eval will fail. ${e}`,
    );
    prompt = template.prompt;
  }

  logger.debug(
    `Evaluating job ${event.jobExecutionId} compiled prompt ${prompt}`,
  );

  const parsedOutputSchema = z
    .object({
      score: z.string(),
      reasoning: z.string(),
    })
    .parse(template.outputSchema);

  if (!parsedOutputSchema) {
    throw new InvalidRequestError("Output schema not found");
  }

  const evalScoreSchema = zodV3.object({
    reasoning: zodV3.string().describe(parsedOutputSchema.reasoning),
    score: zodV3.number().describe(parsedOutputSchema.score),
  });

  const modelConfig = await DefaultEvalModelService.fetchValidModelConfig(
    event.projectId,
    template.provider ?? undefined,
    template.model ?? undefined,
    template.modelParams as Record<string, unknown> | null,
  );

  if (!modelConfig.valid) {
    logger.warn(
      `Evaluating job ${event.jobExecutionId} will fail. ${modelConfig.error}`,
    );
    throw new LangfuseNotFoundError(modelConfig.error);
  }

  const messages = [
    {
      type: ChatMessageType.User,
      role: ChatMessageRole.User,
      content: prompt,
    } as const,
  ];

  const parsedLLMOutput = await backOff(
    async () =>
      await callStructuredLLM(
        event.jobExecutionId,
        modelConfig.config.apiKey,
        messages,
        modelConfig.config.modelParams ?? {},
        modelConfig.config.provider,
        modelConfig.config.model,
        evalScoreSchema,
      ),
    {
      numOfAttempts: 1, // turn off retries as Langchain is doing that for us already.
    },
  );

  logger.debug(
    `Evaluating job ${event.jobExecutionId} Parsed LLM output ${JSON.stringify(parsedLLMOutput)}`,
  );

  // persist the score and update the job status
  const scoreId = randomUUID();

  const baseScore = {
    id: scoreId,
    traceId: job.job_input_trace_id,
    observationId: job.job_input_observation_id,
    name: config.score_name,
    value: parsedLLMOutput.score,
    comment: parsedLLMOutput.reasoning,
    source: ScoreSource.EVAL,
    environment: environment ?? "default",
  };

  // Write score to S3 and ingest into queue for Clickhouse processing
  try {
    const eventId = randomUUID();
    const bucketPath = `${env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX}${event.projectId}/score/${scoreId}/${eventId}.json`;
    await getS3StorageServiceClient(
      env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
    ).uploadJson(bucketPath, [
      {
        id: eventId,
        timestamp: new Date().toISOString(),
        type: eventTypes.SCORE_CREATE,
        body: {
          ...baseScore,
          dataType: "NUMERIC",
        },
      },
    ]);

    if (redis) {
      const shardingKey = `${event.projectId}-${scoreId}`;
      const queue = IngestionQueue.getInstance({ shardingKey });
      if (!queue) {
        throw new Error("Ingestion queue not available");
      }
      await queue.add(QueueJobs.IngestionJob, {
        id: randomUUID(),
        timestamp: new Date(),
        name: QueueJobs.IngestionJob as const,
        payload: {
          data: {
            type: eventTypes.SCORE_CREATE,
            eventBodyId: scoreId,
            fileKey: eventId,
          },
          authCheck: {
            validKey: true,
            scope: {
              projectId: event.projectId,
            },
          },
        },
      });
    }
  } catch (e) {
    logger.error(`Failed to add score into IngestionQueue: ${e}`, e);
    traceException(e);
    throw new Error(`Failed to write score ${scoreId} into IngestionQueue`);
  }

  logger.debug(
    `Evaluating job ${event.jobExecutionId} persisted score ${scoreId} for trace ${job.job_input_trace_id}`,
  );

  await kyselyPrisma.$kysely
    .updateTable("job_executions")
    .set("status", sql`'COMPLETED'::"JobExecutionStatus"`)
    .set("end_time", new Date())
    .set("job_output_score_id", scoreId)
    .where("id", "=", event.jobExecutionId)
    .execute();

  logger.debug(
    `Eval job ${job.id} for project ${event.projectId} completed with score ${parsedLLMOutput.score}`,
  );
};

export async function extractVariablesFromTracingData({
  projectId,
  variables,
  traceId,
  variableMapping,
  datasetItemId,
}: {
  projectId: string;
  variables: string[];
  traceId: string;
  // this here are variables which were inserted by users. Need to validate before DB query.
  variableMapping: z.infer<typeof variableMappingList>;
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

      const datasetItem = (await kyselyPrisma.$kysely
        .selectFrom("dataset_items as d")
        .select(
          sql`${sql.raw(safeInternalColumn.internal)}`.as(
            safeInternalColumn.id,
          ),
        ) // query the internal column name raw
        .where("id", "=", datasetItemId)
        .where("project_id", "=", projectId)
        .executeTakeFirst()) as DatasetItem;

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
        trace = await getTraceById({ traceId, projectId });
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

    if (["generation", "span", "event"].includes(mapping.langfuseObject)) {
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
        const observations = await getObservationForTraceIdByName(
          traceId,
          projectId,
          mapping.objectName,
          undefined,
          true,
        );
        observation = observations.shift() || null; // We only take the first match and ignore duplicate generation-names in a trace.
        observationCache.set(observationCacheKey, observation);
      }

      // user facing errors
      if (!observation) {
        logger.warn(
          `Observation ${mapping.objectName} for trace ${traceId} not found. ${QUEUE_ERROR_MESSAGES.MAPPED_DATA_ERROR}`,
        );
        // this should only happen for deleted data or data replication lags across clickhouse nodes.
        throw new LangfuseNotFoundError(
          `Observation ${mapping.objectName} for trace ${traceId} not found. ${QUEUE_ERROR_MESSAGES.MAPPED_DATA_ERROR}`,
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
