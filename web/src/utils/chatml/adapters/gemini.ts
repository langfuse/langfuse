import type { NormalizerContext, ProviderAdapter } from "../types";
import { parseMetadata, stringifyToolResultContent } from "../helpers";

export function isGeminiToolDefinition(msg: unknown): boolean {
  if (!msg || typeof msg !== "object") return false;

  const message = msg as Record<string, unknown>;

  // Gemini tool definitions have:
  // - role: "tool"
  // - content.type: "function"
  // - content.function: {name, description, parameters}
  return (
    message.role === "tool" &&
    typeof message.content === "object" &&
    message.content !== null &&
    !Array.isArray(message.content) &&
    (message.content as Record<string, unknown>).type === "function" &&
    !!(message.content as Record<string, unknown>).function
  );
}

export function extractGeminiToolDefinitions(messages: unknown[]): Array<{
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}> {
  return messages.filter(isGeminiToolDefinition).map((msg) => {
    const message = msg as Record<string, unknown>;
    const func = (message.content as Record<string, unknown>)
      .function as Record<string, unknown>;
    return {
      name: (func.name as string) || "",
      description: (func.description as string) || "",
      parameters: (func.parameters as Record<string, unknown>) || {},
    };
  });
}

function normalizeToolCall(toolCall: unknown): Record<string, unknown> {
  if (!toolCall || typeof toolCall !== "object") return {};

  const tc = toolCall as Record<string, unknown>;

  // is Gemini format?: {name, args, id, type: "tool_call"}
  if (tc.type === "tool_call" && tc.name && "args" in tc) {
    // Convert to our ChatML / OpenAI format: {id, type: "function", function: {name, arguments}}
    return {
      id: tc.id,
      type: "function",
      function: {
        name: tc.name,
        arguments:
          typeof tc.args === "string" ? tc.args : JSON.stringify(tc.args ?? {}),
      },
    };
  }

  return tc;
}

function normalizeGeminiMessage(msg: unknown): Record<string, unknown> {
  if (!msg || typeof msg !== "object") return {};

  const message = msg as Record<string, unknown>;
  const normalized = { ...message };

  if (normalized.tool_calls && Array.isArray(normalized.tool_calls)) {
    normalized.tool_calls = normalized.tool_calls.map(normalizeToolCall);
  }

  // Gemini structured content: content: [{type: "text", text: "..."}]
  // Convert to plain string for ChatML compatibility
  if (Array.isArray(message.content)) {
    const textParts = message.content
      .map((part: unknown) => {
        if (typeof part === "object" && part !== null) {
          const p = part as Record<string, unknown>;
          // Gemini format: {type: "text", text: "..."}
          if (p.type === "text" && typeof p.text === "string") {
            return p.text;
          }
          // Fallback: {text: "..."}
          if (typeof p.text === "string") {
            return p.text;
          }
        }
        // If part is already a string
        if (typeof part === "string") {
          return part;
        }
        return "";
      })
      .filter((text: unknown) => text !== "")
      .join("");

    if (textParts) {
      normalized.content = textParts;
    }
  }

  // Stringify object content for tool result messages, results should be strings in playground
  // NOTE: this will probably change down the line as we introduce structured tool results
  if (
    normalized.role === "tool" &&
    typeof normalized.content === "object" &&
    !Array.isArray(normalized.content) &&
    !isGeminiToolDefinition(msg)
  ) {
    normalized.content = stringifyToolResultContent(normalized.content);
  }

  return normalized;
}

function filterAndNormalizeMessages(data: unknown[]): unknown[] {
  return data
    .filter((msg) => !isGeminiToolDefinition(msg))
    .map(normalizeGeminiMessage);
}

function preprocessData(data: unknown): unknown {
  if (!data) return data;

  // Array of messages - filter tool definitions and normalize content
  if (Array.isArray(data)) {
    return filterAndNormalizeMessages(data);
  }

  // Object with messages key
  if (typeof data === "object" && "messages" in data) {
    const obj = data as Record<string, unknown>;
    return {
      ...obj,
      messages: Array.isArray(obj.messages)
        ? filterAndNormalizeMessages(obj.messages)
        : obj.messages,
    };
  }

  return data;
}

export const geminiAdapter: ProviderAdapter = {
  id: "gemini",

  detect(ctx: NormalizerContext): boolean {
    const meta = parseMetadata(ctx.metadata);

    // Explicit framework override
    if (ctx.framework === "gemini") return true;

    // LangSmith metadata for Google VertexAI
    if (meta?.ls_provider === "google_vertexai") return true;

    // Observation name hint
    if (ctx.observationName?.toLowerCase().includes("gemini")) return true;
    if (ctx.observationName?.toLowerCase().includes("vertex")) return true;

    // Structural: check if data contains Gemini tool definition messages
    // This is a last-resort detection for unlabeled Gemini traces
    if (
      typeof ctx.metadata === "object" &&
      ctx.metadata !== null &&
      "messages" in ctx.metadata
    ) {
      const messages = (ctx.metadata as Record<string, unknown>).messages;
      if (Array.isArray(messages)) {
        const hasGeminiTools = messages.some(isGeminiToolDefinition);
        if (hasGeminiTools) return true;
      }
    }

    return false;
  },

  preprocess(
    data: unknown,
    _kind: "input" | "output",
    _ctx: NormalizerContext,
  ): unknown {
    return preprocessData(data);
  },
};
