import { processPromptWebhooks } from "@/src/features/prompts/server/promptWebhookProcessor";
import { type TriggerEventAction, type Prompt } from "@langfuse/shared";

export const promptChangeEventSourcing = async (
  promptData: Prompt,
  action: TriggerEventAction,
) => {
  await processPromptWebhooks(promptData, action);
};
