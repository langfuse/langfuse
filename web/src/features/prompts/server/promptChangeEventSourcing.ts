import { jsonSchemaNullable, type TriggerEventAction } from "@langfuse/shared";
import {
  logger,
  type PromptResult,
  EntityChangeQueue,
  QueueJobs,
  QueueName,
} from "@langfuse/shared/src/server";
import { v4 } from "uuid";

/**
 * Queue prompt change events for async processing using the generic EntityChangeQueue
 */
export const promptChangeEventSourcing = async (
  promptData: PromptResult | null,
  action: TriggerEventAction,
) => {
  if (!promptData) {
    return;
  }

  const event = {
    timestamp: new Date(),
    id: v4(),
    name: QueueJobs.EntityChangeJob as QueueJobs.EntityChangeJob,
    payload: {
      entityType: "prompt-version" as const,
      projectId: promptData.projectId,
      promptId: promptData.id,
      action: action,
      prompt: {
        ...promptData,
        prompt: jsonSchemaNullable.parse(promptData.prompt),
        config: jsonSchemaNullable.parse(promptData.config),
      },
    },
  };
  try {
    // Queue the entity change event for async processing
    await EntityChangeQueue.getInstance()?.add(
      QueueName.EntityChangeQueue,
      event,
    );

    logger.info(
      `Queued entity change event for prompt ${promptData.id} in project ${promptData.projectId} with action ${action}`,
    );
  } catch (error) {
    logger.error(
      `Failed to queue entity change event for prompt ${promptData.id} for project ${promptData.projectId}: ${error}`,
    );
    throw error;
  }
};
