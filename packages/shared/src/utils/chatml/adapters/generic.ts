import type { NormalizerContext, ProviderAdapter } from "../types";

function normalizeGoogleMessage(msg: unknown): Record<string, unknown> {
  if (!msg || typeof msg !== "object") return {};

  const message = msg as Record<string, unknown>;
  let normalized = { ...message };

  // Google/Gemini: "model" role → "assistant"
  if (message.role === "model") {
    normalized.role = "assistant";
  }

  // Google/Gemini/Microsoft Agent: "parts" field → "content" field
  if (message.parts && Array.isArray(message.parts)) {
    // Check if parts contain function_call, function_response, or Microsoft Agent tool calls
    const hasFunctionCall = message.parts.some((p: unknown) => {
      // Null guard: ensure p exists and is an object before accessing properties
      if (!p || typeof p !== "object") {
        return false;
      }
      const part = p as Record<string, unknown>;
      return part.function_call || part.type === "tool_call";
    });
    const hasFunctionResponse = message.parts.some((p: unknown) => {
      // Null guard: ensure p exists and is an object before accessing properties
      if (!p || typeof p !== "object") {
        return false;
      }
      const part = p as Record<string, unknown>;
      return part.function_response || part.type === "tool_call_response";
    });

    if (hasFunctionCall || hasFunctionResponse) {
      // Keep parts as structured content array
      normalized.content = message.parts;
    } else {
      // Extract text from parts
      const content = message.parts
        .map((part: unknown) => {
          if (typeof part === "object" && part !== null) {
            const p = part as Record<string, unknown>;
            // Support both Google's "text" and Microsoft's "content" fields
            if (p.text) {
              return p.text;
            }
            if (p.content && typeof p.content === "string") {
              return p.content;
            }
          }
          // Only stringify if it's actually a simple value, not an object
          if (typeof part === "string" || typeof part === "number") {
            return String(part);
          }
          return "";
        })
        .filter((text: unknown) => text !== "")
        .join("");
      normalized.content = content;
    }
    delete normalized.parts;
  }

  return normalized;
}

function preprocessData(data: unknown): unknown {
  if (!data) return data;

  // Handle Google output format: {candidates: [{content: {parts, role}}]}
  if (
    typeof data === "object" &&
    "candidates" in data &&
    Array.isArray((data as Record<string, unknown>).candidates)
  ) {
    const obj = data as Record<string, unknown>;
    const candidate = (obj.candidates as Record<string, unknown>[])[0];
    if (candidate?.content) {
      return normalizeGoogleMessage(candidate.content);
    }
  }

  // Handle Google input format: {model: "...", contents: [...]} or {contents: "string"}
  if (typeof data === "object" && "contents" in data && !("messages" in data)) {
    const obj = data as Record<string, unknown>;
    const contents = obj.contents;
    const messages: Record<string, unknown>[] = [];

    // Handle system_instruction if present
    const config = obj.config as Record<string, unknown> | undefined;
    if (config?.system_instruction) {
      messages.push({
        role: "system",
        content: config.system_instruction,
      });
    }

    // Convert contents to ChatML format
    if (typeof contents === "string") {
      messages.push({ role: "user", content: contents });
    } else if (Array.isArray(contents)) {
      messages.push(...contents.map(normalizeGoogleMessage));
    }

    return messages.length > 0 ? messages : data;
  }

  // Array of messages
  if (Array.isArray(data)) {
    // Handle nested array format: [[ChatML...]]
    if (data.length === 1 && Array.isArray(data[0])) {
      return data[0].map(normalizeGoogleMessage);
    }
    return data.map(normalizeGoogleMessage);
  }

  // Object with messages key
  if (typeof data === "object" && "messages" in data) {
    const obj = data as Record<string, unknown>;
    let messages = obj.messages;

    // Handle double-stringified messages: { messages: "[{...}]" }
    // ClickHouse can store the array as a string due to double-stringification
    if (typeof messages === "string") {
      try {
        messages = JSON.parse(messages);
      } catch {
        // Keep as string if parse fails
      }
    }

    return {
      ...obj,
      messages: Array.isArray(messages)
        ? messages.map(normalizeGoogleMessage)
        : messages,
    };
  }

  // Single message
  if (typeof data === "object" && ("role" in data || "parts" in data)) {
    return normalizeGoogleMessage(data);
  }

  return data;
}

export const genericAdapter: ProviderAdapter = {
  id: "generic",

  detect(_ctx: NormalizerContext): boolean {
    return true; // fallback
  },

  preprocess(
    data: unknown,
    _kind: "input" | "output",
    _ctx: NormalizerContext,
  ): unknown {
    return preprocessData(data);
  },
};
