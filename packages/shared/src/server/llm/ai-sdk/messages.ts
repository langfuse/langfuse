import type { AssistantContent, ModelMessage } from "ai";

import { LLMCompletionError } from "../errors";
import {
  ChatMessage,
  ChatMessageRole,
  ChatMessageType,
  LLMToolCall,
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
 * Maps Langfuse `ChatMessage[]` to AI SDK `ModelMessage[]`, mirroring the
 * LangChain mapping in `fetchLLMCompletion`:
 * - the first system/developer message becomes `system`, later ones `user`
 * - non-string content is safely JSON-stringified
 * - messages with empty content are dropped unless they carry tool calls
 * - tool results resolve their `toolName` from the preceding assistant
 *   tool-call messages; orphan tool results fail fast as a non-retryable
 *   error instead of a provider-side 400
 */
export function mapChatMessagesToModelMessages(
  messages: ChatMessage[],
): ModelMessage[] {
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
      const content: AssistantContent = [
        ...(safeContent.length > 0
          ? [{ type: "text" as const, text: safeContent }]
          : []),
        ...(message.toolCalls as LLMToolCall[]).map((toolCall) => ({
          type: "tool-call" as const,
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          input: toolCall.args,
        })),
      ];
      if (content.length === 0) return; // mirror empty-content filter
      modelMessages.push({ role: "assistant", content });

      return;
    }

    if (message.type === ChatMessageType.ToolResult) {
      const toolName = toolCallIdToName.get(message.toolCallId);

      if (toolName === undefined) {
        throw new LLMCompletionError({
          message: `Tool result references unknown tool call id: ${message.toolCallId}`,
          responseStatusCode: 400,
          isRetryable: false,
        });
      }

      if (safeContent.length === 0) return; // mirror empty-content filter

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

    if (safeContent.length === 0) return; // mirror empty-content filter

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
