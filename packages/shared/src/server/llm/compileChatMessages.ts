import { z } from "zod/v4";
import { v4 as uuidv4 } from "uuid";
import {
  type ChatMessage,
  type PlaceholderMessage,
  ChatMessageType,
  type PromptChatMessageSchema,
  type ChatMessageWithId,
  type ChatMessageWithIdNoPlaceholders,
} from "./types";

export type MessagePlaceholderValues = Record<string, unknown[]>;
export type PromptMessage = z.infer<typeof PromptChatMessageSchema>;

export function isPlaceholder(
  message: PromptMessage,
): message is PlaceholderMessage {
  return "type" in message && message.type === ChatMessageType.Placeholder;
}

function replaceTextVariables(
  content: string,
  textVariables: Record<string, string>,
): string {
  let result = content;
  for (const [varName, varValue] of Object.entries(textVariables)) {
    // Create regex that handles optional whitespace around variable name
    const variablePattern = new RegExp(`{{\\s*${varName}\\s*}}`, "g");
    result = result.replace(variablePattern, varValue);
  }
  return result;
}

function expandPlaceholder(
  placeholder: PlaceholderMessage,
  placeholderValues: MessagePlaceholderValues,
): ChatMessage[] {
  const replacementMessages = placeholderValues[placeholder.name];

  if (!replacementMessages) {
    throw new Error(
      `Missing value for message placeholder: ${placeholder.name}`,
    );
  }

  if (!Array.isArray(replacementMessages)) {
    throw new Error(
      `Placeholder value for '${placeholder.name}' must be an array of messages`,
    );
  }

  // Allow arbitrary objects - just pass them through as ChatMessage
  // Users might want to use ChatML with placeholders for any message structure
  return replacementMessages.map((replacementMsg) => {
    if (typeof replacementMsg === "object" && replacementMsg !== null) {
      return replacementMsg as ChatMessage;
    }

    throw new Error(
      `Invalid message in placeholder '${placeholder.name}': expected object but got ${typeof replacementMsg}`,
    );
  });
}

export function compileChatMessages(
  messages: PromptMessage[],
  placeholderValues: MessagePlaceholderValues,
  textVariables?: Record<string, string>,
): ChatMessage[] {
  const expandedMessages = messages.flatMap((message) =>
    isPlaceholder(message)
      ? expandPlaceholder(message, placeholderValues)
      : [message as ChatMessage],
  );

  // substitute text variables
  if (!textVariables || Object.keys(textVariables).length === 0) {
    return expandedMessages;
  }

  return expandedMessages.map((message) => {
    if (!message.content || typeof message.content !== "string") {
      return message;
    }

    return {
      ...message,
      content: replaceTextVariables(message.content, textVariables),
    };
  });
}

export function compileChatMessagesWithIds(
  messages: ChatMessageWithId[],
  placeholderValues: MessagePlaceholderValues,
  textVariables?: Record<string, string>,
): ChatMessageWithIdNoPlaceholders[] {
  // TODO: check, is it even important to retain the IDs?
  const expandedMessages = messages.flatMap((message) => {
    if (isPlaceholder(message)) {
      const expandedMsgs = expandPlaceholder(message, placeholderValues);
      return expandedMsgs.map((msg) => ({ ...msg, id: uuidv4() }));
    } else {
      // Preserve message IDs for already non-placeholder messages
      return [message as ChatMessageWithIdNoPlaceholders];
    }
  });

  // substitute text variables
  if (!textVariables || Object.keys(textVariables).length === 0) {
    return expandedMessages;
  }

  return expandedMessages.map((message) => {
    if (!message.content || typeof message.content !== "string") {
      return message;
    }

    return {
      ...message,
      content: replaceTextVariables(message.content, textVariables),
    };
  });
}

export function extractPlaceholderNames(messages: PromptMessage[]): string[] {
  return messages
    .filter(
      (msg): msg is PlaceholderMessage =>
        "type" in msg && msg.type === ChatMessageType.Placeholder,
    )
    .map((msg) => msg.name);
}
