import type { NormalizerContext, ProviderAdapter } from "../types";
import {
  removeNullFields,
  stringifyToolResultContent,
  parseMetadata,
} from "../helpers";
import { z } from "zod/v4";

/**
 * Detection schemas for OpenAI formats
 * These are permissive - only validate structural markers, not full API contracts
 */

// INPUT SCHEMAS (requests)
const OpenAIInputChatCompletionsSchema = z
  .object({
    messages: z.array(z.any()),
    tools: z.array(z.any()).optional(),
  })
  .passthrough();

const OpenAIInputMessagesSchema = z.array(
  z
    .object({
      role: z.enum(["system", "user", "assistant", "tool", "function"]),
    })
    .passthrough(),
);

// OUTPUT SCHEMAS (responses)
const OpenAIOutputResponsesSchema = z
  .object({
    output: z.array(z.any()),
    tools: z.array(z.any()).optional(),
  })
  .passthrough();

const OpenAIOutputChoicesSchema = z
  .object({
    choices: z.array(z.any()),
  })
  .passthrough();

const OpenAIOutputSingleMessageSchema = z
  .object({
    role: z.string(),
    tool_calls: z.array(
      z
        .object({
          type: z.string(),
          function: z
            .object({
              name: z.string(),
            })
            .passthrough(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

function normalizeMessage(msg: unknown): Record<string, unknown> {
  if (!msg || typeof msg !== "object") return {};

  let normalized = removeNullFields(msg);

  // Convert direct function call message to tool_calls array format
  // Format: { type: "function_call", name: "...", arguments: {...}, call_id: "..." }
  // Convert to: { role: "assistant", tool_calls: [{ id, name, arguments, type }] }
  if (
    (normalized.type === "function_call" || normalized.type === "tool_call") &&
    normalized.name &&
    typeof normalized.name === "string"
  ) {
    const toolCall: Record<string, unknown> = {
      id: normalized.call_id || normalized.id || "",
      name: normalized.name,
      arguments:
        typeof normalized.arguments === "string"
          ? normalized.arguments
          : JSON.stringify(normalized.arguments ?? {}),
      type: "function",
    };

    // Remove the direct function call properties and add tool_calls array
    /* eslint-disable @typescript-eslint/no-unused-vars */
    const {
      type: _type,
      name: _name,
      arguments: _args,
      call_id: _call_id,
      ...rest
    } = normalized;
    /* eslint-enable @typescript-eslint/no-unused-vars */
    normalized = {
      ...rest,
      role: rest.role || "assistant",
      tool_calls: [toolCall],
    };
  }

  // Flatten OpenAI nested tool_calls format: function.name → name, function.arguments → arguments
  // Format: { id, type: "function", function: { name, arguments } }
  // Convert to: { id, name, arguments, type }
  if (normalized.tool_calls && Array.isArray(normalized.tool_calls)) {
    normalized.tool_calls = (
      normalized.tool_calls as Record<string, unknown>[]
    ).map((tc) => {
      if (tc.function && typeof tc.function === "object") {
        const func = tc.function as Record<string, unknown>;
        return {
          id: tc.id,
          name: func.name,
          arguments:
            typeof func.arguments === "string"
              ? func.arguments
              : JSON.stringify(func.arguments ?? {}),
          type: tc.type || "function",
          index: tc.index,
        };
      }
      // Already flat format, just ensure arguments is stringified
      return {
        ...tc,
        arguments:
          typeof tc.arguments === "string"
            ? tc.arguments
            : JSON.stringify(tc.arguments ?? {}),
      };
    });
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

/**
 * Flatten tool definition from nested or flat format to standard format
 * Handles both Chat Completions {type, function: {name, ...}} and flat {name, ...}
 */
function flattenToolDefinition(tool: unknown): Record<string, unknown> {
  if (typeof tool !== "object" || !tool) return {};

  const t = tool as Record<string, unknown>;
  // Handle nested {type, function: {name, ...}} or flat {name, ...}
  const toolFunc = (t.function as Record<string, unknown> | undefined) ?? t;

  const toolDef: Record<string, unknown> = { name: toolFunc.name };
  if (toolFunc.description != null) toolDef.description = toolFunc.description;
  if (toolFunc.parameters != null) toolDef.parameters = toolFunc.parameters;
  return toolDef;
}

function preprocessData(data: unknown): unknown {
  if (!data) return data;

  // OpenAI Chat Completions API: {tools, messages} OR Responses API: {tools, output}
  // References:
  // - https://platform.openai.com/docs/api-reference/chat/create
  // - https://platform.openai.com/docs/api-reference/responses
  if (
    typeof data === "object" &&
    !Array.isArray(data) &&
    "tools" in data &&
    (("messages" in data && !("output" in data)) || "output" in data)
  ) {
    const obj = data as Record<string, unknown>;
    const messagesArray = (obj.messages ?? obj.output) as unknown[];

    if (Array.isArray(messagesArray) && Array.isArray(obj.tools)) {
      // Attach tools to all messages
      return messagesArray.map((msg) => ({
        ...normalizeMessage(msg),
        tools: (obj.tools as unknown[]).map(flattenToolDefinition),
      }));
    }
  }

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

    // OpenAI Chat Completions API format: { tools: [...], messages: [...] }
    if (
      typeof ctx.metadata === "object" &&
      ctx.metadata !== null &&
      "tools" in ctx.metadata &&
      "messages" in ctx.metadata
    ) {
      const metadata = ctx.metadata as Record<string, unknown>;
      if (Array.isArray(metadata.tools) && Array.isArray(metadata.messages)) {
        return true;
      }
    }

    // OpenAI Responses API format: { tools: [...], output: [...] }
    if (
      typeof ctx.metadata === "object" &&
      ctx.metadata !== null &&
      "tools" in ctx.metadata &&
      "output" in ctx.metadata
    ) {
      const metadata = ctx.metadata as Record<string, unknown>;
      if (Array.isArray(metadata.tools) && Array.isArray(metadata.output)) {
        return true;
      }
    }

    // OpenAI via observation metadata attributes
    if (meta && typeof meta === "object" && "attributes" in meta) {
      const attributes = (meta as Record<string, unknown>).attributes as Record<
        string,
        unknown
      >;
      if (
        attributes &&
        typeof attributes === "object" &&
        attributes["llm.system"] === "openai"
      ) {
        return true;
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

    // LAST RESORT: Structural detection on actual data content (performance!)
    // Check for Chat Completions format: {tools, messages}
    if (
      ctx.data &&
      typeof ctx.data === "object" &&
      !Array.isArray(ctx.data) &&
      "tools" in ctx.data &&
      "messages" in ctx.data
    ) {
      const data = ctx.data as Record<string, unknown>;
      if (Array.isArray(data.tools) && Array.isArray(data.messages)) {
        return true;
      }
    }

    // Check for Responses format: {tools, output}
    if (
      ctx.data &&
      typeof ctx.data === "object" &&
      !Array.isArray(ctx.data) &&
      "tools" in ctx.data &&
      "output" in ctx.data
    ) {
      const data = ctx.data as Record<string, unknown>;
      if (Array.isArray(data.tools) && Array.isArray(data.output)) {
        return true;
      }
    }

    // Check for single message with nested tool_calls
    if (
      ctx.data &&
      typeof ctx.data === "object" &&
      "role" in ctx.data &&
      "tool_calls" in ctx.data
    ) {
      const data = ctx.data as Record<string, unknown>;
      if (Array.isArray(data.tool_calls)) {
        const hasNestedToolCalls = data.tool_calls.some((tc: unknown) => {
          const call = tc as Record<string, unknown>;
          return (
            call.type === "function" &&
            call.function &&
            typeof call.function === "object" &&
            typeof (call.function as Record<string, unknown>).name === "string"
          );
        });
        if (hasNestedToolCalls) {
          return true;
        }
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
