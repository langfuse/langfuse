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
 * @param io - The input or output data to extract compact representation from
 * @returns Compact string representation or null if no data
 */
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
        const lastMessage = parsed.data[parsed.data.length - 1] as Record<
          string,
          unknown
        >;
        const displayValue =
          lastMessage.content !== undefined && lastMessage.content !== null
            ? lastMessage.content
            : lastMessage.parts;
        return {
          success: true,
          data: displayValue !== undefined ? JSON.stringify(displayValue) : null,
        };
      }
      return { success: false, data: null };
    }

    // Case 2: Single message object with role+content or role+parts
    if (io && typeof io === "object" && !Array.isArray(io)) {
      const obj = io as Record<string, unknown>;

      // Check for direct role+content/parts structure (e.g. GenAI semantic-convention shape)
      if ("role" in obj && typeof obj.role === "string") {
        if ("content" in obj && obj.content !== undefined) {
          return { success: true, data: JSON.stringify(obj.content) ?? null };
        }
        if ("parts" in obj && obj.parts !== undefined) {
          return { success: true, data: JSON.stringify(obj.parts) };
        }
      }

      // Case 3: Object with 'messages' key
      if ("messages" in obj && Array.isArray(obj.messages)) {
        const messages = obj.messages;
        const parsed = SimpleChatMlArraySchema.safeParse(messages);
        if (parsed.success && parsed.data.length > 0) {
          const lastMessage = parsed.data[parsed.data.length - 1] as Record<
            string,
            unknown
          >;
          const displayValue =
            lastMessage.content !== undefined && lastMessage.content !== null
              ? lastMessage.content
              : lastMessage.parts;
          return {
            success: true,
            data:
              displayValue !== undefined ? JSON.stringify(displayValue) : null,
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
