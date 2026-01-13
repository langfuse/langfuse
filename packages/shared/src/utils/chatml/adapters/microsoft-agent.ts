import type { NormalizerContext, ProviderAdapter } from "../types";
import {
  parseMetadata,
  getNestedProperty,
  stringifyToolResultContent,
  isRichToolResult,
} from "../helpers";
import { z } from "zod/v4";

/**
 * Detection schemas for Microsoft Agent Framework format
 *
 * Microsoft Agent Framework uses a ChatML-like format with parts arrays:
 * - Messages: {role: "user|assistant|tool", parts: [{type, ...}]}
 * - Tool calls: {type: "tool_call", id: [...], name, arguments}
 * - Tool responses: {type: "tool_call_response", id: [...], response}
 * - Text: {type: "text", content}
 */

// Microsoft Agent message with parts array
const MicrosoftAgentMessageSchema = z.looseObject({
  role: z.enum(["user", "assistant", "tool"]),
  parts: z.array(
    z.looseObject({
      type: z.enum(["text", "tool_call", "tool_call_response"]),
    }),
  ),
});

// Array of Microsoft Agent messages
const MicrosoftAgentMessagesSchema = z.array(MicrosoftAgentMessageSchema);

/**
 * Extract tool calls and text content from parts array
 * Handles: text, tool_call, tool_call_response
 */
function extractFromParts(parts: unknown[]): {
  toolCalls: Array<Record<string, unknown>>;
  text: string;
  toolCallId?: string;
} {
  const toolCalls: Array<Record<string, unknown>> = [];
  const textParts: string[] = [];
  let toolCallId: string | undefined;

  for (const part of parts) {
    if (!part || typeof part !== "object") continue;

    const p = part as Record<string, unknown>;

    // Handle tool_call: {type: "tool_call", id: [...], name, arguments}
    if (p.type === "tool_call") {
      // uses array IDs: ["run_id", "call_id"], we just need the call id,
      let callId = "";
      if (Array.isArray(p.id)) {
        const callIdMatch = p.id.find(
          (id) => typeof id === "string" && id.startsWith("call_"),
        );
        callId = callIdMatch || p.id[p.id.length - 1] || "";
      } else if (typeof p.id === "string") {
        callId = p.id;
      }

      toolCalls.push({
        id: callId,
        name: p.name,
        arguments:
          typeof p.arguments === "string"
            ? p.arguments
            : JSON.stringify(p.arguments ?? {}),
        type: "function",
      });
      continue;
    }

    // Handle text: {type: "text", content}
    if (p.type === "text" && typeof p.content === "string") {
      textParts.push(p.content);
      continue;
    }

    // Handle tool_call_response: {type: "tool_call_response", id: [...], response}
    if (p.type === "tool_call_response") {
      // we just need the call_id, again
      if (Array.isArray(p.id)) {
        const callIdMatch = p.id.find(
          (id) => typeof id === "string" && id.startsWith("call_"),
        );
        toolCallId = callIdMatch || p.id[p.id.length - 1] || "";
      } else if (typeof p.id === "string") {
        toolCallId = p.id;
      }
      textParts.push(stringifyToolResultContent(p.response));
    }
  }

  return {
    toolCalls,
    text: textParts.join(""),
    toolCallId,
  };
}

/**
 * Extract tool definitions from metadata.attributes["gen_ai.tool.definitions"]
 * Microsoft Agent Framework uses OpenAI-style tool definitions
 */
