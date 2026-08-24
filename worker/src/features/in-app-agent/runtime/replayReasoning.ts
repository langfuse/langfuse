import type { AgUiMessage } from "@langfuse/shared/in-app-agent";
import { isRecord } from "@langfuse/shared/in-app-agent/server/toolErrors";

type ReplayReasoningPart = {
  type: "reasoning";
  text: string;
  providerOptions: { bedrock: { signature: string } };
};

export function applyReplayReasoningToPrompt(
  prompt: unknown,
  messages: readonly AgUiMessage[],
) {
  if (!Array.isArray(prompt)) {
    return prompt;
  }

  const reasoningByAssistantId = collectSignedReasoningByAssistant(messages);

  if (reasoningByAssistantId.size === 0) {
    return prompt;
  }

  const replayedAssistantIds = messages.flatMap((message) =>
    message.role === "assistant" ? [message.id] : [],
  );
  let assistantIndex = 0;

  return prompt.map((message) => {
    if (!isRecord(message) || message.role !== "assistant") {
      return message;
    }

    const content = message.content;
    const replayedAssistantId =
      typeof message.id === "string"
        ? message.id
        : replayedAssistantIds[assistantIndex];
    assistantIndex += 1;

    if (hasReasoningPart(content)) {
      return message;
    }

    const reasoningParts = replayedAssistantId
      ? reasoningByAssistantId.get(replayedAssistantId)
      : undefined;

    if (!reasoningParts?.length) {
      return message;
    }

    return {
      ...message,
      content: [...reasoningParts, ...toContentParts(content)],
    };
  });
}

function collectSignedReasoningByAssistant(messages: readonly AgUiMessage[]) {
  const reasoningByAssistantId = new Map<string, ReplayReasoningPart[]>();

  messages.forEach((message, index) => {
    if (message.role !== "reasoning" || !message.signature) {
      return;
    }

    const followingAssistant = messages
      .slice(index + 1)
      .find((candidate) => candidate.role === "assistant");
    const precedingAssistant = messages
      .slice(0, index)
      .toReversed()
      .find((candidate) => candidate.role === "assistant");
    const targetAssistant = followingAssistant ?? precedingAssistant;

    if (targetAssistant?.role !== "assistant") {
      return;
    }

    const parts = reasoningByAssistantId.get(targetAssistant.id) ?? [];
    parts.push({
      type: "reasoning",
      text: message.content,
      providerOptions: { bedrock: { signature: message.signature } },
    });
    reasoningByAssistantId.set(targetAssistant.id, parts);
  });

  return reasoningByAssistantId;
}

function hasReasoningPart(content: unknown) {
  return (
    Array.isArray(content) &&
    content.some(
      (part) =>
        isRecord(part) &&
        (part.type === "reasoning" || part.type === "thinking"),
    )
  );
}

function toContentParts(content: unknown) {
  if (Array.isArray(content)) {
    return content;
  }

  if (typeof content === "string" && content.length > 0) {
    return [{ type: "text" as const, text: content }];
  }

  return [];
}
