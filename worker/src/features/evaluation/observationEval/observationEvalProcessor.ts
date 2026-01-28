import { z } from "zod/v4";
import {
  DEFAULT_TRACE_ENVIRONMENT,
  LLMAsJudgeExecutionEventSchema,
  logger,
} from "@langfuse/shared/src/server";
import {
  observationForEvalSchema,
  observationVariableMappingList,
  type ObservationVariableMapping,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { UnrecoverableError } from "../../../errors/UnrecoverableError";
import { extractObservationVariables } from "./extractObservationVariables";
import { executeLLMAsJudgeEvaluation } from "../evalService";
import { getEvalS3StorageClient } from "../s3StorageClient";
import { type ObservationForEval } from "./types";

/**
 * Dependencies for processing observation evals.
 * Allows S3 operations to be injected for testability.
 */
export interface ObservationEvalProcessorDeps {
  downloadObservationFromS3: (path: string) => Promise<string>;
}

/**
 * Creates production dependencies for the observation eval processor.
 */
export function createObservationEvalProcessorDeps(): ObservationEvalProcessorDeps {
  return {
    downloadObservationFromS3: async (path: string) => {
      const s3Client = getEvalS3StorageClient();

      return s3Client.download(path);
    },
  };
}

/**
 * Processes an observation-level LLM-as-a-judge evaluation job.
 *
 * This function:
 * 1. Fetches and validates job execution, config, and template
 * 2. Downloads observation data from S3 (stored during scheduling)
 * 3. Extracts variables from the observation
 * 4. Calls the shared executeLLMAsJudgeEvaluation() for LLM call and score persistence
 */
export async function processObservationEval({
  event,
  deps = createObservationEvalProcessorDeps(),
}: {
  event: z.infer<typeof LLMAsJudgeExecutionEventSchema>;
  deps?: ObservationEvalProcessorDeps;
}): Promise<void> {
  logger.debug(
    `Processing observation eval job ${event.jobExecutionId} for project ${event.projectId}`,
  );

  // Fetch job execution
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

  // Fetch job configuration
  const evalJobConfig = await prisma.jobConfiguration.findFirst({
    where: {
      id: job.jobConfigurationId,
      projectId: event.projectId,
    },
    include: {
      evalTemplate: true,
    },
  });

  if (!evalJobConfig || !evalJobConfig.evalTemplate) {
    throw new UnrecoverableError(
      `Job configuration or template not found for job ${job.id}`,
    );
  }

  // Download observation data from S3
  let observationData: ObservationForEval;
  let downloadedString: string;

  try {
    downloadedString = await deps.downloadObservationFromS3(
      event.observationS3Path,
    );
  } catch (e) {
    // S3 download failures are retryable (network issues, temporary unavailability)
    throw new Error(
      `Failed to download observation from S3 at ${event.observationS3Path}: ${e}`,
    );
  }

  // Parse and validate the downloaded data - these are permanent failures
  try {
    const parsedJson = JSON.parse(downloadedString);
    observationData = observationForEvalSchema.parse(parsedJson);
  } catch (e) {
    // JSON parse errors are permanent - the data won't change on retry
    throw new UnrecoverableError(
      `Invalid observation data from S3 at ${event.observationS3Path}: invalid JSON - ${e}`,
    );
  }

  logger.debug(
    `Downloaded observation data for job ${job.id}: span_id=${observationData.span_id}`,
  );

  // Extract variables from observation
  const parsedVariableMapping = observationVariableMappingList.parse(
    evalJobConfig.variableMapping,
  ) as ObservationVariableMapping[];

  const extractedVariables = extractObservationVariables({
    observation: observationData,
    variableMapping: parsedVariableMapping,
  });

  logger.debug(
    `Extracted ${extractedVariables.length} variables for job ${job.id}`,
  );

  // Execute the shared LLM-as-a-judge evaluation
  await executeLLMAsJudgeEvaluation({
    projectId: event.projectId,
    jobExecutionId: event.jobExecutionId,
    job,
    config: evalJobConfig,
    template: evalJobConfig.evalTemplate,
    extractedVariables,
    environment: observationData.environment ?? DEFAULT_TRACE_ENVIRONMENT,
  });
}
