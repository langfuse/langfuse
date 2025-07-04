import { jsonSchemaNullable, type TriggerEventAction } from "@langfuse/shared";
import {
  logger,
  type PromptResult,
  PromptVersionChangeQueue,
  QueueJobs,
  QueueName,
} from "@langfuse/shared/src/server";
import { v4 } from "uuid";

/**
 * Queue prompt change events for async processing
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
    name: QueueJobs.PromptVersionChangeJob as QueueJobs.PromptVersionChangeJob,
    payload: {
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
    // Queue the prompt version change event for async processing
    await PromptVersionChangeQueue.getInstance()?.add(
      QueueName.PromptVersionChangeQueue,
      event,
    );

    logger.info(
      `Queued prompt version change event for prompt ${promptData.id} in project ${promptData.projectId} with action ${action}`,
    );
  } catch (error) {
    logger.error(
      `Failed to queue prompt version change event for prompt ${promptData.id} for project ${promptData.projectId}: ${error}`,
    );
    throw error;
  }
};
