import { randomUUID } from "crypto";
import Handlebars from "handlebars";
import { sql } from "kysely";
import { z } from "zod";
import { ScoreSource } from "@prisma/client";
import {
  QueueJobs,
  QueueName,
  EvalExecutionEvent,
  TraceUpsertEventSchema,
  tableColumnsToSqlFilterAndPrefix,
  traceException,
  S3StorageService,
  eventTypes,
  redis,
  IngestionQueue,
} from "@langfuse/shared/src/server";
import {
  ApiError,
  availableEvalVariables,
  ChatMessageRole,
  evalTableCols,
  ForbiddenError,
  LangfuseNotFoundError,
  LLMApiKeySchema,
  Prisma,
  singleFilter,
  InvalidRequestError,
  variableMappingList,
  ZodModelConfig,
  EvalTemplate,
} from "@langfuse/shared";
import { decrypt } from "@langfuse/shared/encryption";
import { kyselyPrisma, prisma } from "@langfuse/shared/src/db";
import { fetchLLMCompletion, logger } from "@langfuse/shared/src/server";
import { EvalExecutionQueue } from "../../queues/evalQueue";
import { backOff } from "exponential-backoff";
import { env } from "../../env";

let s3StorageServiceClient: S3StorageService;

const getS3StorageServiceClient = (bucketName: string): S3StorageService => {
  if (!s3StorageServiceClient) {
    s3StorageServiceClient = new S3StorageService({
      bucketName,
      accessKeyId: env.LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID,
      secretAccessKey: env.LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY,
      endpoint: env.LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT,
      region: env.LANGFUSE_S3_EVENT_UPLOAD_REGION,
      forcePathStyle: env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
    });
  }
  return s3StorageServiceClient;
};

