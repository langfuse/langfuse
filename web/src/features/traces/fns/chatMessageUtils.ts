import type { combineInputOutputMessages } from "@/src/utils/chatml";
import type { IOPreviewContentMode } from "@/src/features/traces/components/IOPreview/IOPreview";
import type { ChatMlMessage } from "@/src/features/traces/hooks/useChatMLParser";

export type { ChatMlMessage };

/**
 * Get display title for a message based on name or role. A message whose
 * role is only the side default is not a chat turn: title it by side. The
 * default role encodes the side (input → user, output → assistant), so the
 * title holds however inputs and outputs interleave.
 */
export function getMessageTitle(message: ChatMlMessage): string {
  if (message.roleInferred) {
    return message.role === "assistant" ? "Output" : "Input";
  }
  return message.name ?? message.role ?? "";
}

/** Presentation flags are not message data. */
const PRESENTATION_KEYS = new Set(["role", "content", "roleInferred"]);

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
    ([key, value]) => !PRESENTATION_KEYS.has(key) && value !== undefined,
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
    Object.entries(message).filter(
      ([key, value]) => key !== "roleInferred" && value !== undefined,
    ),
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
