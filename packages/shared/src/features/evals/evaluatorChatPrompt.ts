import { z } from "zod";

const EVALUATOR_CHAT_PROMPT_PREFIX = "langfuse:evaluator-chat-prompt:v1:";

export const EvaluatorChatMessageSchema = z
  .object({
    role: z.enum(["user", "assistant", "system"]),
    content: z.string(),
  })
  .strict();

export const EvaluatorChatPromptSchema = z
  .array(EvaluatorChatMessageSchema)
  .min(1);

export type EvaluatorChatMessage = z.infer<typeof EvaluatorChatMessageSchema>;

export function serializeEvaluatorChatPrompt(
  messages: EvaluatorChatMessage[],
): string {
  return `${EVALUATOR_CHAT_PROMPT_PREFIX}${JSON.stringify(
    EvaluatorChatPromptSchema.parse(messages),
  )}`;
}

export function parseEvaluatorChatPrompt(
  prompt: string,
): EvaluatorChatMessage[] | null {
  if (!prompt.startsWith(EVALUATOR_CHAT_PROMPT_PREFIX)) {
    return null;
  }

  return EvaluatorChatPromptSchema.parse(
    JSON.parse(prompt.slice(EVALUATOR_CHAT_PROMPT_PREFIX.length)),
  );
}
