import { Job } from "bullmq";
import { QueueName, TQueueJobTypes } from "../queues";
import { logger } from "../logger";
import {
  getTriggerConfigurations,
  getActionById,
  anyPromptExists,
} from "../repositories";
import { TriggerEventAction, TriggerEventSource } from "../../domain";
import { ActionExecutionStatus, JobConfigState } from "../../db";
import { WebhookQueue, QueueJobs } from "..";
import { prisma } from "../../db";
import { v4 } from "uuid";

/**
 * Helper function to check if action filter matches the event action
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

export const promptVersionChangeProcessor = async (
  job: Job<TQueueJobTypes[QueueName.PromptVersionChangeQueue]>,
): Promise<void> => {
  const { id, name, version, projectId, type } = job.data.payload;

  try {
    // Get active prompt triggers
    const triggers = await getTriggerConfigurations({
      projectId: projectId,
      eventSource: TriggerEventSource.Prompt,
      status: JobConfigState.ACTIVE,
    });

    logger.debug(`Found ${triggers.length} active prompt triggers`, {
      jobId: job.id,
    });

    // Process each trigger
    for (const trigger of triggers) {
      try {
        // Check if action matches
        if (!actionMatches(type, trigger.filter)) {
          logger.debug(`Action ${type} doesn't match trigger ${trigger.id}`, {
            jobId: job.id,
          });
          continue;
        }

        // Check if prompt exists with remaining filters (skip for deleted prompts)
        if (type !== "deleted") {
          const nonActionFilters = trigger.filter.filter(
            (f) => f.column !== "action",
          );
          const promptMatches = await anyPromptExists({
            projectId,
            promptId: id,
            filter: nonActionFilters,
          });

          if (!promptMatches) {
            logger.debug(`Prompt doesn't match trigger ${trigger.id} filters`, {
              jobId: job.id,
            });
            continue;
          }
        }

        logger.debug(`Trigger ${trigger.id} matches, executing actions`, {
          jobId: job.id,
        });

        // Execute webhook actions
        for (const actionId of trigger.actionIds) {
          await executeWebhookAction(
            id,
            name,
            version,
            projectId,
            type,
            trigger.id,
            actionId,
            job.id,
          );
        }
      } catch (error) {
        logger.error(`Error processing trigger ${trigger.id}`, {
          error,
          jobId: job.id,
        });
        // Continue processing other triggers instead of failing the entire job
      }
    }

    logger.info("Successfully processed prompt version change event", {
      jobId: job.id,
      promptId: id,
      changeType: type,
    });
  } catch (error) {
    logger.error("Failed to process prompt version change event", {
      jobId: job.id,
      promptId: id,
      changeType: type,
      error,
    });
    throw error; // Re-throw to allow the queue to handle retries
  }
};

/**
 * Execute a webhook action for a prompt version change
 */
async function executeWebhookAction(
  promptId: string,
  promptName: string,
  promptVersion: number,
  projectId: string,
  action: string,
  triggerId: string,
  actionId: string,
  jobId: string | undefined,
): Promise<void> {
  // Get action configuration
  const actionConfig = await getActionById({
    projectId: projectId,
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
      projectId: projectId,
      triggerId: triggerId,
      actionId: actionId,
      status: ActionExecutionStatus.PENDING,
      sourceId: eventId,
      input: {
        promptName: promptName,
        promptVersion: promptVersion,
        promptId: promptId,
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
        promptName: promptName,
        promptVersion: promptVersion,
        action: action as TriggerEventAction,
        type: "prompt",
      },
    },
    name: QueueJobs.WebhookJob,
  });

  logger.info("Webhook queued for prompt version change", {
    executionId,
    triggerId,
    actionId,
    promptId: promptId,
    action,
    jobId,
  });
}
