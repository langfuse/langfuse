import { z } from "zod/v4";
import {
  LLMAsJudgeExecutionEventSchema,
  logger,
  StorageService,
  StorageServiceFactory,
} from "@langfuse/shared/src/server";
import {
  observationVariableMappingList,
  variableMappingList,
  type ObservationVariableMapping,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { env } from "../../../env";
import { UnrecoverableError } from "../../../errors/UnrecoverableError";
import { extractObservationVariables } from "./extractObservationVariables";
import { executeLLMAsJudgeEvaluation } from "../evalService";
import { type ObservationEvent } from "./types";

let s3StorageServiceClient: StorageService;

function getS3StorageServiceClient(bucketName: string): StorageService {
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
}: {
  event: z.infer<typeof LLMAsJudgeExecutionEventSchema>;
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

  // Check if job was cancelled
  if (job.status === "CANCELLED") {
    logger.debug(`Job ${job.id} was cancelled, deleting execution record.`);
    await prisma.jobExecution.delete({
      where: {
        id: job.id,
        projectId: event.projectId,
      },
    });
    return;
  }

  // Fetch job configuration
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

  // Fetch eval template
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

  // Download observation data from S3
  const s3Client = getS3StorageServiceClient(
    env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
  );

  let observationData: ObservationEvent;
  try {
    const downloadedString = await s3Client.download(event.observationS3Path);
    const parsed = JSON.parse(downloadedString) as ObservationEvent[];

    if (!parsed || parsed.length === 0) {
      throw new Error("Empty observation data from S3");
    }

    observationData = parsed[0];
  } catch (e) {
    throw new UnrecoverableError(
      `Failed to download observation from S3 at ${event.observationS3Path}: ${e}`,
    );
  }

  logger.debug(
    `Downloaded observation data for job ${job.id}: spanId=${observationData.spanId}`,
  );

  // Extract variables from observation
  const parsedVariableMapping = observationVariableMappingList.parse(
    config.variableMapping,
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
    config,
    template,
    extractedVariables,
  });
}
