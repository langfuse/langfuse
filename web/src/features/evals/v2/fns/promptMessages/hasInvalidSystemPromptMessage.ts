import type { EvaluatorPromptMessage } from "@langfuse/shared";

export function hasInvalidSystemPromptMessage(
  messages: EvaluatorPromptMessage[],
): boolean {
  return messages.some(
    (message, index) => index > 0 && message.role === "system",
  );
}
