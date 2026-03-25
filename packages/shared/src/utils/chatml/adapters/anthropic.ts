import type { NormalizerContext, ProviderAdapter, ToolEvent } from "../types";
import {
  removeNullFields,
  stringifyToolResultContent,
  parseMetadata,
  getNestedProperty,
} from "../helpers";
import { z } from "zod";

/**
 * Anthropic Messages API adapter
 *
 * Handles Anthropic's content-block based message format:
 * - text:              {type: "text", text: "..."}
 * - tool_use:          {type: "tool_use", id, name, input}
 * - tool_result:       {type: "tool_result", tool_use_id, content}
 * - thinking:          {type: "thinking", thinking: "...", signature?: "..."}
 * - redacted_thinking: {type: "redacted_thinking", data: "..."}
 *
 * References:
 * - https://docs.anthropic.com/en/api/messages
 * - https://docs.anthropic.com/en/docs/build-with-claude/tool-use
 * - https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking
 */

// Anthropic content block — must have a `type` field
const AnthropicContentBlockSchema = z.looseObject({
  type: z.enum([
    "text",
    "tool_use",
    "tool_result",
    "thinking",
    "redacted_thinking",
    "image",
    "document",
  ]),
});

// Anthropic Messages API request: {model, messages, ...}
const AnthropicRequestSchema = z.looseObject({
  model: z.string(),
  messages: z.array(z.any()),
});

// Anthropic Messages API response: {role, content, stop_reason|type:"message", ...}
// Requires stop_reason OR type:"message" to distinguish from generic {role, content} messages
const AnthropicResponseSchema = z.looseObject({
  role: z.literal("assistant"),
  content: z.array(AnthropicContentBlockSchema).min(1),
  stop_reason: z.string(),
});

// Anthropic-specific content block (tool_use or tool_result — text alone is too generic)
const AnthropicSpecificBlockSchema = z.looseObject({
  type: z.enum(["tool_use", "tool_result", "thinking", "redacted_thinking"]),
});

// Array of Anthropic messages (at least one with Anthropic-specific content blocks)
const AnthropicMessagesArraySchema = z.array(z.any()).refine((arr) =>
  arr.some((m) => {
    if (!m || typeof m !== "object" || !Array.isArray(m.content)) return false;
    return (m.content as unknown[]).some(
      (b) => AnthropicSpecificBlockSchema.safeParse(b).success,
    );
  }),
);

/**
 * Thinking part structure
 */
type ThinkingPart = {
  content: string;
  signature?: string;
};

/**
 * Redacted thinking part structure
 */
type RedactedThinkingPart = {
  data: string;
};

/**
 * Extract and classify content blocks from an Anthropic content array
 */
function extractFromContent(content: unknown[]): {
  toolUseBlocks: Array<Record<string, unknown>>;
  toolResultBlocks: Array<Record<string, unknown>>;
  thinkingParts: ThinkingPart[];
  redactedThinkingParts: RedactedThinkingPart[];
  text: string;
} {
  const toolUseBlocks: Array<Record<string, unknown>> = [];
  const toolResultBlocks: Array<Record<string, unknown>> = [];
  const thinkingParts: ThinkingPart[] = [];
  const redactedThinkingParts: RedactedThinkingPart[] = [];
  const textParts: string[] = [];

  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;

    switch (b.type) {
      case "text":
        if (typeof b.text === "string") {
          textParts.push(b.text);
        }
        break;
      case "tool_use":
        toolUseBlocks.push(b);
        break;
      case "tool_result":
        toolResultBlocks.push(b);
        break;
      case "thinking": {
        const thinkingContent =
          typeof b.thinking === "string"
            ? b.thinking
            : typeof b.content === "string"
              ? b.content
              : "";
        if (thinkingContent) {
          thinkingParts.push({
            content: thinkingContent,
            signature:
              typeof b.signature === "string" ? b.signature : undefined,
          });
        }
        break;
      }
      case "redacted_thinking":
        if (typeof b.data === "string") {
          redactedThinkingParts.push({ data: b.data });
        }
        break;
    }
  }

  return {
    toolUseBlocks,
    toolResultBlocks,
    thinkingParts,
    redactedThinkingParts,
    text: textParts.join("\n"),
  };
}

