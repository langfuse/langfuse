import { prisma } from "@langfuse/shared/src/db";
import { redis } from "@langfuse/shared/src/server";
import {
  getActionById,
  logger,
  PromptService,
  QueueName,
  recordIncrement,
  TQueueJobTypes,
  WebhookInput,
} from "@langfuse/shared/src/server";
import { Job, Processor } from "bullmq";
import { backOff } from "exponential-backoff";
import { z } from "zod/v4";
import { ActionExecutionStatus } from "../../../prisma/generated/types";
import { jsonSchema } from "../../utils/zod";
import { EventActionSchema } from "../../domain";

export const WebhookOutboundBaseSchema = z.object({
  id: z.string(),
  timestamp: z.date(),
  type: z.literal("prompt"),
  action: EventActionSchema,
});

export const PromptWebhookOutboundSchema = z
  .object({
    prompt: z.object({
      id: z.string(),
      name: z.string(),
      version: z.number(),
      projectId: z.string(),
      labels: z.array(z.string()),
      prompt: jsonSchema.nullable(),
      type: z.string(),
      config: z.record(z.string(), z.any()),
      commitMessage: z.string().nullable(),
      tags: z.array(z.string()),
      createdAt: z.date(),
      updatedAt: z.date(),
    }),
  })
  .and(WebhookOutboundBaseSchema);

export type PromptWebhookOutput = z.infer<typeof PromptWebhookOutboundSchema>;

export const webhookProcessor: Processor = async (
  job: Job<TQueueJobTypes[QueueName.WebhookQueue]>,
) => {
  try {
    return await executeWebhook(job.data.payload, job.attemptsMade + 1);
  } catch (error) {
    logger.error("Error executing WebhookJob", error);
    throw error;
  }
};

// TODO: Webhook outgoing API versioning
export const executeWebhook = async (input: WebhookInput, attempt: number) => {
  const executionStart = new Date();

  const { projectId, actionId, triggerId, executionId } = input;

  try {
    logger.debug(
      `Executing webhook for action ${actionId} and execution ${executionId}`,
    );

    const actionConfig = await getActionById({
      projectId,
      actionId,
    });

    if (!actionConfig) {
      throw new Error("Action config not found");
    }

    if (actionConfig.config.type !== "WEBHOOK") {
      throw new Error("Action config is not a webhook");
    }

    const promptService = new PromptService(prisma, redis, recordIncrement);

    const prompt = await promptService.getPrompt({
      projectId,
      promptName: input.payload.promptName,
      version: input.payload.promptVersion,
      label: undefined,
    });

    // TypeScript now knows actionConfig.config is WebhookActionConfig
    const webhookConfig = actionConfig.config;

    await backOff(
      async () =>
        await fetch(webhookConfig.url, {
          method: "POST",
          body: JSON.stringify({
            ...PromptWebhookOutboundSchema.parse({
              id: input.eventId,
              timestamp: new Date(),
              type: input.payload.type,
              action: input.payload.action,
              prompt,
            }),
          }),
          headers: {
            ...webhookConfig.headers,
            "Content-Type": "application/json",
          },
        }),
      {
        numOfAttempts: 4,
      },
    );

    // Update action execution status
    await prisma.actionExecution.update({
      where: {
        projectId,
        triggerId,
        actionId,
        id: executionId,
      },
      data: {
        status: ActionExecutionStatus.COMPLETED,
        startedAt: executionStart,
        finishedAt: new Date(),
      },
    });

    logger.debug(`Webhook executed successfully for action ${actionId}`);
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
        status: ActionExecutionStatus.ERROR,
        startedAt: executionStart,
        finishedAt: new Date(),
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }
};