function extractToolDefinitions(tools: unknown): Array<{
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}> {
  if (!Array.isArray(tools)) return [];

  const definitions: Array<{
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  }> = [];

  for (const tool of tools) {
    if (!tool || typeof tool !== "object") continue;
    const t = tool as Record<string, unknown>;

    // Handle OpenAI-style tool definitions: {type: "function", function: {name, description, parameters}}
    // intentionally not imported from openai for separation of concerns
    if (t.type === "function" && t.function && typeof t.function === "object") {
      const func = t.function as Record<string, unknown>;
      const toolDef: Record<string, unknown> = {
        name: func.name || "",
      };
      if (func.description !== null && func.description !== undefined) {
        toolDef.description = func.description;
      }
      if (func.parameters !== null && func.parameters !== undefined) {
        toolDef.parameters = func.parameters;
      }
      definitions.push(
        toolDef as {
          name: string;
          description?: string;
          parameters?: Record<string, unknown>;
        },
      );
    }
  }

  return definitions;
}

// Normalize a single Microsoft Agent message to our ChatML format
function normalizeMicrosoftAgentMessage(msg: unknown): Record<string, unknown> {
  if (!msg || typeof msg !== "object") return {};

  const message = msg as Record<string, unknown>;
  const normalized = { ...message };

  if (normalized.parts && Array.isArray(normalized.parts)) {
    const { toolCalls, text, toolCallId } = extractFromParts(normalized.parts);

    if (toolCalls.length > 0) {
      normalized.tool_calls = toolCalls;
    }

    if (text) {
      normalized.content = text;
    }

    // Set tool_call_id for tool messages (from tool_call_response)
    if (toolCallId && normalized.role === "tool") {
      normalized.tool_call_id = toolCallId;
    }

    // prevent showing in passthrough
    delete normalized.parts;
  }

  // For tool messages with rich object content, spread into message
  // so it goes to json passthrough field → renders as PrettyJsonView.
  // Rich = nested structure OR 3+ keys. Simple <=2 scalar keys.
  if (
    normalized.role === "tool" &&
    typeof normalized.content === "object" &&
    normalized.content !== null &&
    !Array.isArray(normalized.content)
  ) {
    if (isRichToolResult(normalized.content)) {
      // Rich object: spread for table rendering
      const { content, ...rest } = normalized;
      return { ...rest, ...content };
    } else {
      // Simple object: stringify for text rendering
      normalized.content = stringifyToolResultContent(normalized.content);
    }
  }

  return normalized;
}

function normalizeMessages(data: unknown[]): unknown[] {
  return data.map(normalizeMicrosoftAgentMessage);
}

function preprocessData(data: unknown, ctx: NormalizerContext): unknown {
  if (!data) return data;

  if (Array.isArray(data)) {
    const normalized = normalizeMessages(data);

    // extract tool definitions from metadata
    const meta = parseMetadata(ctx.metadata);
    const toolDefinitions = getNestedProperty(
      meta,
      "attributes",
      "gen_ai.tool.definitions",
    );

    if (toolDefinitions) {
      const tools = extractToolDefinitions(toolDefinitions);
      if (tools.length > 0) {
        return normalized.map((msg) => ({
          ...(msg as Record<string, unknown>),
          tools,
        }));
      }
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

  // single message
  if (typeof data === "object" && "role" in data) {
    return normalizeMicrosoftAgentMessage(data);
  }

  return data;
}

export const microsoftAgentAdapter: ProviderAdapter = {
  id: "microsoft-agent",

  detect(ctx: NormalizerContext): boolean {
    const meta = parseMetadata(ctx.metadata);

    // HINTS: Fast checks for explicit Microsoft Agent Framework indicators
    if (ctx.framework === "microsoft-agent") return true;

    const scopeName = getNestedProperty(meta, "scope", "name");
    if (scopeName === "agent_framework") return true;

    const providerName = getNestedProperty(
      meta,
      "attributes",
      "gen_ai.provider.name",
    );
    if (providerName === "microsoft.agent_framework") return true;

    // STRUCTURAL: Schema-based detection on metadata
    if (MicrosoftAgentMessagesSchema.safeParse(ctx.metadata).success)
      return true;

    // Schema-based detection on data (slower, do last)
    if (MicrosoftAgentMessagesSchema.safeParse(ctx.data).success) return true;
    if (MicrosoftAgentMessageSchema.safeParse(ctx.data).success) return true;

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
