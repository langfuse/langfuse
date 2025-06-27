import { v4 } from "uuid";
import {
  JobConfigState,
  ActionExecutionStatus,
  type Prompt,
} from "@prisma/client";
import { anyPromptExists } from "@/src/features/prompts/server/repositories/promptRepository";
import { type TriggerEventAction, TriggerEventSource } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  logger,
  getTriggerConfigurations,
  getActionById,
  WebhookQueue,
  QueueName,
  QueueJobs,
} from "@langfuse/shared/src/server";

/**
 * Check if action filter matches the event action
 */
function actionMatches(action: string, triggerFilters: any[]): boolean {
  const actionFilter = triggerFilters.find((f) => f.column === "action");
  if (!actionFilter) return true;

  const filterValue = actionFilter.value as string[];
  const operator = actionFilter.operator;

  switch (operator) {
    case "any of":
      return Array.isArray(filterValue) ? filterValue.includes(action) : false;
    case "none of":
      return Array.isArray(filterValue) ? !filterValue.includes(action) : true;
    case "equals":
      return filterValue[0] === action;
    case "not equals":
      return filterValue[0] !== action;
    default:
      return false;
  }
}

/**
 * Simple prompt webhook processor
 */
export const processPromptWebhooks = async (
  promptData: Prompt,
  action: TriggerEventAction,
): Promise<void> => {
  try {
    logger.info("Processing prompt webhooks", {
      promptId: promptData.id,
      promptName: promptData.name,
      action,
      projectId: promptData.projectId,
    });

    // Get active prompt triggers
    const triggers = await getTriggerConfigurations({
      projectId: promptData.projectId,
      eventSource: TriggerEventSource.Prompt,
      status: JobConfigState.ACTIVE,
    });

    logger.debug(`Found ${triggers.length} active prompt triggers`);

    // Process each trigger
    for (const trigger of triggers) {
      try {
        // Check if action matches
        if (!actionMatches(action, trigger.filter)) {
          logger.debug(`Action ${action} doesn't match trigger ${trigger.id}`);
          continue;
        }

        // Check if prompt exists with remaining filters
        const nonActionFilters = trigger.filter.filter(
          (f) => f.column !== "action",
        );
        const promptMatches = await anyPromptExists({
          projectId: promptData.projectId,
          promptId: promptData.id,
          filter: nonActionFilters,
        });

        if (!promptMatches) {
          logger.debug(`Prompt doesn't match trigger ${trigger.id} filters`);
          continue;
        }

        logger.debug(`Trigger ${trigger.id} matches, executing actions`);

        // Execute webhook actions
        for (const actionId of trigger.actionIds) {
          await executeWebhookAction(promptData, action, trigger.id, actionId);
        }
      } catch (error) {
        logger.error(`Error processing trigger ${trigger.id}`, { error });
      }
    }

    logger.info("Prompt webhook processing completed", {
      promptId: promptData.id,
      action,
    });
  } catch (error) {
    logger.error("Error processing prompt webhooks", {
      error,
      promptId: promptData.id,
      action,
    });
  }
};

/**
 * Execute a webhook action for a prompt
 */
async function executeWebhookAction(
  promptData: Prompt,
  action: TriggerEventAction,
  triggerId: string,
  actionId: string,
): Promise<void> {
  // Get action configuration
  const actionConfig = await getActionById({
    projectId: promptData.projectId,
    actionId,
  });

  if (!actionConfig) {
    throw new Error(`Action ${actionId} not found`);
  }

  const executionId = v4();
  const eventId = `evt_${v4()}`;

  // Create execution record
  await prisma.actionExecution.create({
    data: {
      id: executionId,
      projectId: promptData.projectId,
      triggerId: triggerId,
      actionId: actionId,
      status: ActionExecutionStatus.PENDING,
      sourceId: eventId,
      input: {
        promptName: promptData.name,
        promptVersion: promptData.version,
        promptId: promptData.id,
        action: action,
        type: "prompt",
      },
    },
  });

  // Queue webhook
  await WebhookQueue.getInstance()?.add(QueueName.WebhookQueue, {
    timestamp: new Date(),
    id: v4(),
    payload: {
      projectId: actionConfig.projectId,
      actionId: actionConfig.id,
      triggerId: triggerId,
      executionId: executionId,
      eventId: eventId,
      payload: {
        promptName: promptData.name,
        promptVersion: promptData.version,
        action: action,
        type: "prompt",
      },
    },
    name: QueueJobs.WebhookJob,
  });

  logger.info("Webhook queued for prompt", {
    executionId,
    triggerId,
    actionId,
    promptId: promptData.id,
    action,
  });
}
