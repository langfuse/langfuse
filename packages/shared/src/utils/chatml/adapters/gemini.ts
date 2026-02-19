import type { NormalizerContext, ProviderAdapter } from "../types";
import {
  parseMetadata,
  stringifyToolResultContent,
  isRichToolResult,
} from "../helpers";
import { z } from "zod/v4";

/**
 * Detection schemas for Gemini/VertexAI formats
 *
 * Two main format families (inner structure is identical):
 * 1. Raw Gemini API (Vertex): {candidates: [{content: {parts, role}}]}
 * 2. Google ADK: {content: {parts, role}} or {config, contents: [{parts, role}]}
 */

// Raw Gemini API response: {candidates: [{content: {...}}]}
const GeminiRawAPISchema = z.looseObject({
  candidates: z.array(
    z.looseObject({
      content: z.looseObject({
        parts: z.array(z.any()).optional(),
        role: z.string().optional(),
      }),
    }),
  ),
});

// ADK output format: {content: {parts: [...], role: "..."}}
const GeminiADKOutputSchema = z.looseObject({
  content: z.looseObject({
    parts: z.array(z.any()),
    role: z.string(),
  }),
});

// ADK input format: {config: {tools, system_instruction}, contents: [...]}
const GeminiADKInputSchema = z.looseObject({
  config: z.looseObject({
    tools: z.array(z.any()).optional(),
    system_instruction: z.string().optional(),
  }),
  contents: z.array(z.any()),
});

// Simple request format: {contents: [{parts: [...], role: "..."}]}
const GeminiRequestSchema = z.looseObject({
  contents: z.array(
    z.looseObject({
      parts: z.array(z.any()),
      role: z.string().optional(),
    }),
  ),
});

/**
 * Case-insensitive field accessor
 * Handles both snake_case and camelCase (e.g., function_call OR functionCall)
 */
function getField(obj: unknown, snakeName: string, camelName: string): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  const o = obj as Record<string, unknown>;
  return o[snakeName] ?? o[camelName];
}

// Note: Gemini tools come from config.tools with function_declarations, not from messages
// The format {role: "tool", content: {type: "function"}} is LangGraph, handled by langgraph adapter

/**
 * Thinking part structure for Gemini
 */
type ThinkingPart = {
  content: string;
};

/**
 * Extract tool calls, text, and thinking from parts array
 * Handles: function_call/functionCall, text, function_response/functionResponse, thought
 * snake_case is from python SDK while camelCase is from JavaScript SDK / REST
 * Gemini indicates thinking with `thought: true` flag on text parts
 */
