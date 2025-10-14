import type { NormalizerContext, ProviderAdapter } from "../types";
import {
  removeNullFields,
  // stringifyToolCallArgs,
  stringifyToolResultContent,
  parseMetadata,
} from "../helpers";

function normalizeMessage(msg: unknown): Record<string, unknown> {
  if (!msg || typeof msg !== "object") return {};

  let normalized = removeNullFields(msg);

  // LangGraph/LangChain: "type" field → "role" field
  if (normalized.type && !normalized.role) {
    const typeToRole: Record<string, string> = {
      human: "user",
      ai: "assistant",
      tool: "tool",
      system: "system",
    };
    const type = String(normalized.type);
    if (typeToRole[type]) {
      normalized.role = typeToRole[type];
      normalized._originalType = type;
    }
  }

  // LangGraph: tool_calls in additional_kwargs → top level
  if (
    normalized.additional_kwargs &&
    typeof normalized.additional_kwargs === "object"
  ) {
    const additionalKwargs = normalized.additional_kwargs as Record<
      string,
      unknown
    >;
    if (additionalKwargs.tool_calls && !normalized.tool_calls) {
      normalized.tool_calls = additionalKwargs.tool_calls;
    }
  }

  // Stringify tool_calls arguments
  // if (normalized.tool_calls && Array.isArray(normalized.tool_calls)) {
  //   normalized.tool_calls = (
  //     normalized.tool_calls as Record<string, unknown>[]
  //   ).map(stringifyToolCallArgs);
  // }

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
  if (typeof data === "object" && ("role" in data || "type" in data)) {
    return normalizeMessage(data);
  }

  return data;
}

export const langgraphAdapter: ProviderAdapter = {
  id: "langgraph",

  detect(ctx: NormalizerContext): boolean {
    const meta = parseMetadata(ctx.metadata);

    if (ctx.framework === "langgraph") return true;

    // Check for LangGraph-specific metadata
    if (meta && typeof meta === "object") {
      if (
        "langgraph_step" in meta ||
        "langgraph_node" in meta ||
        "langgraph_path" in meta ||
        "langgraph_checkpoint_ns" in meta
      ) {
        return true;
      }

      if (meta.framework === "langgraph") return true;

      if (Array.isArray(meta.tags) && meta.tags.includes("langgraph")) {
        return true;
      }
    }

    // Check for LangChain/LangGraph message structure
    if (
      typeof ctx.metadata === "object" &&
      ctx.metadata !== null &&
      "messages" in ctx.metadata
    ) {
      const messages = (ctx.metadata as Record<string, unknown>).messages;
      if (Array.isArray(messages) && messages.length > 0) {
        const hasLangChainStructure = messages.some((msg: unknown) => {
          const message = msg as Record<string, unknown>;
          // LangChain type field without role
          if (
            message.type &&
            typeof message.type === "string" &&
            ["human", "ai", "tool", "system"].includes(message.type) &&
            !("role" in message)
          ) {
            return true;
          }
          // LangChain tool_calls in additional_kwargs
          if (
            message.additional_kwargs &&
            typeof message.additional_kwargs === "object"
          ) {
            const kwargs = message.additional_kwargs as Record<string, unknown>;
            if (kwargs.tool_calls) return true;
          }
          return false;
        });
        if (hasLangChainStructure) return true;
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
