import type { NormalizerContext, ProviderAdapter } from "../types";
import {
  removeNullFields,
  stringifyToolResultContent,
  parseMetadata,
} from "../helpers";
import { z } from "zod/v4";

/**
 * Detection schemas for LangChain/LangGraph formats
 * These are permissive - only validate structural markers
 */

// LangChain message with type field (no role)
const LangChainMessageSchema = z.array(
  z.looseObject({
    type: z.enum(["human", "ai", "tool", "system"]),
    content: z.any(),
  }),
);

// LangGraph message with additional_kwargs
const LangGraphMessageSchema = z
  .array(
    z.looseObject({
      role: z.string().optional(),
      additional_kwargs: z
        .looseObject({
          tool_calls: z.array(z.any()).optional(),
        })
        .optional(),
    }),
  )
  .refine(
    (data) => {
      // Reject if any message has top-level parts (Microsoft Agent/Gemini format)
      return !data.some(
        (msg) =>
          typeof msg === "object" &&
          msg !== null &&
          "parts" in msg &&
          Array.isArray((msg as Record<string, unknown>).parts),
      );
    },
    { message: "Messages with top-level parts are not LangGraph format" },
  );

// Wrapped messages format
const LangGraphWrappedSchema = z.looseObject({
  messages: z.array(z.any()),
});

/**
 * Detect if a message is a tool definition (not a tool result)
 * LangGraph format: {role: "tool", content: {type: "function", function: {...}}}
 * Tool results have tool_call_id, tool definitions do not
 */
function isLangGraphToolDefinition(msg: unknown): boolean {
  if (!msg || typeof msg !== "object") return false;

  const message = msg as Record<string, unknown>;

  return (
    message.role === "tool" &&
    typeof message.content === "object" &&
    message.content !== null &&
    !Array.isArray(message.content) &&
    (message.content as Record<string, unknown>).type === "function" &&
    !!(message.content as Record<string, unknown>).function &&
    !message.tool_call_id // Tool definitions don't have tool_call_id
  );
}

/**
 * Extract tool definitions from messages array
 */
function extractToolDefinitions(messages: unknown[]): Array<{
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}> {
  return messages.filter(isLangGraphToolDefinition).map((msg) => {
    const message = msg as Record<string, unknown>;
    const func = (message.content as Record<string, unknown>)
      .function as Record<string, unknown>;

    const toolDef: Record<string, unknown> = {
      name: (func.name as string) || "",
    };
    if (func.description !== null && func.description !== undefined) {
      toolDef.description = func.description;
    }
    if (func.parameters !== null && func.parameters !== undefined) {
      toolDef.parameters = func.parameters;
    }

    return toolDef as {
      name: string;
      description?: string;
      parameters?: Record<string, unknown>;
    };
  });
}

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

    // Extract tool_calls if present
    if (additionalKwargs.tool_calls && !normalized.tool_calls) {
      normalized.tool_calls = additionalKwargs.tool_calls;
      // IMPORTANT: Create NEW additional_kwargs without tool_calls to prevent
      // ChatMlSchema from overwriting our flattened version when it spreads additional_kwargs
      // Don't mutate original object - JSON view needs to show original data
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { tool_calls: _removed, ...restKwargs } = additionalKwargs;
      normalized.additional_kwargs = restKwargs;
    }

    // Keep other fields in additional_kwargs (including null values) for JSON view
    // ChatMlSchema will spread these into passthrough json field
  }

  // Flatten nested tool_calls format to flat ChatML format
  // LangGraph can have OpenAI-style nested format: {id, type, function: {name, arguments}}
  // Convert to flat format: {id, name, arguments, type}
  if (normalized.tool_calls && Array.isArray(normalized.tool_calls)) {
    normalized.tool_calls = (
      normalized.tool_calls as Record<string, unknown>[]
    ).map((tc) => {
      // If nested format (has function.name), flatten it
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
          ...(tc.index !== undefined ? { index: tc.index } : {}),
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

  // Stringify object/array content for tool messages
  if (
    normalized.role === "tool" &&
    typeof normalized.content === "object" &&
    normalized.content !== null
  ) {
    normalized.content = stringifyToolResultContent(normalized.content);
  }

  return normalized;
}

/**
 * Filter out tool definitions and normalize remaining messages
 */
function filterAndNormalizeMessages(data: unknown[]): unknown[] {
  return data
    .filter((msg) => !isLangGraphToolDefinition(msg))
    .map(normalizeMessage);
}

function preprocessData(data: unknown): unknown {
  if (!data) return data;

  // Array of messages
  if (Array.isArray(data)) {
    const extractedTools = extractToolDefinitions(data);
    const normalizedMessages = filterAndNormalizeMessages(data);

    if (extractedTools.length > 0) {
      // Attach tools to all messages
      return normalizedMessages.map((msg) => ({
        ...(msg as Record<string, unknown>),
        tools: extractedTools,
      }));
    }

    return normalizedMessages;
  }

  // Object with messages key
  if (typeof data === "object" && "messages" in data) {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.messages)) {
      const extractedTools = extractToolDefinitions(obj.messages);
      const normalizedMessages = filterAndNormalizeMessages(obj.messages);

      if (extractedTools.length > 0) {
        return {
          ...obj,
          messages: normalizedMessages.map((msg) => ({
            ...(msg as Record<string, unknown>),
            tools: extractedTools,
          })),
        };
      }

      return {
        ...obj,
        messages: normalizedMessages,
      };
    }
  }

  // Single message - wrap in array for consistency
  if (typeof data === "object" && ("role" in data || "type" in data)) {
    return [normalizeMessage(data)];
  }

  return data;
}

export const langgraphAdapter: ProviderAdapter = {
  id: "langgraph",

  detect(ctx: NormalizerContext): boolean {
    const meta = parseMetadata(ctx.metadata);

    // EXPLICIT: Framework hint
    if (ctx.framework === "langgraph") return true;

    // HINTS: LangGraph-specific metadata markers
    if (meta && typeof meta === "object") {
      if (
        "langgraph_step" in meta ||
        "langgraph_node" in meta ||
        "langgraph_path" in meta ||
        "langgraph_checkpoint_ns" in meta ||
        meta.framework === "langgraph" ||
        (Array.isArray(meta.tags) && meta.tags.includes("langgraph"))
      ) {
        return true;
      }
    }

    // STRUCTURAL: Schema-based detection on metadata
    if (LangChainMessageSchema.safeParse(ctx.metadata).success) return true;
    if (LangGraphMessageSchema.safeParse(ctx.metadata).success) return true;

    // Check wrapped messages format
    if (LangGraphWrappedSchema.safeParse(ctx.metadata).success) {
      const wrapped = ctx.metadata as { messages: unknown[] };
      if (LangChainMessageSchema.safeParse(wrapped.messages).success)
        return true;
      if (LangGraphMessageSchema.safeParse(wrapped.messages).success)
        return true;
    }

    // finally Schema-based detection on data b/c of performance
    if (LangChainMessageSchema.safeParse(ctx.data).success) return true;
    if (LangGraphMessageSchema.safeParse(ctx.data).success) return true;

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
