import {
  JobExecutionStatus,
  jsonSchema,
  MetadataDomain,
  Observation,
  ObservationLevelDomain,
  ObservationTypeDomain,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  getActionConfigById,
  getObservationById,
  logger,
  QueueJobs,
  WEBHOOK_ATTEMPTS,
  WebhookInput,
} from "@langfuse/shared/src/server";
import { Processor } from "bullmq";
import { z } from "zod";

export const ObservationWebhookOutputSchema = z.object({
  id: z.string(),
  traceId: z.string().nullable(),
  projectId: z.string(),
  environment: z.string(),
  type: ObservationTypeDomain,
  startTime: z.date(),
  endTime: z.date().nullable(),
  name: z.string().nullable(),
  metadata: MetadataDomain,
  parentObservationId: z.string().nullable(),
  level: ObservationLevelDomain,
  statusMessage: z.string().nullable(),
  version: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  model: z.string().nullable(),
  internalModelId: z.string().nullable(),
  modelParameters: jsonSchema.nullable(),
  input: jsonSchema.nullable(),
  output: jsonSchema.nullable(),
  completionStartTime: z.date().nullable(),
  promptId: z.string().nullable(),
  promptName: z.string().nullable(),
  promptVersion: z.number().nullable(),
  latency: z.number().nullable(),
  timeToFirstToken: z.number().nullable(),
  usageDetails: z.record(z.string(), z.number()),
  costDetails: z.record(z.string(), z.number()),
  providedCostDetails: z.record(z.string(), z.number()),
  // aggregated data from cost_details
  inputCost: z.number().nullable(),
  outputCost: z.number().nullable(),
  totalCost: z.number().nullable(),
  // aggregated data from usage_details
  inputUsage: z.number(),
  outputUsage: z.number(),
  totalUsage: z.number(),
});

export type ObservationWebhookOutput = z.infer<
  typeof ObservationWebhookOutputSchema
>;

const convertObservationToWebhookOutput = (
  observation: Observation,
): ObservationWebhookOutput => {
  return observation;
};

export const webhookProcessor: Processor = async (job) => {
  if (job.name === QueueJobs.WebhookJob) {
    try {
      return await executeWebhook(job.data);
    } catch (error) {
      logger.error("Error executing DataRetentionProcessingJob", error);
      throw error;
    }
  }
};

// TODO: Webhook outgoing API versioning
export const executeWebhook = async (input: WebhookInput, attempt: number) => {
  const {
    observationId,
    projectId,
    startTime,
    observationType,
    actionId,
    triggerId,
    executionId,
  } = input;
  try {
    logger.debug(`Executing webhook for action ${actionId}`);

    const observation = await getObservationById({
      id: observationId,
      projectId,
      fetchWithInputOutput: true,
      startTime,
      type: observationType,
    });

    if (!observation) {
      throw new Error("Observation not found");
    }

    const reqBody = convertObservationToWebhookOutput(observation);

    const actionConfig = await getActionConfigById({
      projectId,
      actionId,
    });

    if (!actionConfig) {
      throw new Error("Action config not found");
    }

    if (actionConfig.config.type !== "webhook") {
      throw new Error("Action config is not a webhook");
    }

    await fetch(actionConfig.config.url, {
      method: "POST",
      body: JSON.stringify(reqBody),
      headers: actionConfig.config.headers,
    });

    // Update action execution status
    await prisma.actionExecution.update({
      where: {
        projectId,
        triggerId,
        actionId,
        id: executionId,
      },
      data: {
        status: JobExecutionStatus.COMPLETED,
        finishedAt: new Date(),
      },
    });
  } catch (error) {
    logger.error("Error executing webhook", error);
    await prisma.actionExecution.update({
      where: {
        projectId,
        triggerId,
        actionId,
        id: executionId,
      },
      data: {
        status:
          attempt >= WEBHOOK_ATTEMPTS
            ? JobExecutionStatus.ERROR
            : JobExecutionStatus.PENDING,
        finishedAt: attempt >= WEBHOOK_ATTEMPTS ? new Date() : null,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }
};