// this function is used to determine which eval jobs to create for a given trace
// there might be multiple eval jobs to create for a single trace
export const createEvalJobs = async ({
  event,
}: {
  event: z.infer<typeof TraceUpsertEventSchema>;
}) => {
  const configs = await kyselyPrisma.$kysely
    .selectFrom("job_configurations")
    .selectAll()
    .where(sql.raw("job_type::text"), "=", "EVAL")
    .where("project_id", "=", event.projectId)
    .execute();

  if (configs.length === 0) {
    logger.debug("No evaluation jobs found for project", event.projectId);
    return;
  }
  logger.debug(
    `Creating eval jobs for trace ${event.traceId} on project ${event.projectId}`,
  );

  for (const config of configs) {
    if (config.status === "INACTIVE") {
      logger.debug(`Skipping inactive config ${config.id}`);
      continue;
    }

    logger.debug("Creating eval job for config", config.id);
    const validatedFilter = z.array(singleFilter).parse(config.filter);

    const condition = tableColumnsToSqlFilterAndPrefix(
      validatedFilter,
      evalTableCols,
      "traces",
    );

    const joinedQuery = Prisma.sql`
        SELECT id
        FROM traces as t
        WHERE project_id = ${event.projectId}
        AND id = ${event.traceId}
        ${condition}
      `;

    const traces = await prisma.$queryRaw<Array<{ id: string }>>(joinedQuery);

    const existingJob = await kyselyPrisma.$kysely
      .selectFrom("job_executions")
      .select("id")
      .where("project_id", "=", event.projectId)
      .where("job_configuration_id", "=", config.id)
      .where("job_input_trace_id", "=", event.traceId)
      .execute();

    // if we matched a trace, we might want to create a job
    if (traces.length > 0) {
      logger.info(
        `Eval job for config ${config.id} matched trace ids ${JSON.stringify(traces.map((t) => t.id))}`,
      );

      const jobExecutionId = randomUUID();

      // deduplication: if a job exists already for a trace event, we do not create a new one.
      if (existingJob.length > 0) {
        logger.info(
          `Eval job for config ${config.id} and trace ${event.traceId} already exists`,
        );
        continue;
      }

      // apply sampling. Only if the job is sampled, we create a job
      // user supplies a number between 0 and 1, which is the probability of sampling

      if (parseFloat(config.sampling) !== 1) {
        const random = Math.random();
        if (random > parseFloat(config.sampling)) {
          logger.info(
            `Eval job for config ${config.id} and trace ${event.traceId} was sampled out`,
          );
          continue;
        }
      }

      logger.info(
        `Creating eval job for config ${config.id} and trace ${event.traceId}`,
      );

      await prisma.jobExecution.create({
        data: {
          id: jobExecutionId,
          projectId: event.projectId,
          jobConfigurationId: config.id,
          jobInputTraceId: event.traceId,
          status: "PENDING",
          startTime: new Date(),
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
          attempts: 10,
          backoff: {
            type: "exponential",
            delay: 1000,
          },
          delay: config.delay, // milliseconds
          removeOnComplete: true,
          removeOnFail: 1_000,
        },
      );
    } else {
      // if we do not have a match, and execution exists, we mark the job as cancelled
      // we do this, because a second trace event might 'deselect' a trace
      logger.info(`Eval job for config ${config.id} did not match trace`);
      if (existingJob.length > 0) {
        logger.info(
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
  logger.info(
    `Evaluating job ${event.jobExecutionId} for project ${event.projectId}`,
  );
  // first, fetch all the context required for the evaluation
  const job = await kyselyPrisma.$kysely
    .selectFrom("job_executions")
    .selectAll()
    .where("id", "=", event.jobExecutionId)
    .where("project_id", "=", event.projectId)
    .executeTakeFirstOrThrow();

  if (!job?.job_input_trace_id) {
    throw new ForbiddenError("Jobs can only be executed on traces for now.");
  }

  if (job.status === "CANCELLED") {
    logger.info(`Job ${job.id} for project ${event.projectId} was cancelled.`);

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
      projectId: event.projectId,
    },
  });

  logger.info(
    `Evaluating job ${job.id} for project ${event.projectId} with template ${template.id}. Searching for context...`,
  );

  // selectedcolumnid is not safe to use, needs validation in extractVariablesFromTrace()
  const parsedVariableMapping = variableMappingList.parse(
    config.variable_mapping,
  );

  // extract the variables which need to be inserted into the prompt
  const mappingResult = await extractVariablesFromTrace(
    event.projectId,
    template.vars,
    job.job_input_trace_id,
    parsedVariableMapping,
  );

  logger.debug(
    `Evaluating job ${event.jobExecutionId} extracted variables ${JSON.stringify(mappingResult)} `,
  );

  // compile the prompt and send out the LLM request
  const prompt = compileHandlebarString(template.prompt, {
    ...Object.fromEntries(
      mappingResult.map(({ var: key, value }) => [key, value]),
    ),
  });

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

  const evalScoreSchema = z.object({
    reasoning: z.string().describe(parsedOutputSchema.reasoning),
    score: z.number().describe(parsedOutputSchema.score),
  });

  const modelParams = ZodModelConfig.parse(template.modelParams);

  // the apiKey.secret_key must never be printed to the console or returned to the client.
  const apiKey = await prisma.llmApiKeys.findFirst({
    where: {
      projectId: event.projectId,
      provider: template.provider,
    },
  });
  const parsedKey = LLMApiKeySchema.safeParse(apiKey);

  if (!parsedKey.success) {
    // this will fail the eval execution if a user deletes the API key.
    logger.error(
      `Evaluating job ${event.jobExecutionId} did not find API key for provider ${template.provider} and project ${event.projectId}. Eval will fail. ${parsedKey.error}`,
    );
    throw new LangfuseNotFoundError(
      `API key for provider ${template.provider} and project ${event.projectId} not found.`,
    );
  }

  const parsedLLMOutput = await backOff(
    () =>
      callLLM(
        event.jobExecutionId,
        parsedKey.data,
        prompt,
        modelParams,
        template,
        evalScoreSchema,
      ),
    {
      numOfAttempts: 1, // turn off retries as Langchain is doing that for us already.
    },
  );

  logger.info(
    `Evaluating job ${event.jobExecutionId} Parsed LLM output ${JSON.stringify(parsedLLMOutput)}`,
  );

  // persist the score and update the job status
  const scoreId = randomUUID();

  const baseScore = {
    id: scoreId,
    traceId: job.job_input_trace_id,
    name: config.score_name,
    value: parsedLLMOutput.score,
    comment: parsedLLMOutput.reasoning,
    source: ScoreSource.EVAL,
  };

  await prisma.score.create({
    data: {
      ...baseScore,
      projectId: event.projectId,
    },
  });

  // Write score to S3 and ingest into queue for Clickhouse processing
  try {
    if (env.LANGFUSE_S3_EVENT_UPLOAD_ENABLED === "true" && env.CLICKHOUSE_URL) {
      if (env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET === undefined) {
        throw new Error("S3 event store is enabled but no bucket is set");
      }
      const s3Client = getS3StorageServiceClient(
        env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
      );
      await s3Client.uploadJson(
        `${env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX}${event.projectId}/score/${scoreId}/${randomUUID()}.json`,
        [
          {
            id: randomUUID(),
            timestamp: new Date().toISOString(),
            type: eventTypes.SCORE_CREATE,
            body: {
              ...baseScore,
              dataType: "NUMERIC",
            },
          },
        ],
      );

      if (redis) {
        const queue = IngestionQueue.getInstance();
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
            },
            authCheck: {
              validKey: true,
              scope: {
                projectId: event.projectId,
                accessLevel: "scores",
              },
            },
          },
        });
      }
    }
  } catch (e) {
    logger.error(`Failed to add score into IngestionQueue: ${e}`, e);
    traceException(e);
    throw new Error(`Failed to write score ${scoreId} into IngestionQueue`);
  }

  logger.info(
    `Evaluating job ${event.jobExecutionId} persisted score ${scoreId} for trace ${job.job_input_trace_id}`,
  );

  await kyselyPrisma.$kysely
    .updateTable("job_executions")
    .set("status", sql`'COMPLETED'::"JobExecutionStatus"`)
    .set("end_time", new Date())
    .set("job_output_score_id", scoreId)
    .where("id", "=", event.jobExecutionId)
    .execute();

  logger.info(
    `Eval job ${job.id} for project ${event.projectId} completed with score ${parsedLLMOutput.score}`,
  );
};

