import type { NormalizerContext, ProviderAdapter } from "../types";
import {
  removeNullFields,
  stringifyToolCallArgs,
  stringifyToolResultContent,
  parseMetadata,
} from "../shared/helpers";

function normalizeMessage(msg: any): any {
  if (!msg || typeof msg !== "object") return msg;

  let normalized = removeNullFields(msg);

  // Stringify tool_calls arguments
  if (normalized.tool_calls && Array.isArray(normalized.tool_calls)) {
    normalized.tool_calls = normalized.tool_calls.map(stringifyToolCallArgs);
  }

  // Stringify object content for tool messages
  if (
    normalized.role === "tool" &&
    typeof normalized.content === "object" &&
    !Array.isArray(normalized.content)
  ) {
    normalized.content = stringifyToolResultContent(normalized.content);
  }

  return normalized;
}

function preprocessData(data: unknown): unknown {
  if (!data) return data;

  // Array of messages
  if (Array.isArray(data)) {
    return data.map(normalizeMessage);
  }

  // Object with messages key
  if (typeof data === "object" && "messages" in data) {
    const obj = data as Record<string, unknown>;
    return {
      ...obj,
      messages: Array.isArray(obj.messages)
        ? obj.messages.map(normalizeMessage)
        : obj.messages,
    };
  }

  // Single message
  if (typeof data === "object" && "role" in data) {
    return normalizeMessage(data);
  }

  return data;
}

export const openAIAdapter: ProviderAdapter = {
  id: "openai",

  detect(ctx: NormalizerContext): boolean {
    const meta = parseMetadata(ctx.metadata);

    // LangSmith metadata
    if (meta?.ls_provider === "openai") return true;

    // OpenTelemetry langfuse-sdk (OpenAI auto-instrumentation)
    if (meta?.scope?.name === "langfuse-sdk") return true;

    // Observation name hint
    if (ctx.observationName?.toLowerCase().includes("openai")) return true;

    // Structural: has OpenAI-style tool_calls
    if (
      typeof ctx.metadata === "object" &&
      ctx.metadata !== null &&
      "messages" in ctx.metadata
    ) {
      const messages = (ctx.metadata as any).messages;
      if (Array.isArray(messages)) {
        const hasToolCalls = messages.some(
          (msg: any) =>
            msg.tool_calls &&
            Array.isArray(msg.tool_calls) &&
            msg.tool_calls.some(
              (tc: any) =>
                tc.type === "function" &&
                tc.function &&
                typeof tc.id === "string",
            ),
        );
        if (hasToolCalls) return true;

        // Multimodal content
        const hasMultimodal = messages.some((msg: any) =>
          Array.isArray(msg.content),
        );
        if (hasMultimodal) return true;
      }
    }

    return false;
  },

  preprocess(data: unknown, _kind: "input" | "output", _ctx: NormalizerContext): unknown {
    return preprocessData(data);
  },
};
