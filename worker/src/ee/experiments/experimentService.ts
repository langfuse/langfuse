import { z } from "zod";
import {
  LLMApiKeySchema,
  logger,
  ZodModelConfig,
} from "@langfuse/shared/src/server";
import { kyselyPrisma, ObservationType, prisma } from "@langfuse/shared/src/db";
import { ExperimentCreateEventSchema } from "@langfuse/shared/src/server";
import {
  ForbiddenError,
  InvalidRequestError,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { backOff } from "exponential-backoff";
import { callLLM } from "../../features/utilities";
import { compileHandlebarString } from "../../features/evaluation/evalService";

const metadataSchema = ZodModelConfig.extend({
  prompt_id: z.string(),
  provider: z.string(),
  model: z.string(),
}).strict();

export const createExperimentJob = async ({
  event,
}: {
  event: z.infer<typeof ExperimentCreateEventSchema>;
}) => {
  logger.info("Processing experiment create job", event);

  const { datasetId, projectId, runId } = event;

  // first, fetch all the context required for the experiment
  const datasetRun = await kyselyPrisma.$kysely
    .selectFrom("dataset_runs")
    .selectAll()
    .where("id", "=", runId)
    .where("project_id", "=", projectId)
    .executeTakeFirstOrThrow();

  if (!datasetRun.metadata) {
    throw new ForbiddenError(
      "Langfuse in-app experiments can only be run with available model and prompt configurations.",
    );
  }

  // validate the shape of the metadata using zod
  const metadata = metadataSchema.safeParse(datasetRun.metadata);
  if (!metadata.success) {
    throw new ForbiddenError(
      "Langfuse in-app experiments can only be run with available model and prompt configurations.",
    );
  }

  // validate the prompt
  const { prompt_id, provider, model, ...modelParams } = metadata.data;

  const prompt = await kyselyPrisma.$kysely
    .selectFrom("prompts")
    .selectAll()
    .where("id", "=", prompt_id)
    .where("project_id", "=", event.projectId)
    .executeTakeFirstOrThrow();

  if (!prompt || prompt.type !== "text" || typeof prompt.prompt !== "string") {
    logger.error(`Text prompt ${prompt_id} not found for project ${projectId}`);
    throw new InvalidRequestError(
      `Text prompt ${prompt_id} not found for project ${projectId}`,
    );
  }

  // validate the dataset

  const datasetItem = await prisma.datasetItem.findFirst({
    where: {
      datasetId,
      projectId,
    },
  });

  const datasetItemId = datasetItem?.id ?? "mockId";

  // retrieve a list of dataset item ids that have at least some variables present

  const apiKey = await prisma.llmApiKeys.findFirst({
    where: {
      projectId: event.projectId,
      provider,
    },
  });
  const parsedKey = LLMApiKeySchema.safeParse(apiKey);

  if (!parsedKey.success) {
    // this will fail the eval execution if a user deletes the API key.
    logger.error(
      `Job ${datasetItemId} did not find API key for provider ${provider} and project ${event.projectId}. Eval will fail. ${parsedKey.error}`,
    );
    throw new LangfuseNotFoundError(
      `API key for provider ${provider} and project ${event.projectId} not found.`,
    );
  }

  const mappingResult: { var: string; value: string }[] = []; // fix

  const promptAsString = compileHandlebarString(prompt.prompt, {
    ...Object.fromEntries(
      mappingResult.map(({ var: key, value }) => [key, value]),
    ),
  });

  const parsedLLMOutput = await backOff(
    () =>
      callLLM(
        datasetItemId, // should be the dataset item id
        parsedKey.data,
        promptAsString,
        modelParams,
        provider,
        model,
        z.any(), // specify type further
      ),
    {
      numOfAttempts: 1, // turn off retries as Langchain is doing that for us already.
    },
  );

  const trace = await prisma.trace.create({
    data: {
      projectId,
      input: "input test",
      output: parsedLLMOutput,
    },
  });

  const observation = await prisma.observation.create({
    data: {
      traceId: trace.id,
      projectId,
      type: ObservationType.GENERATION,
      input: "input test",
      output: parsedLLMOutput,
    },
  });

  if (datasetItem) {
    await prisma.datasetRunItems.create({
      data: {
        datasetItemId: datasetItem.id,
        traceId: trace.id,
        observationId: observation.id,
        datasetRunId: runId,
        projectId,
      },
    });
  }
};
