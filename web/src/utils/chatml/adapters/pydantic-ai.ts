import type { NormalizerContext, ProviderAdapter } from "../types";
import { removeNullFields, parseMetadata, getNestedProperty } from "../helpers";
import { z } from "zod/v4";

/**
 * Pydantic AI adapter
 * Handles pydantic-ai's parts-based message format
 *
 * Pydantic AI uses parts arrays:
 * - Text: {type: "text", content: "..."}
 * - Tool calls: {type: "tool_call", id, name, arguments}
 * - Tool responses: {type: "tool_call_response", id, name, result}
 * Tools are in: metadata.attributes.model_request_parameters.function_tools
 */

// Detection schema
const PydanticAIMessagesSchema = z.array(
  z.looseObject({
    role: z.enum(["system", "user", "assistant"]),
    parts: z.array(z.any()),
  }),
);

/**
 * Extract tool calls, text, and tool responses from parts array
 */
function extractFromParts(parts: unknown[]): {
  toolCalls: Array<Record<string, unknown>>;
  toolResponses: Array<Record<string, unknown>>;
  text: string;
} {
  const toolCalls: Array<Record<string, unknown>> = [];
  const toolResponses: Array<Record<string, unknown>> = [];
  const textParts: string[] = [];

  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const p = part as Record<string, unknown>;

    if (p.type === "text" && typeof p.content === "string") {
      textParts.push(p.content);
    } else if (p.type === "tool_call") {
      toolCalls.push({
        id: p.id,
        name: p.name,
        arguments:
          typeof p.arguments === "string"
            ? p.arguments
            : JSON.stringify(p.arguments ?? {}),
        type: "function",
      });
    } else if (p.type === "tool_call_response") {
      toolResponses.push({
        tool_call_id: p.id,
        content:
          typeof p.result === "string"
            ? p.result
            : JSON.stringify(p.result ?? ""),
      });
    }
  }

  return { toolCalls, toolResponses, text: textParts.join("") };
}

/**
 * Normalize pydantic-ai tool definition to standard format
 */
function normalizeToolDefinition(tool: unknown): Record<string, unknown> {
  if (!tool || typeof tool !== "object") return {};

  const t = tool as Record<string, unknown>;
  const normalized: Record<string, unknown> = {
    name: t.name,
    description: t.description || "",
  };

  // pydantic-ai uses parameters_json_schema instead of parameters
  if (t.parameters_json_schema) {
    normalized.parameters = t.parameters_json_schema;
  }

  return normalized;
}

/**
 * Extract tool definitions from pydantic-ai metadata
 * Tools are in: metadata.attributes.model_request_parameters.function_tools
 */
function extractToolDefinitions(
  metadata: unknown,
): Array<Record<string, unknown>> {
  const meta = parseMetadata(metadata);
  if (!meta) return [];

  const tools = getNestedProperty(
    meta,
    "attributes",
    "model_request_parameters",
    "function_tools",
  );

  if (Array.isArray(tools)) {
    return tools.map(normalizeToolDefinition);
  }

  return [];
}

/**
 * Normalize a single pydantic-ai message
 * Returns either a single message or array of messages (for tool responses)
 */
function normalizeMessage(
  msg: unknown,
): Record<string, unknown> | Record<string, unknown>[] {
  if (!msg || typeof msg !== "object") return {};

  const message = msg as Record<string, unknown>;

  // If no parts, return as-is
  if (!Array.isArray(message.parts)) {
    return removeNullFields(message);
  }

  const { toolCalls, toolResponses, text } = extractFromParts(message.parts);

  // Extract other fields (exclude role and parts)
  const { role: _role, parts: _parts, ...rest } = message;

  // Assistant message with tool calls
  if (message.role === "assistant" && toolCalls.length > 0) {
    return removeNullFields({
      role: "assistant",
      content: text || "",
      tool_calls: toolCalls,
      ...rest,
    });
  }

  // User message with tool responses - split into separate tool messages
  if (message.role === "user" && toolResponses.length > 0) {
    return toolResponses.map((tr) =>
      removeNullFields({
        role: "tool",
        ...tr,
      }),
    );
  }

  // Regular text message
  return removeNullFields({
    role: message.role,
    content: text || "",
    ...rest,
  });
}

// flattening any split messages
function normalizeMessages(data: unknown[]): unknown[] {
  const result: Record<string, unknown>[] = [];
  for (const msg of data) {
    const normalized = normalizeMessage(msg);
    if (Array.isArray(normalized)) {
      result.push(...normalized);
    } else {
      result.push(normalized);
    }
  }
  return result;
}

function preprocessData(data: unknown, ctx: NormalizerContext): unknown {
  if (!data) return data;

  // Handle array of messages
  if (Array.isArray(data)) {
    const normalized = normalizeMessages(data);

    // Extract and attach tool definitions from metadata
    const tools = extractToolDefinitions(ctx.metadata);
    if (tools.length > 0) {
      return normalized.map((msg) => ({
        ...(msg as Record<string, unknown>),
        tools,
      }));
    }

    return normalized;
  }

  // messages wrapper
  if (typeof data === "object" && "messages" in data) {
    const obj = data as Record<string, unknown>;
    return {
      ...obj,
      messages: Array.isArray(obj.messages)
        ? normalizeMessages(obj.messages)
        : obj.messages,
    };
  }

  // Single message
  return normalizeMessage(data);
}

export const pydanticAIAdapter: ProviderAdapter = {
  id: "pydantic-ai",

  detect(ctx: NormalizerContext): boolean {
    const meta = parseMetadata(ctx.metadata);

    if (ctx.framework === "pydantic-ai") return true;

    const scopeName = getNestedProperty(meta, "scope", "name");
    if (scopeName === "pydantic-ai") return true;

    // STRUCTURAL: Schema-based detection on metadata (check metadata first for performance)
    if (PydanticAIMessagesSchema.safeParse(ctx.metadata).success) return true;

    // Schema-based detection on data (slower, do last)
    if (PydanticAIMessagesSchema.safeParse(ctx.data).success) return true;

    return false;
  },

  preprocess(
    data: unknown,
    _kind: "input" | "output",
    ctx: NormalizerContext,
  ): unknown {
    return preprocessData(data, ctx);
  },
};