function extractFromParts(parts: unknown[]): {
  toolCalls: Array<Record<string, unknown>>;
  thinkingParts: ThinkingPart[];
  text: string;
} {
  const toolCalls: Array<Record<string, unknown>> = [];
  const thinkingParts: ThinkingPart[] = [];
  const textParts: string[] = [];

  for (const part of parts) {
    if (typeof part === "string") {
      textParts.push(part);
      continue;
    }
    if (!part || typeof part !== "object") continue;

    const p = part as Record<string, unknown>;

    // Check for function_call OR functionCall (case-insensitive)
    const fc = getField(p, "function_call", "functionCall");
    if (fc && typeof fc === "object") {
      const functionCall = fc as Record<string, unknown>;
      toolCalls.push({
        id: functionCall.id || "",
        name: functionCall.name,
        arguments:
          typeof functionCall.args === "string"
            ? functionCall.args
            : JSON.stringify(functionCall.args ?? {}),
        type: "function",
      });
      continue;
    }

    // {text: "..."} or {type: "text", text: "..."}
    // text can be a string (normal response) or an object (when responseMimeType: "application/json")
    // Check for thought flag (Gemini thinking indicator)
    if (p.text !== undefined && p.text !== null) {
      const textContent =
        typeof p.text === "string" ? p.text : JSON.stringify(p.text, null, 2);

      // Gemini uses `thought: true` flag to indicate thinking content
      if (p.thought === true) {
        thinkingParts.push({ content: textContent });
      } else {
        textParts.push(textContent);
      }
      continue;
    }

    // {function_response: {name, response}} OR {functionResponse: {name, response}}
    const fr = getField(p, "function_response", "functionResponse");
    if (fr && typeof fr === "object") {
      const functionResponse = fr as Record<string, unknown>;
      textParts.push(JSON.stringify(functionResponse.response || {}));
    }
  }

  return {
    toolCalls,
    thinkingParts,
    text: textParts.join(""),
  };
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
    if (!tool || typeof tool !== "object") continue;
    const t = tool as Record<string, unknown>;

    // Check for function_declarations OR functionDeclarations
    const fd = getField(t, "function_declarations", "functionDeclarations");
    if (fd && Array.isArray(fd)) {
      for (const decl of fd as Array<Record<string, unknown>>) {
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

// normalize a single Gemini message to ChatML format
function normalizeGeminiMessage(msg: unknown): Record<string, unknown> {
  if (!msg || typeof msg !== "object") return {};

  const message = msg as Record<string, unknown>;
  let normalized = { ...message };

  // convert Gemini "model" role → "assistant"
  // if (message.role === "model") {
  //   normalized.role = "assistant";
  // }

  // handle direct tool call message format
  // {type: "tool_call", name: "...", args: {...}} → {role: "assistant", tool_calls: [...]}
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

    const { type: _type, name: _name, args: _args, ...rest } = normalized;
    normalized = {
      ...rest,
      role: rest.role || "assistant",
      tool_calls: [toolCall],
    };
  }

  // normalize existing tool_calls array
  if (normalized.tool_calls && Array.isArray(normalized.tool_calls)) {
    normalized.tool_calls = normalized.tool_calls.map((tc) => {
      if (!tc || typeof tc !== "object") return {};
      const toolCall = tc as Record<string, unknown>;

      // Convert Gemini format {type: "tool_call", name, args} → flat format
      if (toolCall.type === "tool_call" && "args" in toolCall) {
        return {
          id: toolCall.id || "",
          name: toolCall.name,
          arguments:
            typeof toolCall.args === "string"
              ? toolCall.args
              : JSON.stringify(toolCall.args ?? {}),
          type: "function",
        };
      }

      return toolCall;
    });
  }

  // process top-level parts array
  // Gemini format: {parts: [{function_call/text/function_response}], role: "..."}
  if (normalized.parts && Array.isArray(normalized.parts)) {
    const { toolCalls, thinkingParts, text } = extractFromParts(
      normalized.parts,
    );
    if (toolCalls.length > 0) {
      normalized.tool_calls = toolCalls;
    }
    if (thinkingParts.length > 0) {
      normalized.thinking = thinkingParts.map((t) => ({
        type: "thinking" as const,
        content: t.content,
      }));
    }
    if (text) {
      normalized.content = text;
    }
    // Remove parts to avoid showing in passthrough (regardless of content)
    delete normalized.parts;
  }

  // process nested content.parts[]
  // Gemini format: {content: {parts: [{function_call: {...}}], role: "model"}}
  if (
    normalized.content &&
    typeof normalized.content === "object" &&
    !Array.isArray(normalized.content) &&
    "parts" in normalized.content
  ) {
    const content = normalized.content as Record<string, unknown>;
    if (Array.isArray(content.parts)) {
      const { toolCalls, thinkingParts } = extractFromParts(content.parts);
      if (toolCalls.length > 0) {
        normalized.tool_calls = toolCalls;
      }
      if (thinkingParts.length > 0) {
        normalized.thinking = thinkingParts.map((t) => ({
          type: "thinking" as const,
          content: t.content,
        }));
      }

      // Extract role if nested
      if (content.role && typeof content.role === "string") {
        normalized.role = content.role;
      }
    }
  }

  // process content as array (structured content format)
  // Gemini format: {content: [{type: "text", text: "..."}]}
  if (Array.isArray(normalized.content)) {
    const { text, thinkingParts } = extractFromParts(normalized.content);
    if (text) {
      normalized.content = text;
    }
    if (thinkingParts.length > 0) {
      normalized.thinking = thinkingParts.map((t) => ({
        type: "thinking" as const,
        content: t.content,
      }));
    }
  }

  // For tool messages with rich object content, spread into message
  // so it goes to json passthrough field and renders as PrettyJsonView.
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

// normalize messages
function normalizeMessages(data: unknown[]): unknown[] {
  return data.map(normalizeGeminiMessage);
}

// unwrap outer wrappers first then normalize inner structure
function preprocessData(data: unknown): unknown {
  if (!data) return data;

  // ========================================
  // STEP 1: Unwrap Raw Gemini API format
  // ========================================
  // {candidates: [{content: {parts, role}}]} → {parts, role, ...otherFields}
  if (GeminiRawAPISchema.safeParse(data).success) {
    const obj = data as Record<string, unknown>;
    const candidates = obj.candidates as Array<Record<string, unknown>>;
    if (candidates[0]?.content) {
      // Unwrap: merge first candidate's content with other top-level fields
      const { candidates: _candidates, ...otherFields } = obj;
      return normalizeGeminiMessage({
        ...candidates[0].content,
        ...otherFields,
      });
    }
  }

  // ========================================
  // STEP 2: Unwrap ADK output format
  // ========================================
  // {content: {parts, role}, finish_reason: "..."} → {parts, role, finish_reason: "..."}
  if (GeminiADKOutputSchema.safeParse(data).success) {
    const obj = data as Record<string, unknown>;
    const content = obj.content as Record<string, unknown>;
    if ("parts" in content && Array.isArray(content.parts)) {
      const { content: _content, ...otherFields } = obj;
      return normalizeGeminiMessage({ ...content, ...otherFields });
    }
  }

  // ========================================
  // STEP 3: Handle ADK input format
  // ========================================
  // {config: {tools, system_instruction}, contents: [...]}
  if (GeminiADKInputSchema.safeParse(data).success) {
    const obj = data as Record<string, unknown>;
    const config = obj.config as Record<string, unknown> | undefined;
    const contents = obj.contents;

    if (config && Array.isArray(contents)) {
      const messages: unknown[] = [];

      // Extract system_instruction from config and prepend as system message
      const systemInstruction = getField(
        config,
        "system_instruction",
        "systemInstruction",
      );
      if (systemInstruction && typeof systemInstruction === "string") {
        messages.push({
          role: "system",
          content: systemInstruction,
        });
      }

      messages.push(...contents);

      // Extract and attach tools if present
      if ("tools" in config && Array.isArray(config.tools)) {
        const extractedTools = extractToolDeclarations(config.tools);

        if (extractedTools.length > 0) {
          return normalizeMessages(messages).map((msg) => ({
            ...(msg as Record<string, unknown>),
            tools: extractedTools,
          }));
        }
      }

      // No tools, just normalize messages
      return normalizeMessages(messages);
    }
  }

  // ========================================
  // STEP 4: Handle simple request format
  // ========================================
  // {contents: [{parts, role}], model: "..."}
  if (GeminiRequestSchema.safeParse(data).success) {
    const obj = data as Record<string, unknown>;
    return normalizeMessages(obj.contents as unknown[]);
  }

  // ========================================
  // STEP 5: Handle arrays
  // ========================================
  if (Array.isArray(data)) {
    return normalizeMessages(data);
  }

  // ========================================
  // STEP 6: Handle messages wrapper
  // ========================================
  if (typeof data === "object" && "messages" in data) {
    const obj = data as Record<string, unknown>;
    return {
      ...obj,
      messages: Array.isArray(obj.messages)
        ? normalizeMessages(obj.messages)
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

    // STRUCTURAL: Schema-based detection on metadata (check metadata first for performance)
    if (GeminiRequestSchema.safeParse(ctx.metadata).success) return true;
    if (GeminiADKInputSchema.safeParse(ctx.metadata).success) return true;
    if (GeminiRawAPISchema.safeParse(ctx.metadata).success) return true;
    if (GeminiADKOutputSchema.safeParse(ctx.metadata).success) return true;

    // Schema-based detection on data (slower, do last)
    if (GeminiRequestSchema.safeParse(ctx.data).success) return true;
    if (GeminiADKInputSchema.safeParse(ctx.data).success) return true;
    if (GeminiRawAPISchema.safeParse(ctx.data).success) return true;
    if (GeminiADKOutputSchema.safeParse(ctx.data).success) return true;

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
