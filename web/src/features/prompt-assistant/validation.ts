import { z } from "zod/v4";
import { ModelParamsSchema } from "../playground/server/validateChatCompletionBody";

export enum PromptFeedbackCategory {
  General = "general",
  Clarity = "clarity",
}

export const CreatePromptAssistantCompletion = z.object({
  projectId: z.string(),
  feedbackCategory: z
    .nativeEnum(PromptFeedbackCategory)
    .default(PromptFeedbackCategory.General),
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    }),
  ),
  targetPrompt: z.string(),
  modelParams: ModelParamsSchema,
});
