import { type TriggerEventAction, type Prompt } from "@langfuse/shared";
import { 
  PromptVersionChangeQueue, 
  QueueName, 
  QueueJobs, 
  logger 
} from "@langfuse/shared/src/server";
import { v4 } from "uuid";

export const promptChangeEventSourcing = async (
  promptData: Prompt,
  action: TriggerEventAction,
) => {
  try {
    logger.info("Queueing prompt version change event", {
      promptId: promptData.id,
      promptName: promptData.name,
      promptVersion: promptData.version,
      projectId: promptData.projectId,
      action,
    });

    // Queue the prompt version change event instead of processing directly
    await PromptVersionChangeQueue.getInstance()?.add(QueueName.PromptVersionChangeQueue, {
      timestamp: new Date(),
      id: v4(),
      payload: {
        id: promptData.id,
        name: promptData.name,
        version: promptData.version,
        projectId: promptData.projectId,
        type: action,
      },
      name: QueueJobs.PromptVersionChangeJob,
    });

    logger.info("Successfully queued prompt version change event", {
      promptId: promptData.id,
      action,
    });
  } catch (error) {
    logger.error("Failed to queue prompt version change event", {
      promptId: promptData.id,
      action,
      error,
    });
    throw error; // Let the caller handle the error
  }
};