async function callLLM(
  jeId: string,
  llmApiKey: z.infer<typeof LLMApiKeySchema>,
  prompt: string,
  modelParams: z.infer<typeof ZodModelConfig>,
  template: EvalTemplate,
  evalScoreSchema: z.ZodObject<{ score: z.ZodNumber; reasoning: z.ZodString }>,
): Promise<z.infer<typeof evalScoreSchema>> {
  try {
    const completion = await fetchLLMCompletion({
      streaming: false,
      apiKey: decrypt(llmApiKey.secretKey), // decrypt the secret key
      baseURL: llmApiKey.baseURL || undefined,
      messages: [
        {
          role: ChatMessageRole.System,
          content: "You are an expert at evaluating LLM outputs.",
        },
        { role: ChatMessageRole.User, content: prompt },
      ],
      modelParams: {
        provider: template.provider,
        model: template.model,
        adapter: llmApiKey.adapter,
        ...modelParams,
      },
      structuredOutputSchema: evalScoreSchema,
      config: llmApiKey.config,
    });
    return evalScoreSchema.parse(completion);
  } catch (e) {
    logger.error(
      `Evaluating job ${jeId} failed to call LLM. Eval will fail. ${e}`,
    );
    throw new ApiError(`Failed to call LLM: ${e}`);
  }
}

export function compileHandlebarString(
  handlebarString: string,
  context: Record<string, any>,
): string {
  const template = Handlebars.compile(handlebarString, { noEscape: true });
  return template(context);
}

