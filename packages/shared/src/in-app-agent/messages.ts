import type { AgUiMessage } from "./schema";

/**
 * Message-shape pruning shared by model-context replay and settled-transcript
 * rendering. These operate on canonical AG-UI messages and must never run over
 * a live agent seed: an in-flight tool call has no result yet, and removing it
 * leaves the arriving TOOL_CALL_RESULT with nothing to attach to.
 */

export function dropUnpairedAssistantToolCalls(
  messages: readonly AgUiMessage[],
) {
  const toolResultIds = new Set(
    messages.flatMap((message) =>
      message.role === "tool" ? [message.toolCallId] : [],
    ),
  );
  let changed = false;

  const sanitizedMessages = messages.map((message): AgUiMessage => {
    if (message.role !== "assistant" || !message.toolCalls?.length) {
      return message;
    }

    const pairedToolCalls = message.toolCalls.filter((toolCall) =>
      toolResultIds.has(toolCall.id),
    );

    if (pairedToolCalls.length === message.toolCalls.length) {
      return message;
    }

    changed = true;

    if (pairedToolCalls.length === 0) {
      const sanitizedMessage = { ...message };
      delete sanitizedMessage.toolCalls;
      return sanitizedMessage;
    }

    return { ...message, toolCalls: pairedToolCalls };
  });

  return changed ? sanitizedMessages : messages;
}

export function dropEmptyAssistantMessages(messages: readonly AgUiMessage[]) {
  let changed = false;
  const sanitizedMessages = messages.filter((message) => {
    if (message.role !== "assistant") {
      return true;
    }

    const hasContent =
      typeof message.content === "string" && message.content.length > 0;
    const hasToolCalls =
      message.toolCalls !== undefined && message.toolCalls.length > 0;
    const keepMessage = hasContent || hasToolCalls;

    changed = changed || !keepMessage;
    return keepMessage;
  });

  return changed ? sanitizedMessages : messages;
}
