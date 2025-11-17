import type { NormalizerContext, ProviderAdapter } from "../types";
import {
  removeNullFields,
  stringifyToolResultContent,
  parseMetadata,
  isRichToolResult,
} from "../helpers";
import { z } from "zod/v4";

/**
 * Detection schemas for OpenAI formats
 * These are permissive - only validate structural markers, not full API contracts
 */

// INPUT SCHEMAS (requests)
const OpenAIInputChatCompletionsSchema = z.looseObject({
  messages: z.array(z.any()),
  tools: z.array(z.any()).optional(),
});

const OpenAIInputMessagesSchema = z
  .array(
    z.looseObject({
      role: z.enum(["system", "user", "assistant", "tool", "function"]),
    }),
  )
  .refine(
    (data) => {
      // Reject if any message has top-level parts (Microsoft Agent/Gemini format)
      // OpenAI uses parts inside content, not at message level
      return !data.some(
        (msg) =>
          typeof msg === "object" &&
          msg !== null &&
          "parts" in msg &&
          Array.isArray((msg as Record<string, unknown>).parts),
      );
    },
    { message: "Messages with top-level parts are not OpenAI format" },
  );

// OUTPUT SCHEMAS (responses)
const OpenAIOutputResponsesSchema = z.looseObject({
  output: z.array(z.any()),
  tools: z.array(z.any()).optional(),
});

const OpenAIOutputChoicesSchema = z.looseObject({
  model: z.string(),
  choices: z.array(z.any()),
});

const OpenAIOutputSingleMessageSchema = z.looseObject({
  role: z.string(),
  tool_calls: z.array(
    z.looseObject({
      type: z.string(),
      function: z.looseObject({
        name: z.string(),
      }),
    }),
  ),
});

