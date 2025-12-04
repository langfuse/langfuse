import type { NormalizerContext, ProviderAdapter } from "../types";
import { removeNullFields, parseMetadata, getNestedProperty } from "../helpers";
import { z } from "zod/v4";

/**
 * Pydantic AI adapter
 * Handles pydantic-ai's parts-based message format
 */

// Detection schema
const PydanticAIMessagesSchema = z.array(
  z.looseObject({
    role: z.enum(["system", "user", "assistant"]),
    parts: z.array(z.any()),
  }),
);

/**
 * Extract tool definitions from pydantic-ai metadata
 * Tools are in: metadata.attributes.model_request_parameters.function_tools
 */
function extractToolsFromMetadata(
  metadata: unknown,
): Record<string, unknown>[] | undefined {
  const meta = parseMetadata(metadata);
  if (!meta) return undefined;

  const tools = getNestedProperty(
    meta,
    "attributes",
    "model_request_parameters",
    "function_tools",
  );

  if (Array.isArray(tools)) {
    return tools.map(normalizeTool);
  }

  return undefined;
}

/**
 * Normalize pydantic-ai tool definition to standard format
 */
function normalizeTool(tool: unknown): Record<string, unknown> {
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
 * Normalize a single pydantic-ai message
 * Returns either a single message or array of messages (for tool responses)
 */
function normalizeMessage(
  msg: unknown,
  tools?: Record<string, unknown>[],
): Record<string, unknown> | Record<string, unknown>[] {
  if (!msg || typeof msg !== "object") return {};

  const message = msg as Record<string, unknown>;

  // If no parts, return as-is
  const parts = message.parts;
  if (!Array.isArray(parts)) {
    return removeNullFields(message);
  }

  // Separate parts by type
  const textParts: unknown[] = [];
  const toolCallParts: unknown[] = [];
  const toolResponseParts: unknown[] = [];

  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const p = part as Record<string, unknown>;

    if (p.type === "text") {
      textParts.push(p);
    } else if (p.type === "tool_call") {
      toolCallParts.push(p);
    } else if (p.type === "tool_call_response") {
      toolResponseParts.push(p);
    }
  }

  // Handle assistant message with tool calls
  if (message.role === "assistant" && toolCallParts.length > 0) {
    const normalized: Record<string, unknown> = {
      role: "assistant",
      content:
        textParts.length > 0
          ? ((textParts[0] as Record<string, unknown>).content as string)
          : "",
      tool_calls: toolCallParts.map((tc) => {
        const call = tc as Record<string, unknown>;
        return {
          id: call.id,
          name: call.name,
          arguments:
            typeof call.arguments === "string"
              ? call.arguments
              : JSON.stringify(call.arguments ?? {}),
          type: "function",
        };
      }),
    };

    if (tools) {
      normalized.tools = tools;
    }

    // Add any extra fields (like finish_reason)
    const { role: _role, parts: _parts, ...rest } = message;
    return removeNullFields({ ...normalized, ...rest });
  }

  // Handle user message with tool responses - split into separate tool messages
  if (message.role === "user" && toolResponseParts.length > 0) {
    return toolResponseParts.map((tr) => {
      const response = tr as Record<string, unknown>;
      return removeNullFields({
        role: "tool",
        tool_call_id: response.id,
        content:
          typeof response.result === "string"
            ? response.result
            : JSON.stringify(response.result ?? ""),
        ...(tools ? { tools } : {}),
      });
    });
  }

  // Handle regular text message (system, user, assistant without tool calls)
  const normalized: Record<string, unknown> = {
    role: message.role,
    content:
      textParts.length > 0
        ? ((textParts[0] as Record<string, unknown>).content as string)
        : "",
  };

  if (tools) {
    normalized.tools = tools;
  }

  const { role: _role, parts: _parts, ...rest } = message;
  return removeNullFields({ ...normalized, ...rest });
}

/**
 * Preprocess pydantic-ai data
 */
function preprocessData(data: unknown, ctx: NormalizerContext): unknown {
  if (!data) return data;

  // Extract tools from metadata
  const tools = extractToolsFromMetadata(ctx.metadata);

  // Handle array of messages
  if (Array.isArray(data)) {
    const result: Record<string, unknown>[] = [];
    for (const msg of data) {
      const normalized = normalizeMessage(msg, tools);
      if (Array.isArray(normalized)) {
        result.push(...normalized);
      } else {
        result.push(normalized);
      }
    }
    return result;
  }

  // Single message
  return normalizeMessage(data, tools);
}

export const pydanticAIAdapter: ProviderAdapter = {
  id: "pydantic-ai",

  detect(ctx: NormalizerContext): boolean {
    const meta = parseMetadata(ctx.metadata);

    // Check for pydantic-ai scope in metadata
    if (meta && typeof meta === "object") {
      // Check scope.name === "pydantic-ai"
      const scope = getNestedProperty(meta, "scope");
      if (
        scope &&
        typeof scope === "object" &&
        (scope as Record<string, unknown>).name === "pydantic-ai"
      ) {
        return true;
      }
    }

    // Check for parts-based message structure
    if (PydanticAIMessagesSchema.safeParse(ctx.data).success) {
      return true;
    }
    if (PydanticAIMessagesSchema.safeParse(ctx.metadata).success) {
      return true;
    }

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
