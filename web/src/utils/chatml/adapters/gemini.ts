import type { NormalizerContext, ProviderAdapter } from "../types";
import { parseMetadata, stringifyToolResultContent } from "../helpers";
import { z } from "zod/v4";

/**
 * Detection schemas for Gemini/VertexAI formats
 * These are permissive - only validate structural markers
 */

// Gemini generateContent request: {contents: [{parts: [...], role: "..."}]}
const GeminiRequestSchema = z.looseObject({
  contents: z.array(
    z.looseObject({
      parts: z.array(z.any()),
      role: z.string().optional(),
    }),
  ),
});

// Google ADK format: {config: {tools: [...]}, contents: [...]}
const GeminiADKSchema = z.looseObject({
  config: z.looseObject({
    tools: z.array(z.any()),
  }),
  contents: z.array(z.any()),
});

// Gemini response with candidates: {candidates: [{content: {...}}]}
const GeminiResponseSchema = z.looseObject({
  candidates: z.array(
    z.looseObject({
      content: z.looseObject({
        parts: z.array(z.any()).optional(),
        role: z.string().optional(),
      }),
    }),
  ),
});

// Gemini output format (unwrapped): {content: {parts: [...], role: "..."}}
const GeminiOutputSchema = z.looseObject({
  content: z.looseObject({
    parts: z.array(z.any()),
    role: z.string(),
  }),
});

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
  // Convert to flat ChatML format: {id, name, arguments, type}
  if (tc.type === "tool_call" && tc.name && "args" in tc) {
    return {
      id: tc.id || "",
      name: tc.name,
      arguments:
        typeof tc.args === "string" ? tc.args : JSON.stringify(tc.args ?? {}),
      type: "function",
    };
  }

  return tc;
}

// extract tool calls from Gemini parts array
// Handles: {parts: [{function_call: {name, args}}]}
function extractToolCallsFromParts(
  parts: unknown[],
): Array<Record<string, unknown>> {
  const functionCallParts = parts.filter((part: unknown) => {
    return typeof part === "object" && part !== null && "function_call" in part;
  });

  return functionCallParts.map((part: unknown) => {
    const p = part as Record<string, unknown>;
    const fc = p.function_call as Record<string, unknown>;
    return {
      id: fc.id || "",
      name: fc.name,
      arguments:
        typeof fc.args === "string" ? fc.args : JSON.stringify(fc.args ?? {}),
      type: "function",
    };
  });
}

// Handles: {text: "..."}, {type: "text", text: "..."}, {function_response: {...}}
function extractTextFromParts(parts: unknown[]): string {
  return parts
    .map((part: unknown) => {
      if (typeof part === "object" && part !== null) {
        const p = part as Record<string, unknown>;
        // {text: "..."} or {type: "text", text: "..."}
        if (typeof p.text === "string") return p.text;
        // {function_response: {name, response}}
        if (p.function_response && typeof p.function_response === "object") {
          const fr = p.function_response as Record<string, unknown>;
          return JSON.stringify(fr.response || {});
        }
      }
      if (typeof part === "string") return part;
      return "";
    })
    .filter((text: unknown) => text !== "")
    .join("");
}

