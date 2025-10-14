import type { NormalizerContext, ProviderAdapter } from "../types";

function normalizeGoogleMessage(msg: any): any {
  if (!msg || typeof msg !== "object") return msg;

  let normalized = { ...msg };

  // Google/Gemini: "model" role → "assistant"
  if (msg.role === "model") {
    normalized.role = "assistant";
  }

  // Google/Gemini: "parts" field → "content" field
  if (msg.parts && Array.isArray(msg.parts)) {
    // Check if parts contain function_call or function_response
    const hasFunctionCall = msg.parts.some((p: any) => p.function_call);
    const hasFunctionResponse = msg.parts.some((p: any) => p.function_response);

    if (hasFunctionCall || hasFunctionResponse) {
      // Keep parts as structured content array
      normalized.content = msg.parts;
    } else {
      // Extract text from parts
      const content = msg.parts
        .map((part: any) => {
          if (typeof part === "object" && part.text) {
            return part.text;
          }
          // Only stringify if it's actually a simple value, not an object
          if (typeof part === "string" || typeof part === "number") {
            return String(part);
          }
          return "";
        })
        .filter((text: string) => text !== "")
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
    Array.isArray((data as any).candidates)
  ) {
    const candidate = (data as any).candidates[0];
    if (candidate?.content) {
      return normalizeGoogleMessage(candidate.content);
    }
  }

  // Handle Google input format: {model: "...", contents: [...]} or {contents: "string"}
  if (typeof data === "object" && "contents" in data && !("messages" in data)) {
    const obj = data as any;
    const contents = obj.contents;
    const messages: any[] = [];

    // Handle system_instruction if present
    if (obj.config?.system_instruction) {
      messages.push({
        role: "system",
        content: obj.config.system_instruction,
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
    return {
      ...obj,
      messages: Array.isArray(obj.messages)
        ? obj.messages.map(normalizeGoogleMessage)
        : obj.messages,
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
