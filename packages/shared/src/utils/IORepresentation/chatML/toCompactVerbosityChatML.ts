import { SimpleChatMlArraySchema } from "./types";

/**
 * Extracts a preview string from ChatML-formatted IO data.
 * Returns the last message's content or null if not ChatML.
 *
 * Detection order (first match wins):
 * 1. Direct array: [{role, content}, ...]
 * 2. Single message object: {role, content} → return content directly
 * 3. Object with 'messages' key: {messages: [...]}
 * 4. Otherwise: null
 *
 * Supports AI SDK v7 messages with { role, parts } format by falling back
 * to parts when content is not present or is null.
 *
 * @param io - The input or output data to extract compact representation from
 * @returns Compact string representation or null if no data
 */
function contentOrParts(
  content: unknown,
  obj: Record<string, unknown>,
): string | null {
  return (
    (content != null ? JSON.stringify(content) : undefined) ??
    JSON.stringify(obj.parts) ??
    null
  );
}

export function toCompactVerbosityChatML(io: unknown): {
  success: boolean;
  data: string | null;
} {
  try {
    if (!io) return { success: false, data: null };

    // Case 1: Direct array
    if (Array.isArray(io)) {
      const parsed = SimpleChatMlArraySchema.safeParse(io);
      if (parsed.success && parsed.data.length > 0) {
        const lastMessage = parsed.data[parsed.data.length - 1];
        return {
          success: true,
          data: contentOrParts(
            lastMessage.content,
            lastMessage as Record<string, unknown>,
          ),
        };
      }
      return { success: false, data: null };
    }

    // Case 2: Single message object with role+content or role+parts
    if (io && typeof io === "object" && !Array.isArray(io)) {
      const obj = io as Record<string, unknown>;

      if ("role" in obj && typeof obj.role === "string") {
        if ("content" in obj && obj.content !== undefined) {
          return {
            success: true,
            data: contentOrParts(obj.content, obj),
          };
        }
        if ("parts" in obj && Array.isArray(obj.parts)) {
          return { success: true, data: JSON.stringify(obj.parts) ?? null };
        }
      }

      // Case 3: Object with 'messages' key
      if ("messages" in obj && Array.isArray(obj.messages)) {
        const messages = obj.messages;
        const parsed = SimpleChatMlArraySchema.safeParse(messages);
        if (parsed.success && parsed.data.length > 0) {
          const lastMessage = parsed.data[parsed.data.length - 1];
          return {
            success: true,
            data: contentOrParts(
              lastMessage.content,
              lastMessage as Record<string, unknown>,
            ),
          };
        }
      }
    }

    return { success: false, data: null };
  } catch {
    // Schema validation can throw on malformed data (e.g., invalid media references in transforms)
    return { success: false, data: null };
  }
}
