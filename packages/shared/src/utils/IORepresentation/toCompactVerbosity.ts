import { toCompactVerbosityChatML } from "./chatML/toCompactVerbosityChatML";

/**
 * Normalize OTel GenAI `{role, parts}` messages to `{role, content}` format.
 *
 * The OpenTelemetry GenAI semantic conventions define messages as:
 *   { role: "assistant", parts: [{ type: "text", content: "..." }] }
 *
 * AI SDK v7 emits this format. Langfuse's compact extraction expects
 * `{role, content}`. This function bridges the gap by extracting text
 * content from `parts` when `content` is absent.
 *
 * Handles three input shapes:
 * - Direct array: [{role, parts}, ...]
 * - Single message: {role, parts}
 * - Messages wrapper: {messages: [{role, parts}, ...]}
 *
 * @see https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/registry/attributes/gen-ai.md
 * @see https://ai-sdk.dev/v7/docs/reference/ai-sdk-core/ui-message
 */
function normalizeOtelGenAiMessages(io: unknown): unknown {
  if (!io || typeof io !== "object") return io;

  const normalizeMessage = (msg: Record<string, unknown>): Record<string, unknown> => {
    // Only normalize if: has `parts`, does NOT have `content`, parts is an array
    if (
      !("content" in msg) &&
      "parts" in msg &&
      Array.isArray(msg.parts) &&
      msg.parts.length > 0
    ) {
      // Extract text content from parts (OTel GenAI format)
      const textContent = (msg.parts as Array<Record<string, unknown>>)
        .filter(
          (p) =>
            p &&
            typeof p === "object" &&
            p.type === "text" &&
            typeof p.content === "string",
        )
        .map((p) => p.content as string);

      if (textContent.length > 0) {
        return { ...msg, content: textContent.join("") };
      }
    }
    return msg;
  };

  // Case 1: Direct array of messages
  if (Array.isArray(io)) {
    return io.map((item) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? normalizeMessage(item as Record<string, unknown>)
        : item,
    );
  }

  // Case 2: Messages wrapper {messages: [...]}
  if ("messages" in io && Array.isArray(io.messages)) {
    return {
      ...io,
      messages: io.messages.map((item: unknown) =>
        item && typeof item === "object" && !Array.isArray(item)
          ? normalizeMessage(item as Record<string, unknown>)
          : item,
      ),
    };
  }

  // Case 3: Single message object — handled by normalizeMessage if it has parts
  if ("role" in io && typeof (io as Record<string, unknown>).role === "string") {
    return normalizeMessage(io as Record<string, unknown>);
  }

  return io;
}

/**
 * Returns a compact representation of IO data for display in tables.
 * Strategy: Normalize OTel GenAI parts → content, then try ChatML extraction.
 *
 * @param io - The input or output data to compact
 * @returns Compact representation or null if no data
 */
export function toCompactVerbosity(io: unknown): {
  success: boolean;
  data: string | null;
} {
  if (io === undefined || io === null) return { success: false, data: null };

  // Parse stringified JSON if needed
  let parsedIO = io;
  if (typeof io === "string") {
    try {
      parsedIO = JSON.parse(io);
    } catch {
      // Continue with original input
    }
  }

  // Normalize OTel GenAI {role, parts} → {role, content}
  const normalized = normalizeOtelGenAiMessages(parsedIO);

  // Try ChatML compact representation extraction
  const chatMLCompact = toCompactVerbosityChatML(normalized);
  if (chatMLCompact.success) {
    return { success: true, data: chatMLCompact.data };
  }

  return { success: false, data: null };
}
