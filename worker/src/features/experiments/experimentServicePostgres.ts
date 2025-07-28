import { z } from "zod/v4";
import {
  logger,
  DatasetRunItemUpsertQueue,
  type ChatMessage,
  PROMPT_EXPERIMENT_ENVIRONMENT,
  TraceParams,
} from "@langfuse/shared/src/server";
import { kyselyPrisma, prisma } from "@langfuse/shared/src/db";
import { type ExperimentCreateEventSchema } from "@langfuse/shared/src/server";
import { InvalidRequestError, type Prisma } from "@langfuse/shared";
import { backOff } from "exponential-backoff";
import { callLLM } from "../../features/utils";
import { QueueJobs, redis } from "@langfuse/shared/src/server";
import { randomUUID } from "node:crypto";
import { DatasetStatus } from "../../../../packages/shared/dist/prisma/generated/types";
import {
  generateUnifiedTraceId,
  parseDatasetItemInput,
  replaceVariablesInPrompt,
  TraceExecutionSource,
  shouldCreateTrace,
  validateAndSetupExperiment,
  validateDatasetItem,
} from "./utils";

export const createExperimentJobPostgres = async ({
  event,
}: {
  event: z.infer<typeof ExperimentCreateEventSchema>;
}) => {
  logger.info("Processing experiment create job", event);
  const { datasetId, projectId, runId } = event;

  /********************
   * INPUT VALIDATION *
   ********************/

  const experimentConfig = await validateAndSetupExperiment(event);

  /********************
   * FETCH DATASET ITEMS *
   ********************/

  const datasetItems = await prisma.datasetItem.findMany({
    where: {
      datasetId,
      projectId,
      status: DatasetStatus.ACTIVE,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  // validate dataset items against prompt configuration
  const validatedDatasetItems = datasetItems
    .filter(({ input }) =>
      validateDatasetItem(input, experimentConfig.allVariables),
    )
    .map((datasetItem) => ({
      ...datasetItem,
      input: parseDatasetItemInput(
        datasetItem.input as Prisma.JsonObject, // this is safe because we already filtered for valid input
        experimentConfig.allVariables,
      ),
    }));

  logger.info(
    `Found ${validatedDatasetItems.length} validated dataset items for dataset run ${runId}`,
  );

  if (!validatedDatasetItems.length) {
    throw new InvalidRequestError(
      `No Dataset ${datasetId} item input matches expected prompt variables or placeholders format`,
    );
  }

  for (const datasetItem of validatedDatasetItems) {
    // dedupe and skip if dataset run item already exists
    const existingRunItem = await kyselyPrisma.$kysely
      .selectFrom("dataset_run_items")
      .selectAll()
      .where("project_id", "=", projectId)
      .where("dataset_item_id", "=", datasetItem.id)
      .where("dataset_run_id", "=", runId)
      .executeTakeFirst();

    if (existingRunItem) {
      logger.info(
        `Dataset run item ${existingRunItem.id} already exists, skipping`,
      );
      continue;
    }

    /********************
     * VARIABLE EXTRACTION *
     ********************/

    let messages: ChatMessage[] = [];
    try {
      messages = replaceVariablesInPrompt(
        experimentConfig.validatedPrompt,
        datasetItem.input, // validated format
        experimentConfig.allVariables,
        experimentConfig.placeholderNames,
      );
    } catch (error) {
      // skip this dataset item if there is an error replacing variables
      logger.error(
        `Error replacing variables in prompt for dataset item ${datasetItem.id}`,
        error,
      );
      continue;
    }

    /********************
     * RUN ITEM CREATION *
     ********************/

    const newTraceId = generateUnifiedTraceId(runId, datasetItem.id);
    const runItem = await prisma.datasetRunItems.create({
      data: {
        datasetItemId: datasetItem.id,
        traceId: newTraceId,
        datasetRunId: runId,
        projectId,
      },
    });

    /********************
     * LLM MODEL CALL *
     ********************/

    if (shouldCreateTrace(TraceExecutionSource.POSTGRES)) {
      const traceParams: Omit<TraceParams, "tokenCountDelegate"> = {
        environment: PROMPT_EXPERIMENT_ENVIRONMENT,
        traceName: `dataset-run-item-${runItem.id.slice(0, 5)}`,
        traceId: newTraceId,
        projectId: event.projectId,
        authCheck: {
          validKey: true as const,
          scope: {
            projectId: event.projectId,
            accessLevel: "project",
          } as any,
        },
      };

      await backOff(
        async () =>
          await callLLM(
            experimentConfig.validatedApiKey,
            messages,
            experimentConfig.model_params,
            experimentConfig.provider,
            experimentConfig.model,
            traceParams,
          ),
        {
          numOfAttempts: 1, // turn off retries as Langchain is doing that for us already.
        },
      );
    }

    /********************
     * ASYNC RUN ITEM EVAL *
     ********************/

    if (redis) {
      const queue = DatasetRunItemUpsertQueue.getInstance();
      if (queue) {
        await queue.add(QueueJobs.DatasetRunItemUpsert, {
          payload: {
            projectId,
            datasetItemId: datasetItem.id,
            traceId: newTraceId,
          },
          id: randomUUID(),
          timestamp: new Date(),
          name: QueueJobs.DatasetRunItemUpsert as const,
        });
      }
    }
  }
};
