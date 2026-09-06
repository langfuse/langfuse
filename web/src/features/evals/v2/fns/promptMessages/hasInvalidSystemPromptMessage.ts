import type { EvaluatorPromptMessage } from "@langfuse/shared";

export const EMPTY_PROMPT_MESSAGE_ERROR =
  "Add content to every prompt message before saving.";
export const INVALID_SYSTEM_PROMPT_MESSAGE_ERROR =
  "System messages are only allowed as the first prompt message.";

export type PromptMessagesValidationMessages = {
  emptyPromptMessage: string;
  invalidSystemPromptMessage: string;
};

const DEFAULT_MESSAGES: PromptMessagesValidationMessages = {
  emptyPromptMessage: EMPTY_PROMPT_MESSAGE_ERROR,
  invalidSystemPromptMessage: INVALID_SYSTEM_PROMPT_MESSAGE_ERROR,
};

function hasInvalidSystemPromptMessage(
  messages: EvaluatorPromptMessage[],
): boolean {
  return messages.some(
    (message, index) => index > 0 && message.role === "system",
  );
}

function hasEmptyPromptMessage(messages: EvaluatorPromptMessage[]): boolean {
  return messages.some((message) => message.content.trim().length === 0);
}

export function getPromptMessagesValidationError(
  messages: EvaluatorPromptMessage[],
  validationMessages: PromptMessagesValidationMessages = DEFAULT_MESSAGES,
): string | null {
  if (hasEmptyPromptMessage(messages)) {
    return validationMessages.emptyPromptMessage;
  }
  if (hasInvalidSystemPromptMessage(messages)) {
    return validationMessages.invalidSystemPromptMessage;
  }
  return null;
}
