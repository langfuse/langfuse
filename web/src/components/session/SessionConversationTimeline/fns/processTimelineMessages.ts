import {
  type NormalizedMessage,
  type ToolCallPart,
} from "@langfuse/shared/src/utils/normalized-io";

type ToolObservation = {
  type?: string | null;
  metadata: unknown;
  metadataTruncated?: boolean;
};

export function getStandaloneToolCallIds(
  observations: readonly ToolObservation[],
) {
  const toolCallIds = new Set<string>();

  for (const observation of observations) {
    if (observation.type !== "TOOL" || observation.metadataTruncated) {
      continue;
    }

    let metadataValue: unknown = observation.metadata;
    if (typeof metadataValue === "string") {
      try {
        metadataValue = JSON.parse(metadataValue) as unknown;
      } catch {
        // Metadata is optional for matching, so malformed values are ignored.
        continue;
      }
    }
    if (
      typeof metadataValue !== "object" ||
      metadataValue === null ||
      Array.isArray(metadataValue)
    ) {
      continue;
    }

    const metadata = metadataValue as Record<string, unknown>;
    const toolCallId = metadata.toolCallId ?? metadata.callID;
    if (typeof toolCallId === "string" && toolCallId.length > 0) {
      toolCallIds.add(toolCallId);
    }
  }

  return toolCallIds;
}

/**
 * Produces conversational messages and tool rows from one observation. Tool
 * history is omitted, while new output calls become rows unless a standalone
 * tool observation already represents the same call id.
 */
export function processTimelineMessages({
  messages,
  showSystemPrompt,
  standaloneToolCallIds,
}: {
  messages: NormalizedMessage[];
  showSystemPrompt: boolean;
  standaloneToolCallIds: ReadonlySet<string>;
}) {
  const visibleMessages: NormalizedMessage[] = [];
  const rolledUpToolCalls: ToolCallPart[] = [];

  for (const message of messages) {
    for (const part of message.parts) {
      if (
        message.source === "output" &&
        part.type === "tool-call" &&
        (!part.toolCallId || !standaloneToolCallIds.has(part.toolCallId))
      ) {
        rolledUpToolCalls.push(part);
      }
    }

    if (!showSystemPrompt && message.role === "system") continue;

    const parts = message.parts.filter(
      (part) => part.type !== "tool-call" && part.type !== "tool-result",
    );
    if (parts.length === 0) continue;

    if (message.role !== "system") {
      visibleMessages.push({ ...message, parts });
      continue;
    }

    const systemMessage = visibleMessages.find(
      (visibleMessage) => visibleMessage.role === "system",
    );
    if (systemMessage) {
      systemMessage.parts = systemMessage.parts.concat(parts);
      continue;
    }

    visibleMessages.push({ ...message, parts });
  }

  return { messages: visibleMessages, rolledUpToolCalls };
}
