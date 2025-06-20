import { Job, Processor } from "bullmq";
import { backOff } from "exponential-backoff";
import { ActionExecutionStatus } from "../../../prisma/generated/types";
import { PromptWebhookOutboundSchema } from "../../domain";
import { prisma } from "../../db";
import { recordIncrement } from "../instrumentation";
import { TQueueJobTypes, QueueName, WebhookInput } from "../queues";
import { getActionById } from "../repositories";
import { PromptService } from "../services/PromptService";
import { redis } from "../redis/redis";
import { logger } from "..";

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
      async () => {
        const res = await fetch(webhookConfig.url, {
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
          headers: webhookConfig.headers,
        });
        if (res.status !== 200) {
          logger.error(
            `Webhook for project ${projectId} failed with status ${res.status}`,
          );
          throw new Error(`Webhook failed with status ${res.status}`);
        }
      },
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
