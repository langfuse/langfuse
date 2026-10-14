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

// Keys under which providers nest their conversation (OpenAI `messages` /
// Responses `input` / `choices`, Gemini `contents` / `candidates`, AI SDK
// `prompt`, LangChain `generations`, choice/candidate wrappers).
const CHAT_CONTAINER_KEYS = [
  "messages",
  "input",
  "output",
  "contents",
  "candidates",
  "content",
  "choices",
  "message",
  "prompt",
  "generations",
];

// Message-type markers that stand in for a role (LangChain dict messages,
// OpenAI Responses items).
const CHAT_TYPE_MARKERS = new Set([
  "human",
  "ai",
  "system",
  "tool",
  "user",
  "assistant",
  "message",
]);

/**
 * Whether a raw observation input/output is a chat conversation: a message
 * object with a `role`, or a provider container holding one, within a few
 * levels. Plain strings, function arguments and loose records are not, and
 * the preview labels them by side instead of by role.
 */
export function hasChatRoles(value: unknown, depth = 3): boolean {
  if (depth < 0) return false;
  if (typeof value === "string") {
    const trimmed = value.trimStart();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
    try {
      return hasChatRoles(JSON.parse(value), depth);
    } catch {
      return false;
    }
  }
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) {
    return value.some((item) => hasChatRoles(item, depth - 1));
  }
  const record = value as Record<string, unknown>;
  if (typeof record.role === "string") return true;
  if (typeof record.type === "string" && CHAT_TYPE_MARKERS.has(record.type)) {
    return true;
  }
  // LangChain serialized message envelope.
  if (record.lc !== undefined && typeof record.kwargs === "object") return true;
  return CHAT_CONTAINER_KEYS.some(
    (key) => key in record && hasChatRoles(record[key], depth - 1),
  );
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