export async function extractVariablesFromTrace(
  projectId: string,
  variables: string[],
  traceId: string,
  // this here are variables which were inserted by users. Need to validate before DB query.
  variableMapping: z.infer<typeof variableMappingList>,
) {
  const mappingResult: { var: string; value: string }[] = [];

  // find the context for each variable of the template
  for (const variable of variables) {
    const mapping = variableMapping.find(
      (m) => m.templateVariable === variable,
    );

    if (!mapping) {
      logger.debug(`No mapping found for variable ${variable}`);
      mappingResult.push({ var: variable, value: "" });
      continue; // no need to fetch additional data
    }

    if (mapping.langfuseObject === "trace") {
      // find the internal definitions of the column
      const safeInternalColumn = availableEvalVariables
        .find((o) => o.id === "trace")
        ?.availableColumns.find((col) => col.id === mapping.selectedColumnId);

      // if no column was found, we still process with an empty variable
      if (!safeInternalColumn?.id) {
        logger.error(
          `No column found for variable ${variable} and column ${mapping.selectedColumnId}`,
        );
        mappingResult.push({ var: variable, value: "" });
        continue;
      }

      const trace = await kyselyPrisma.$kysely
        .selectFrom("traces as t")
        .select(
          sql`${sql.raw(safeInternalColumn.internal)}`.as(
            safeInternalColumn.id,
          ),
        ) // query the internal column name raw
        .where("id", "=", traceId)
        .where("project_id", "=", projectId)
        .executeTakeFirst();

      // user facing errors
      if (!trace) {
        logger.error(
          `Trace ${traceId} for project ${projectId} not found. Eval will succeed without trace input. Please ensure the mapped data on the trace exists and consider extending the job delay.`,
        );
        throw new LangfuseNotFoundError(
          `Trace ${traceId} for project ${projectId} not found. Eval will succeed without trace input. Please ensure the mapped data on the trace exists and consider extending the job delay.`,
        );
      }

      mappingResult.push({
        var: variable,
        value: parseUnknwnToString(trace[mapping.selectedColumnId]),
      });
    }
    if (["generation", "span", "event"].includes(mapping.langfuseObject)) {
      const safeInternalColumn = availableEvalVariables
        .find((o) => o.id === mapping.langfuseObject)
        ?.availableColumns.find((col) => col.id === mapping.selectedColumnId);

      if (!mapping.objectName) {
        logger.info(
          `No object name found for variable ${variable} and object ${mapping.langfuseObject}`,
        );
        mappingResult.push({ var: variable, value: "" });
        continue;
      }

      if (!safeInternalColumn?.id) {
        logger.warn(
          `No column found for variable ${variable} and column ${mapping.selectedColumnId}`,
        );
        mappingResult.push({ var: variable, value: "" });
        continue;
      }

      const observation = await kyselyPrisma.$kysely
        .selectFrom("observations as o")
        .select(
          sql`${sql.raw(safeInternalColumn.internal)}`.as(
            safeInternalColumn.id,
          ),
        ) // query the internal column name raw
        .where("trace_id", "=", traceId)
        .where("project_id", "=", projectId)
        .where("name", "=", mapping.objectName)
        .orderBy("start_time", "desc")
        .executeTakeFirst();

      // user facing errors
      if (!observation) {
        logger.error(
          `Observation ${mapping.objectName} for trace ${traceId} not found. Please ensure the mapped data exists and consider extending the job delay.`,
        );
        throw new LangfuseNotFoundError(
          `Observation ${mapping.objectName} for trace ${traceId} not found. Please ensure the mapped data exists and consider extending the job delay.`,
        );
      }

      mappingResult.push({
        var: variable,
        value: parseUnknwnToString(observation[mapping.selectedColumnId]),
      });
    }
  }
  return mappingResult;
}

export const parseUnknwnToString = (value: unknown): string => {
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