/**
 * Normalize Anthropic tool definition to standard format
 * Anthropic uses input_schema instead of parameters
 */
function normalizeToolDefinition(tool: unknown): Record<string, unknown> {
  if (!tool || typeof tool !== "object") return {};

  const t = tool as Record<string, unknown>;
  const normalized: Record<string, unknown> = {
    name: t.name,
    description: t.description || "",
  };

  if (t.input_schema) {
    normalized.parameters = t.input_schema;
  }

  return normalized;
}

/**
 * Normalize a single Anthropic message.
 * Returns either a single message or array of messages (for tool_result splits).
 */
function normalizeMessage(
  msg: unknown,
): Record<string, unknown> | Record<string, unknown>[] {
  if (!msg || typeof msg !== "object") return {};

  const message = msg as Record<string, unknown>;

  // If no array content, return as-is
  if (!Array.isArray(message.content)) {
    return removeNullFields(message);
  }

  const {
    toolUseBlocks,
    toolResultBlocks,
    thinkingParts,
    redactedThinkingParts,
    text,
  } = extractFromContent(message.content as unknown[]);

  // Check if content array had any recognized typed blocks
  const hasTypedBlocks =
    toolUseBlocks.length > 0 ||
    toolResultBlocks.length > 0 ||
    thinkingParts.length > 0 ||
    redactedThinkingParts.length > 0 ||
    text.length > 0;

  // No recognized blocks — return as-is
  if (!hasTypedBlocks) {
    return removeNullFields(message);
  }

  // Build thinking fields if present
  const thinkingFields: Record<string, unknown> = {};
  if (thinkingParts.length > 0) {
    thinkingFields.thinking = thinkingParts.map((t) => ({
      type: "thinking" as const,
      content: t.content,
      ...(t.signature ? { signature: t.signature } : {}),
    }));
  }
  if (redactedThinkingParts.length > 0) {
    thinkingFields.redacted_thinking = redactedThinkingParts.map((t) => ({
      type: "redacted_thinking" as const,
      data: t.data,
    }));
  }

  // Extract other fields (exclude role and content)
  const { role: _role, content: _content, ...rest } = message;

  // Assistant message with tool_use blocks
  if (message.role === "assistant" && toolUseBlocks.length > 0) {
    const toolCalls = toolUseBlocks.map((b) => ({
      id: b.id || "",
      name: b.name || "",
      arguments:
        typeof b.input === "string" ? b.input : JSON.stringify(b.input ?? {}),
      type: "function",
    }));

    return removeNullFields({
      role: "assistant",
      content: text || undefined,
      tool_calls: toolCalls,
      ...thinkingFields,
      ...rest,
    });
  }

  // User message with tool_result blocks — split into separate tool messages
  if (toolResultBlocks.length > 0) {
    return toolResultBlocks.map((tr) =>
      removeNullFields({
        role: "tool",
        tool_call_id: tr.tool_use_id || "",
        content: stringifyToolResultContent(tr.content),
      }),
    );
  }

  // Regular text message (may include thinking for assistant messages)
  return removeNullFields({
    role: message.role,
    content: text || "",
    ...thinkingFields,
    ...rest,
  });
}

function normalizeMessages(data: unknown[]): unknown[] {
  return data.flatMap((msg) => {
    const normalized = normalizeMessage(msg);
    return Array.isArray(normalized) ? normalized : [normalized];
  });
}

function preprocessData(data: unknown, _ctx: NormalizerContext): unknown {
  if (!data) return data;

  // Anthropic Messages API request: {model, messages, tools?, ...}
  if (typeof data === "object" && !Array.isArray(data) && "messages" in data) {
    const obj = data as Record<string, unknown>;
    const normalized = Array.isArray(obj.messages)
      ? normalizeMessages(obj.messages)
      : obj.messages;

    // Extract and attach tool definitions
    if (Array.isArray(obj.tools) && obj.tools.length > 0) {
      const tools = (obj.tools as unknown[]).map(normalizeToolDefinition);
      return (normalized as Record<string, unknown>[]).map((msg) => ({
        ...msg,
        tools,
      }));
    }

    return normalized;
  }

  // Anthropic Messages API response: {role: "assistant", content: [...], stop_reason, ...}
  if (
    typeof data === "object" &&
    !Array.isArray(data) &&
    "content" in data &&
    "role" in data
  ) {
    const normalized = normalizeMessage(data);
    return Array.isArray(normalized) ? normalized : [normalized];
  }

  // Array of messages
  if (Array.isArray(data)) {
    return normalizeMessages(data);
  }

  // Single message
  if (typeof data === "object") {
    const normalized = normalizeMessage(data);
    return Array.isArray(normalized) ? normalized : [normalized];
  }

  return data;
}

