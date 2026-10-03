import type { AssistantContent, ModelMessage } from "ai";

import { LLMValidationError } from "../errors";
import {
  ChatMessage,
  ChatMessageRole,
  ChatMessageType,
  LLMAdapter,
  LLMToolCall,
  PROVIDERS_WITH_REQUIRED_USER_MESSAGE,
} from "../types";

// Helper function to safely stringify content
const safeStringify = (content: unknown): string => {
  try {
    return JSON.stringify(content);
  } catch {
    return "[Unserializable content]";
  }
};

const toSafeContent = (content: unknown): string =>
  typeof content === "string" ? content : safeStringify(content);

/**
 * Maps persisted/playground Langfuse `ChatMessage[]` to AI SDK
 * `ModelMessage[]`:
 * - the first system/developer message becomes `system`, later ones `user`
 * - non-string content is safely JSON-stringified
 * - blank content is preserved: a conversation replayed from a trace keeps the
 *   exact turns it was recorded with, so an empty or whitespace-only message is
 *   sent as-is rather than silently disappearing from the request
 * - tool results resolve their `toolName` from the preceding assistant
 *   tool-call messages; orphan tool results fail fast as a non-retryable
 *   error instead of a provider-side 400
 * - for providers that require at least one user message, a lone message
 *   becomes a user message regardless of its role (provider compatibility)
 */
export function mapChatMessagesToModelMessages(
  messages: ChatMessage[],
  options?: { adapter?: LLMAdapter },
): ModelMessage[] {
  if (
    messages.length === 1 &&
    options?.adapter !== undefined &&
    PROVIDERS_WITH_REQUIRED_USER_MESSAGE.includes(options.adapter)
  ) {
    return [{ role: "user", content: toSafeContent(messages[0].content) }];
  }

  const toolCallIdToName = new Map<string, string>();
  for (const message of messages) {
    if (message.type === ChatMessageType.AssistantToolCall) {
      for (const toolCall of message.toolCalls as LLMToolCall[]) {
        toolCallIdToName.set(toolCall.id, toolCall.name);
      }
    }
  }

  const modelMessages: ModelMessage[] = [];

  messages.forEach((message, idx) => {
    const safeContent = toSafeContent(message.content);

    if (message.type === ChatMessageType.AssistantToolCall) {
      const toolCalls = (message.toolCalls as LLMToolCall[]).map(
        (toolCall) => ({
          type: "tool-call" as const,
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          input: toolCall.args,
        }),
      );

      // An assistant turn that only selected tools has no text to send; keep
      // the empty text part only when there is nothing else in the message.
      const content: AssistantContent =
        safeContent.length > 0 || toolCalls.length === 0
          ? [{ type: "text" as const, text: safeContent }, ...toolCalls]
          : toolCalls;

      modelMessages.push({ role: "assistant", content });

      return;
    }

    if (message.type === ChatMessageType.ToolResult) {
      const toolName = toolCallIdToName.get(message.toolCallId);

      if (toolName === undefined) {
        throw new LLMValidationError({
          code: "invalid-request",
          message: `Tool result references unknown tool call id: ${message.toolCallId}`,
        });
      }

      modelMessages.push({
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: message.toolCallId,
            toolName,
            output: { type: "text", value: safeContent },
          },
        ],
      });

      return;
    }

    if (message.role === ChatMessageRole.User) {
      modelMessages.push({ role: "user", content: safeContent });

      return;
    }

    if (
      message.role === ChatMessageRole.System ||
      message.role === ChatMessageRole.Developer
    ) {
      modelMessages.push(
        idx === 0
          ? { role: "system", content: safeContent }
          : { role: "user", content: safeContent },
      );

      return;
    }

    modelMessages.push({ role: "assistant", content: safeContent });
  });

  return modelMessages;
}
