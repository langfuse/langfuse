import type { AgUiMessage } from "@langfuse/shared/in-app-agent";

export type CompletedInAppAgentToolCall = {
  toolCallId: string;
  toolName: string;
  toolArguments: unknown;
  toolResultContent?: string;
  toolError?: unknown;
};

export function getCompletedInAppAgentToolCalls(
  messages: readonly AgUiMessage[],
): CompletedInAppAgentToolCall[] {
  const toolCalls = new Map<
    string,
    Omit<CompletedInAppAgentToolCall, "toolResultContent" | "toolError">
  >();
  const toolResults = new Map<string, Extract<AgUiMessage, { role: "tool" }>>();

  for (const message of messages) {
    if (message.role === "assistant") {
      for (const toolCall of message.toolCalls ?? []) {
        toolCalls.set(toolCall.id, {
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          toolArguments: toolCall.function.arguments,
        });
      }
    } else if (message.role === "tool") {
      toolResults.set(message.toolCallId, message);
    }
  }

  return Array.from(toolCalls.values()).flatMap((toolCall) => {
    const result = toolResults.get(toolCall.toolCallId);
    return result
      ? [
          {
            ...toolCall,
            toolResultContent: result.content,
            toolError: result.error,
          },
        ]
      : [];
  });
}