function normalizeGeminiMessage(msg: unknown): Record<string, unknown> {
  if (!msg || typeof msg !== "object") return {};

  const message = msg as Record<string, unknown>;
  let normalized = { ...message };

  // Convert direct tool call message to tool_calls array format
  // Format: { type: "tool_call", name: "...", args: {...} }
  // Convert to: { role: "assistant", tool_calls: [{ id, name, arguments, type }] }
  if (
    normalized.type === "tool_call" &&
    normalized.name &&
    typeof normalized.name === "string"
  ) {
    const toolCall: Record<string, unknown> = {
      id: normalized.id || "",
      name: normalized.name,
      arguments:
        typeof normalized.args === "string"
          ? normalized.args
          : JSON.stringify(normalized.args ?? {}),
      type: "function",
    };

    // Remove the direct tool call properties and add tool_calls array
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { type: _type, name: _name, args: _args, ...rest } = normalized;
    normalized = {
      ...rest,
      role: rest.role || "assistant",
      tool_calls: [toolCall],
    };
  }

  // Normalize tool_calls array if present
  if (normalized.tool_calls && Array.isArray(normalized.tool_calls)) {
    normalized.tool_calls = normalized.tool_calls.map(normalizeToolCall);
  }

  // Process top-level parts array (Google ADK format)
  // Gemini format: {parts: [{function_call/text/function_response}], role: "..."}
  if (normalized.parts && Array.isArray(normalized.parts)) {
    // Extract tool calls from parts
    const toolCalls = extractToolCallsFromParts(normalized.parts);
    if (toolCalls.length > 0) {
      normalized.tool_calls = toolCalls;
    }

    // Extract text content from parts
    const textContent = extractTextFromParts(normalized.parts);
    if (textContent) {
      normalized.content = textContent;
      // Remove parts field after extracting to avoid showing in passthrough
      delete normalized.parts;
    }
  }

  // Process nested content.parts[] (legacy format)
  // Gemini format: content: {parts: [{function_call: {...}}], role: "model"}
  if (
    normalized.content &&
    typeof normalized.content === "object" &&
    !Array.isArray(normalized.content) &&
    "parts" in normalized.content
  ) {
    const content = normalized.content as Record<string, unknown>;
    if (Array.isArray(content.parts)) {
      const toolCalls = extractToolCallsFromParts(content.parts);
      if (toolCalls.length > 0) {
        normalized.tool_calls = toolCalls;
      }
    }

    // Also extract role if nested
    if (content.role && typeof content.role === "string") {
      normalized.role = content.role;
    }
  }

  // Process content as array (structured content format)
  // Gemini format: content: [{type: "text", text: "..."}]
  if (Array.isArray(normalized.content)) {
    const textContent = extractTextFromParts(normalized.content);
    if (textContent) {
      normalized.content = textContent;
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

/**
 * Extract tool declarations from Google ADK tools array
 * Handles: {function_declarations: [{name, description, parameters}]}
 */
function extractToolDeclarations(tools: unknown[]): Array<{
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}> {
  const declarations: Array<{
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  }> = [];

  for (const tool of tools) {
    if (typeof tool !== "object" || !tool) continue;
    const t = tool as Record<string, unknown>;

    if (
      "function_declarations" in t &&
      Array.isArray(t.function_declarations)
    ) {
      for (const decl of t.function_declarations as Array<
        Record<string, unknown>
      >) {
        const toolDef: Record<string, unknown> = {
          name: (decl.name as string) || "",
        };
        if (decl.description !== null && decl.description !== undefined) {
          toolDef.description = decl.description;
        }
        if (decl.parameters !== null && decl.parameters !== undefined) {
          toolDef.parameters = decl.parameters;
        }
        declarations.push(
          toolDef as {
            name: string;
            description?: string;
            parameters?: Record<string, unknown>;
          },
        );
      }
    }
  }

  return declarations;
}

function preprocessData(data: unknown): unknown {
  if (!data) return data;

  // Gemini output response format: { content: {parts: [...], role: "..."}, finish_reason: "...", ... }
  // Unwrap content to top level for message normalization
  if (
    typeof data === "object" &&
    !Array.isArray(data) &&
    "content" in data &&
    typeof (data as Record<string, unknown>).content === "object" &&
    (data as Record<string, unknown>).content !== null
  ) {
    const obj = data as Record<string, unknown>;
    const content = obj.content as Record<string, unknown>;

    // Check if content has Gemini structure (parts array)
    if ("parts" in content && Array.isArray(content.parts)) {
      // Merge content fields to top level, preserving other fields
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { content: _content, ...rest } = obj;
      return normalizeGeminiMessage({
        ...content,
        ...rest,
      });
    }
  }

  // Google ADK format: { model, config: { tools: [...] }, contents: [...] }
  // Extract tools from config and attach to messages
  if (
    typeof data === "object" &&
    !Array.isArray(data) &&
    "contents" in data &&
    "config" in data
  ) {
    const obj = data as Record<string, unknown>;
    const config = obj.config as Record<string, unknown> | undefined;
    const contents = obj.contents;

    if (config && "tools" in config && Array.isArray(config.tools)) {
      const extractedTools = extractToolDeclarations(config.tools);

      if (extractedTools.length > 0 && Array.isArray(contents)) {
        // Attach tools to all messages
        return filterAndNormalizeMessages(contents).map((msg) => ({
          ...(msg as Record<string, unknown>),
          tools: extractedTools,
        }));
      }
    }

    // Fallback: just return normalized contents
    if (Array.isArray(contents)) {
      return filterAndNormalizeMessages(contents);
    }
  }

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

    // HINTS: Fast checks for explicit Gemini indicators
    if (ctx.framework === "gemini") return true;
    if (ctx.observationName?.toLowerCase().includes("gemini")) return true;
    if (ctx.observationName?.toLowerCase().includes("vertex")) return true;
    if (meta?.ls_provider === "google_vertexai") return true;

    // Metadata attributes check
    if (meta && typeof meta === "object" && "attributes" in meta) {
      const attributes = (meta as Record<string, unknown>).attributes;
      if (
        attributes &&
        typeof attributes === "object" &&
        (attributes as Record<string, unknown>)["gen_ai.system"] ===
          "gcp.vertex.agent"
      ) {
        return true;
      }
    }

    // STRUCTURAL: Schema-based detection on metadata
    if (GeminiRequestSchema.safeParse(ctx.metadata).success) return true;
    if (GeminiADKSchema.safeParse(ctx.metadata).success) return true;
    if (GeminiResponseSchema.safeParse(ctx.metadata).success) return true;
    if (GeminiOutputSchema.safeParse(ctx.metadata).success) return true;

    // Schema-based detection, only do finally because of performance implications
    if (GeminiRequestSchema.safeParse(ctx.data).success) return true;
    if (GeminiADKSchema.safeParse(ctx.data).success) return true;
    if (GeminiResponseSchema.safeParse(ctx.data).success) return true;
    if (GeminiOutputSchema.safeParse(ctx.data).success) return true;

    // Structural: check if data contains Gemini tool definition messages (legacy)
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
