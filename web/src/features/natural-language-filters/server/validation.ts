import { z } from "zod/v4";
import { ChatMessageSchema } from "@langfuse/shared/src/server/llm/types";

export const CreateNaturalLanguageFilterCompletion = z.object({
  projectId: z.string(),
  messages: z.array(ChatMessageSchema),
  modelParams: z.object({
    model: z.string().max(256),
    temperature: z.number().min(0).max(1).optional(),
    maxTokens: z.number().min(1).max(4096).optional(),
    topP: z.number().min(0).max(1).optional(),
  }),
});

export type CreateNaturalLanguageFilterCompletionInput = z.infer<
  typeof CreateNaturalLanguageFilterCompletion
>;