export const anthropicAdapter: ProviderAdapter = {
  id: "anthropic",

  detect(ctx: NormalizerContext): boolean {
    // Explicit override
    if (ctx.framework === "anthropic") return true;

    const meta = parseMetadata(ctx.metadata);

    // REJECTIONS: Other frameworks that may use Claude models but have their own adapters
    if (meta && typeof meta === "object") {
      // Pydantic AI
      const scopeName = getNestedProperty(meta, "scope", "name");
      if (scopeName === "pydantic-ai") return false;

      // LangGraph / LangChain / LangSmith
      if (
        scopeName === "langsmith" ||
        "langgraph_step" in meta ||
        "langgraph_node" in meta
      ) {
        return false;
      }

      // Vercel AI SDK
      const aiOperationId = getNestedProperty(
        meta,
        "attributes",
        "ai.operationId",
      );
      if (aiOperationId) return false;

      // Semantic Kernel
      if (
        typeof scopeName === "string" &&
        scopeName.startsWith("Microsoft.SemanticKernel")
      ) {
        return false;
      }

      // Microsoft Agent Framework
      if (scopeName === "agent_framework") return false;
    }

    // HINTS: Observation name
    if (ctx.observationName?.toLowerCase().includes("anthropic")) return true;

    // Metadata attribute hints
    if (meta && typeof meta === "object") {
      const attributes = getNestedProperty(meta, "attributes");
      if (attributes && typeof attributes === "object") {
        const attrs = attributes as Record<string, unknown>;
        if (attrs["gen_ai.system"] === "anthropic") {
          return true;
        }
      }
    }

    // STRUCTURAL: Anthropic Messages API request
    if (AnthropicRequestSchema.safeParse(ctx.metadata).success) {
      const obj = ctx.metadata as Record<string, unknown>;
      if (
        Array.isArray(obj.messages) &&
        AnthropicMessagesArraySchema.safeParse(obj.messages).success
      ) {
        return true;
      }
    }

    // Structural: Anthropic Messages API response
    if (AnthropicResponseSchema.safeParse(ctx.metadata).success) return true;

    // Structural: Array of messages with Anthropic content blocks (on metadata)
    if (AnthropicMessagesArraySchema.safeParse(ctx.metadata).success)
      return true;

    // Structural checks on data (slower, do last)
    if (AnthropicResponseSchema.safeParse(ctx.data).success) return true;
    if (AnthropicMessagesArraySchema.safeParse(ctx.data).success) return true;

    return false;
  },

  preprocess(
    data: unknown,
    _kind: "input" | "output",
    ctx: NormalizerContext,
  ): unknown {
    return preprocessData(data, ctx);
  },

  extractToolEvents(message: Record<string, unknown>): ToolEvent[] {
    if (!Array.isArray(message.content)) return [];

    const events: ToolEvent[] = [];
    for (const block of message.content as unknown[]) {
      if (!block || typeof block !== "object") continue;
      const b = block as Record<string, unknown>;

      if (b.type === "tool_use") {
        events.push({
          type: "call",
          id: String(b.id ?? ""),
          name: String(b.name ?? ""),
          argsJson:
            typeof b.input === "string"
              ? b.input
              : JSON.stringify(b.input ?? {}),
        });
      } else if (b.type === "tool_result") {
        events.push({
          type: "result",
          id: String(b.tool_use_id ?? ""),
          content: stringifyToolResultContent(b.content),
          status:
            b.is_error === true
              ? "error"
              : b.is_error === false
                ? "ok"
                : undefined,
        });
      }
    }

    return events;
  },
};
