import type { NormalizerContext, ProviderAdapter } from "../types";
import {
  removeNullFields,
  stringifyToolCallArgs,
  stringifyToolResultContent,
  parseMetadata,
} from "../helpers";

function normalizeMessage(msg: unknown): Record<string, unknown> {
  if (!msg || typeof msg !== "object") return {};

  let normalized = removeNullFields(msg);

  // Stringify tool_calls arguments
  if (normalized.tool_calls && Array.isArray(normalized.tool_calls)) {
    normalized.tool_calls = (
      normalized.tool_calls as Record<string, unknown>[]
    ).map(stringifyToolCallArgs);
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

    // Explicit rejection: LangGraph/LangChain traces
    if (meta && typeof meta === "object") {
      if (
        "langgraph_step" in meta ||
        "langgraph_node" in meta ||
        "langgraph_path" in meta ||
        meta.framework === "langgraph" ||
        (Array.isArray(meta.tags) && meta.tags.includes("langgraph"))
      ) {
        return false;
      }
    }

    // Reject if messages have LangChain structure (type without role)
    if (
      typeof ctx.metadata === "object" &&
      ctx.metadata !== null &&
      "messages" in ctx.metadata
    ) {
      const messages = (ctx.metadata as Record<string, unknown>).messages;
      if (Array.isArray(messages)) {
        const hasLangChainType = messages.some((msg: unknown) => {
          const message = msg as Record<string, unknown>;
          return (
            message.type &&
            typeof message.type === "string" &&
            ["human", "ai", "tool", "system"].includes(message.type) &&
            !("role" in message)
          );
        });
        if (hasLangChainType) return false;
      }
    }

    // Explicit framework override
    if (ctx.framework === "openai") return true;

    // LangSmith metadata
    if (meta?.ls_provider === "openai") return true;

    // Observation name hint
    if (ctx.observationName?.toLowerCase().includes("openai")) return true;

    // Structural: has OpenAI-style messages with role
    if (
      typeof ctx.metadata === "object" &&
      ctx.metadata !== null &&
      "messages" in ctx.metadata
    ) {
      const messages = (ctx.metadata as Record<string, unknown>).messages;
      if (Array.isArray(messages)) {
        const hasRole = messages.some((msg: unknown) => {
          const message = msg as Record<string, unknown>;
          return (
            message.role &&
            typeof message.role === "string" &&
            ["system", "user", "assistant", "tool", "function"].includes(
              message.role,
            )
          );
        });
        if (hasRole) return true;

        // OpenAI-style tool_calls at top level
        const hasToolCalls = messages.some((msg: unknown) => {
          const message = msg as Record<string, unknown>;
          return (
            message.tool_calls &&
            Array.isArray(message.tool_calls) &&
            message.tool_calls.some((tc: unknown) => {
              const call = tc as Record<string, unknown>;
              return (
                call.type === "function" &&
                call.function &&
                typeof call.function === "object" &&
                typeof (call.function as Record<string, unknown>).name ===
                  "string"
              );
            })
          );
        });
        if (hasToolCalls) return true;

        // OpenAI multimodal content with specific types
        const hasMultimodal = messages.some((msg: unknown) => {
          const message = msg as Record<string, unknown>;
          return (
            Array.isArray(message.content) &&
            message.content.some((part: unknown) => {
              if (typeof part !== "object" || !part) return false;
              const p = part as Record<string, unknown>;
              return (
                typeof p.type === "string" &&
                ["text", "image_url", "input_audio"].includes(p.type)
              );
            })
          );
        });
        if (hasMultimodal) return true;
      }
    }

    // OpenAI output format with choices
    if (
      typeof ctx.metadata === "object" &&
      ctx.metadata !== null &&
      "choices" in ctx.metadata
    ) {
      return true;
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