function normalizeMessage(msg: unknown): Record<string, unknown> {
  if (!msg || typeof msg !== "object") return {};

  // we want to do type-based conversions BEFORE removeNullFields
  // because removeNullFields moves unrecognized fields to json passthrough
  let working = msg as Record<string, unknown>;

  // Convert direct function call message to tool_calls array format
  // Format: { type: "function_call", name: "...", arguments: {...}, call_id: "..." }
  // Convert to: { role: "assistant", tool_calls: [{ id, name, arguments, type }] }
  if (
    (working.type === "function_call" || working.type === "tool_call") &&
    working.name &&
    typeof working.name === "string"
  ) {
    const toolCall: Record<string, unknown> = {
      id: working.call_id || working.id || "",
      name: working.name,
      arguments:
        typeof working.arguments === "string"
          ? working.arguments
          : JSON.stringify(working.arguments ?? {}),
      type: "function",
    };

    /* eslint-disable @typescript-eslint/no-unused-vars */
    const {
      type: _type,
      name: _name,
      arguments: _args,
      call_id: _call_id,
      id: _id,
      status: _status,
      ...rest
    } = working;
    /* eslint-enable @typescript-eslint/no-unused-vars */
    working = {
      ...rest,
      role: rest.role || "assistant",
      tool_calls: [toolCall],
    };
  }

  // Convert function_call_output to standard tool message format
  // Format: { type: "function_call_output", call_id: "...", output: "..." }
  // Convert to: { role: "tool", tool_call_id: "...", content: "..." }
  if (working.type === "function_call_output") {
    const content =
      typeof working.output === "string"
        ? working.output
        : JSON.stringify(working.output ?? "");

    /* eslint-disable @typescript-eslint/no-unused-vars */
    const { type: _type, call_id, output: _output, ...rest } = working;
    /* eslint-enable @typescript-eslint/no-unused-vars */

    working = {
      ...rest,
      role: "tool",
      tool_call_id: call_id,
      content,
    };
  }

  // Now apply removeNullFields after conversions
  let normalized = removeNullFields(working);

  // Extract text from OpenAI Agents output_text format
  // Format: content: [{type: "output_text", text: "..."}]
  if (
    normalized.content &&
    Array.isArray(normalized.content) &&
    normalized.content.length > 0
  ) {
    const firstItem = normalized.content[0];
    if (
      firstItem &&
      typeof firstItem === "object" &&
      (firstItem as Record<string, unknown>).type === "output_text" &&
      typeof (firstItem as Record<string, unknown>).text === "string"
    ) {
      // Extract just the text for simple output
      normalized.content = (firstItem as Record<string, unknown>).text;
    }
  }

  // Normalize camelCase toolCalls to snake_case tool_calls (VAPI framework does this, otherwise it matches OpenAI)
  if ("toolCalls" in normalized && Array.isArray(normalized.toolCalls)) {
    normalized.tool_calls = normalized.toolCalls;
    delete normalized.toolCalls;
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

/**
 * Flatten tool definition from nested or flat format to standard format
 * Handles both Chat Completions {type, function: {name, ...}} and flat {name, ...}
 */
function flattenToolDefinition(tool: unknown): Record<string, unknown> {
  if (typeof tool !== "object" || !tool) return {};

  const t = tool as Record<string, unknown>;
  // Handle nested {type, function: {name, ...}} or flat {name, ...}
  const toolFunc = (t.function as Record<string, unknown> | undefined) ?? t;

  const toolDef: Record<string, unknown> = {
    name: toolFunc.name,
    description: toolFunc.description ?? "",
  };
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

  // Responses API without tools: {output: [...]}
  if (
    typeof data === "object" &&
    !Array.isArray(data) &&
    "output" in data &&
    !("messages" in data) &&
    !("tools" in data)
  ) {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.output)) {
      return (obj.output as unknown[]).map(normalizeMessage);
    }
  }

  // Chat Completions response: {choices: [{message: {...}}]}
  if (typeof data === "object" && !Array.isArray(data) && "choices" in data) {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.choices) && obj.choices.length > 0) {
      const firstChoice = obj.choices[0] as Record<string, unknown>;
      if (
        firstChoice &&
        typeof firstChoice === "object" &&
        "message" in firstChoice
      ) {
        return normalizeMessage(firstChoice.message);
      }
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

    // REJECTIONS: Explicit rejection of LangGraph/LangChain formats
    if (meta && typeof meta === "object") {
      // LangGraph
      if (
        "langgraph_step" in meta ||
        "langgraph_node" in meta ||
        "langgraph_path" in meta ||
        meta.framework === "langgraph" ||
        (Array.isArray(meta.tags) && meta.tags.includes("langgraph"))
      ) {
        return false;
      }

      // LangChain (type without role)
      if (
        ctx.metadata &&
        typeof ctx.metadata === "object" &&
        "messages" in ctx.metadata
      ) {
        const messages = (ctx.metadata as Record<string, unknown>).messages;
        if (Array.isArray(messages)) {
          const hasLangChainType = messages.some((msg: unknown) => {
            // Null guard: ensure msg exists and is an object before accessing properties
            if (!msg || typeof msg !== "object") {
              return false;
            }
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
    }

    // HINTS: Fast checks for explicit OpenAI indicators
    if (ctx.framework === "openai") return true;
    if (ctx.observationName?.toLowerCase().includes("openai")) return true;
    if (meta?.ls_provider === "openai") return true;

    // Metadata attributes check
    if (meta && typeof meta === "object" && "attributes" in meta) {
      const attributes = (meta as Record<string, unknown>).attributes;
      if (
        attributes &&
        typeof attributes === "object" &&
        (attributes as Record<string, unknown>)["llm.system"] === "openai"
      ) {
        return true;
      }
    }

    // STRUCTURAL: Schema-based detection on metadata
    if (OpenAIInputChatCompletionsSchema.safeParse(ctx.metadata).success)
      return true;
    if (OpenAIInputMessagesSchema.safeParse(ctx.metadata).success) return true;
    if (OpenAIOutputResponsesSchema.safeParse(ctx.metadata).success)
      return true;
    if (OpenAIOutputChoicesSchema.safeParse(ctx.metadata).success) return true;
    if (OpenAIOutputSingleMessageSchema.safeParse(ctx.metadata).success)
      return true;

    // finally, test on data if available. we might've done this already if we passed
    // data into metadata. we only do this last due to performance concerns.
    if (OpenAIInputChatCompletionsSchema.safeParse(ctx.data).success)
      return true;
    if (OpenAIInputMessagesSchema.safeParse(ctx.data).success) return true;
    if (OpenAIOutputResponsesSchema.safeParse(ctx.data).success) return true;
    if (OpenAIOutputChoicesSchema.safeParse(ctx.data).success) return true;
    if (OpenAIOutputSingleMessageSchema.safeParse(ctx.data).success)
      return true;

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
