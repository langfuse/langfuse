/* eslint-disable @typescript-eslint/no-use-before-define */
import type { z } from "zod";
import type { ChatMlMessageSchema } from "@/src/components/schemas/ChatMlSchema";
import type { combineInputOutputMessages } from "@/src/utils/chatml";
import type { IOPreviewContentMode } from "@/src/features/traces/components/IOPreview/IOPreview";

export type ChatMlMessage = z.infer<typeof ChatMlMessageSchema>;

/**
 * Get display title for a message based on name or role.
 */
export function getMessageTitle(message: ChatMlMessage): string {
  return message.name ?? message.role ?? "";
}

/**
 * Check if message has renderable content (text or audio).
 */
export function hasRenderableContent(message: ChatMlMessage): boolean {
  const hasContent = message.content != null && message.content !== "";
  return hasContent || !!message.audio;
}

/**
 * Check if message has additional data beyond role and content.
 *
 * Values, not keys: the ChatML transform materializes every schema key, so a
 * key-presence check is true for even an empty message — which rendered as a
 * table of `undefined` rows (LFE-14815).
 */
export function hasAdditionalData(message: ChatMlMessage): boolean {
  return Object.entries(message).some(
    ([key, value]) =>
      key !== "role" && key !== "content" && value !== undefined,
  );
}

/**
 * The message without its unset keys — the transform above materializes all ten
 * whether or not they were sent, and a table of the raw object renders one
 * `undefined` row each.
 */
export function withoutUnsetFields(
  message: ChatMlMessage,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(message).filter(([, value]) => value !== undefined),
  );
}

/**
 * Check if message has passthrough JSON data.
 */
export function hasPassthroughJson(message: ChatMlMessage): boolean {
  return message.json != null;
}

/**
 * Check if message is a placeholder type.
 */
export function isPlaceholderMessage(message: ChatMlMessage): boolean {
  return message.type === "placeholder";
}

/**
 * Check if message only has JSON (no valid ChatML content).
 * Message parsed as ChatML but only has json field (non-ChatML object).
 * Valid ChatML needs content OR tool_calls OR audio (role alone is insufficient).
 */
export function isOnlyJsonMessage(message: ChatMlMessage): boolean {
  const hasValidChatMlContent =
    message.content != null ||
    message.tool_calls != null ||
    message.audio != null;
  return !hasValidChatMlContent && message.json != null;
}

/**
 * Check if message should be rendered (has content, audio, additional data, or is placeholder).
 */
export function shouldRenderMessage(message: ChatMlMessage): boolean {
  return (
    hasRenderableContent(message) ||
    hasAdditionalData(message) ||
    isPlaceholderMessage(message)
  );
}

export function shouldRenderMessageForContentMode(
  message: ChatMlMessage,
  contentMode: IOPreviewContentMode,
  showSystemPrompt?: boolean,
): boolean {
  const shouldShowSystemPrompt =
    showSystemPrompt ?? contentMode !== "conversation";

  if (message.role === "system" && !shouldShowSystemPrompt) return false;

  if (contentMode === "all") return shouldRenderMessage(message);

  return (
    (message.role === "user" ||
      message.role === "assistant" ||
      message.role === "system") &&
    (hasRenderableContent(message) ||
      hasThinkingContent(message) ||
      hasRedactedThinkingContent(message))
  );
}

export function hasRenderableConversationMessages(
  messages: ChatMlMessage[],
  showSystemPrompt?: boolean,
): boolean {
  return messages.some((message) =>
    shouldRenderMessageForContentMode(
      message,
      "conversation",
      showSystemPrompt,
    ),
  );
}

/**
 * Parse tool calls from a ChatML message.
 * Handles both standard tool_calls array and passthrough json.tool_calls.
 */
export function parseToolCallsFromMessage(
  message: ReturnType<typeof combineInputOutputMessages>[0],
): unknown[] {
  if (message.tool_calls && Array.isArray(message.tool_calls)) {
    return message.tool_calls;
  }
  if (message.json?.tool_calls && Array.isArray(message.json?.tool_calls)) {
    return message.json.tool_calls;
  }
  return [];
}

/**
 * Check if message has thinking content.
 */
export function hasThinkingContent(message: ChatMlMessage): boolean {
  return Array.isArray(message.thinking) && message.thinking.length > 0;
}

/**
 * Check if message has redacted thinking content.
 */
export function hasRedactedThinkingContent(message: ChatMlMessage): boolean {
  return (
    Array.isArray(message.redacted_thinking) &&
    message.redacted_thinking.length > 0
  );
}

/**
 * Check if a raw value looks like a chat message or collection of chat messages.
 */
export function isExplicitChatMessage(value: unknown): boolean {
  if (value == null) return false;

  if (Array.isArray(value)) {
    return (
      value.length > 0 &&
      value.some(
        (item) =>
          typeof item === "object" &&
          item !== null &&
          ("role" in item || "tool_calls" in item || "toolCalls" in item),
      )
    );
  }

  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.messages)) {
      return isExplicitChatMessage(record.messages);
    }
    if ("role" in record && typeof record.role === "string") {
      return ["system", "user", "assistant", "tool"].includes(
        record.role.toLowerCase(),
      );
    }
  }

  return false;
}

/**
 * Determine if the input side of an observation represents a chat conversation/messages.
 */
export function isInputChat({
  input,
  messages,
  inputMessageCount,
}: {
  input?: unknown;
  messages?: ChatMlMessage[];
  inputMessageCount?: number;
}): boolean {
  if ((inputMessageCount ?? 0) > 1) {
    return true;
  }

  if (messages && messages.length > 0) {
    const inputMessages = messages.slice(0, inputMessageCount ?? 0);
    if (
      inputMessages.some(
        (m) =>
          m.role === "assistant" ||
          m.role === "system" ||
          m.role === "tool" ||
          (m.tool_calls && m.tool_calls.length > 0),
      )
    ) {
      return true;
    }
  }

  return isExplicitChatMessage(input);
}

/**
 * Determine if the output side of an observation represents chat messages.
 */
export function isOutputChat({
  output,
  messages,
  inputMessageCount,
}: {
  output?: unknown;
  messages?: ChatMlMessage[];
  inputMessageCount?: number;
}): boolean {
  const outputMessages = (messages ?? []).slice(inputMessageCount ?? 0);
  if (outputMessages.length > 1) {
    return true;
  }

  if (outputMessages.some((m) => m.tool_calls && m.tool_calls.length > 0)) {
    return true;
  }

  return isExplicitChatMessage(output);
}

/**
 * Determine if an observation's I/O represents a chat conversation
 * (as opposed to non-chat JSON or plain string I/O).
 */
export function isChatConversation({
  input,
  output,
  messages,
  inputMessageCount,
}: {
  input?: unknown;
  output?: unknown;
  messages?: ChatMlMessage[];
  inputMessageCount?: number;
}): boolean {
  return (
    isInputChat({ input, messages, inputMessageCount }) ||
    isOutputChat({ output, messages, inputMessageCount })
  );
}
