import { type NormalizedMessage } from "@langfuse/shared/src/utils/normalized-io";

export type ConversationEntry = {
  key: string;
  messageIndex: number;
  partIndex: number;
};

export function getConversationEntries(
  messages: readonly NormalizedMessage[],
  source?: NormalizedMessage["source"],
) {
  const entries: ConversationEntry[] = [];

  messages.forEach((message, messageIndex) => {
    if (source && message.source !== source) return;

    message.parts.forEach((part, partIndex) => {
      if (part.type === "tool-call" || part.type === "tool-result") return;

      const { providerMetadata: _providerMetadata, ...semanticPart } = part;
      entries.push({
        key: JSON.stringify([
          message.role,
          message.senderName ?? null,
          semanticPart,
        ]),
        messageIndex,
        partIndex,
      });
    });
  });

  return entries;
}
