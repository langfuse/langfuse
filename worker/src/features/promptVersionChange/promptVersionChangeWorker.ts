import {
  type TriggerEventAction,
  type Prompt,
  jsonSchemaNullable,
  InternalServerError,
  FilterCondition,
} from "@langfuse/shared";
import {
  getTriggerConfigurations,
  getActionById,
  logger,
  WebhookQueue,
  QueueName,
  QueueJobs,
  InMemoryFilterService,
  type PromptResult,
  getAutomations,
  type PromptVersionChangeEventType,
} from "@langfuse/shared/src/server";
import { TriggerEventSource } from "@langfuse/shared";
import { ActionExecutionStatus, JobConfigState } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { v4 } from "uuid";

/**
 * Helper function to check if action filter matches the event action
 */
function actionMatches(
  action: string,
  triggerFilters: FilterCondition[],
): boolean {
  const actionFilter = triggerFilters.find((f) => f.column === "action");
  if (!actionFilter) return true;

  const filterValue = actionFilter.value as string[];
  const operator = actionFilter.operator;

  switch (operator) {
    case "any of":
      return Array.isArray(filterValue) ? filterValue.includes(action) : false;
    case "none of":
      return Array.isArray(filterValue) ? !filterValue.includes(action) : true;
    case "=":
      return filterValue[0] === action;
    case "<>":
      return filterValue[0] !== action;
    default:
      return false;
  }
}

/**
 * Process prompt change events with in-memory filtering
 */
export const promptVersionChangeWorker = async (
  event: PromptVersionChangeEventType,
): Promise<void> => {
  try {
    logger.info(
      `Processing prompt version change event for prompt ${event.promptId} for project ${event.projectId}`,
      { event: JSON.stringify(event, null, 2) },
    );

    // Get active prompt triggers
    const triggers = await getTriggerConfigurations({
      projectId: event.projectId,
      eventSource: TriggerEventSource.Prompt,
      status: JobConfigState.ACTIVE,
    });

    logger.debug(`Found ${triggers.length} active prompt triggers`, {
      promptId: event.promptId,
      projectId: event.projectId,
      action: event.action,
    });

    // Process each trigger
    for (const trigger of triggers) {
      try {
        // Check if action matches
        if (!actionMatches(event.action, trigger.filter)) {
          logger.debug(
            `Action ${event.action} doesn't match trigger ${trigger.id}`,
            {
              promptId: event.promptId,
              projectId: event.projectId,
            },
          );
          continue;
        }

        // Check if prompt matches remaining filters using in-memory filtering
        const nonActionFilters = trigger.filter.filter(
          (f) => f.column !== "action",
        );

        // Create a field mapper for prompt data
        const fieldMapper = (data: Prompt, column: string) => {
          switch (column) {
            case "name":
              return data.name;
            case "version":
              return data.version;
            case "tags":
              return data.tags;
            case "labels":
              return data.labels;
            case "type":
              return data.type;
            case "createdBy":
              return data.createdBy;
            case "createdAt":
              return data.createdAt;
            case "updatedAt":
              return data.updatedAt;
            case "isActive":
              return data.isActive;
            default:
              return undefined;
          }
        };

        const promptMatches = InMemoryFilterService.evaluateFilter(
          event.prompt,
          nonActionFilters,
          fieldMapper,
        );

        if (!promptMatches) {
          logger.debug(`Prompt doesn't match trigger ${trigger.id} filters`, {
            promptId: event.promptId,
            projectId: event.projectId,
          });
          continue;
        }

        logger.debug(`Trigger ${trigger.id} matches, executing actions`, {
          promptId: event.promptId,
          projectId: event.projectId,
          action: event.action,
        });

        if (trigger.actionIds.length !== 1) {
          logger.debug(
            `Trigger ${trigger.id} for project ${trigger.projectId} has multiple or no actions. This is not expected`,
          );
          throw new InternalServerError(
            `Trigger ${trigger.id} for project ${trigger.projectId} has multiple or no actions. This is not expected`,
          );
        }

        await Promise.all(
          trigger.actionIds.map(async (actionId) =>
            executeWebhookAction({
              promptData: {
                ...event.prompt,
                resolutionGraph: null,
              },
              action: event.action,
              triggerId: trigger.id,
              actionId,
              projectId: event.projectId,
            }),
          ),
        );
      } catch (error) {
        logger.error(
          `Error processing trigger ${trigger.id} for prompt ${event.promptId} for project ${event.projectId}: ${error}`,
        );
        // Continue processing other triggers instead of failing the entire operation
      }
    }
  } catch (error) {
    logger.error(
      `Failed to process prompt version change event for prompt ${event.promptId} for project ${event.projectId}: ${error}`,
    );
    throw error; // Re-throw to trigger retry mechanism
  }
};

/**
 * Execute a webhook action for a prompt version change
 */
async function executeWebhookAction({
  promptData,
  action,
  triggerId,
  actionId,
  projectId,
}: {
  promptData: PromptResult;
  action: string;
  triggerId: string;
  actionId: string;
  projectId: string;
}): Promise<void> {
  // Get action configuration
  const actionConfig = await getActionById({
    projectId,
    actionId,
  });

  if (!actionConfig) {
    throw new Error(`Action ${actionId} not found`);
  }

  const automations = await getAutomations({
    projectId,
    actionId,
  });

  if (automations.length !== 1) {
    throw new InternalServerError(
      `Expected 1 automation for action ${actionId}, got ${automations.length}`,
    );
  }

  const executionId = v4();

  // Create execution record
  const execution = await prisma.automationExecution.create({
    data: {
      id: executionId,
      projectId,
      triggerId: triggerId,
      actionId: actionId,
      status: ActionExecutionStatus.PENDING,
      sourceId: promptData.id,
      input: {
        promptName: promptData.name,
        promptVersion: promptData.version,
        promptId: promptData.id,
        automationId: automations[0].id,
        type: "prompt",
      },
    },
  });

  logger.debug(
    `Created action execution ${execution.id} for project ${projectId} and trigger ${triggerId} and action ${actionId}`,
  );

  // Queue webhook
  await WebhookQueue.getInstance()?.add(QueueName.WebhookQueue, {
    timestamp: new Date(),
    id: v4(),
    payload: {
      projectId,
      automationId: automations[0].id,
      executionId: executionId,
      payload: {
        action: action as TriggerEventAction,
        type: "prompt",
        prompt: {
          ...promptData,
          prompt: jsonSchemaNullable.parse(promptData.prompt),
          config: jsonSchemaNullable.parse(promptData.config),
        },
      },
    },
    name: QueueJobs.WebhookJob,
  });
}
