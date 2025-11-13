import type { NormalizerContext, ProviderAdapter } from "../types";
import {
  removeNullFields,
  stringifyToolResultContent,
  parseMetadata,
  isRichToolResult,
} from "../helpers";
import { z } from "zod/v4";

/**
 * AI SDK v5 Adapter
 *
 * Handles traces from Vercel AI SDK v5 with any model provider
 *
 * Key characteristics:
 * - Observation names: ai.generateText.doGenerate, ai.generateObject.doGenerate
 * - Metadata: ai.operationId, ai.model.provider, ai.model.id
 * - Message structure: {role, content: [{type, text/toolCallId/...}]}
 * - Tool calls: {type: "tool-call", toolCallId, toolName, input|args}
 * - Tool results: {type: "tool-result", toolCallId, toolName, output|result}
 */

// Message with AI SDK v5 tool-call content structure
const AISDKToolCallMessageSchema = z.looseObject({
  role: z.string(),
  content: z.array(
    z.looseObject({
      type: z.literal("tool-call"),
      toolCallId: z.string(),
      toolName: z.string(),
    }),
  ),
});

// Message with AI SDK v5 tool-result content structure
const AISDKToolResultMessageSchema = z.looseObject({
  role: z.literal("tool"),
  content: z.array(
    z.looseObject({
      type: z.literal("tool-result"),
      toolCallId: z.string(),
      toolName: z.string(),
    }),
  ),
});

// Message array with AI SDK v5 patterns
const AISDKMessagesArraySchema = z
  .array(
    z.looseObject({
      role: z.string(),
      content: z
        .union([z.string(), z.array(z.looseObject({ type: z.string() }))])
        .optional(),
    }),
  )
  .refine(
    (messages) => {
      // Must have at least one message with AI SDK v5 structured content
      return messages.some(
        (msg) =>
          Array.isArray(msg.content) &&
          msg.content.some(
            (item: unknown) =>
              (item &&
                typeof item === "object" &&
                "type" in item &&
                (item as Record<string, unknown>).type === "tool-call") ||
              (item as Record<string, unknown>).type === "tool-result",
          ),
      );
    },
    { message: "Must have AI SDK v5 tool-call or tool-result patterns" },
  );

// Array of raw tool call objects, format as seen on OUTPUTs
// Example: [{toolCallId: "...", toolName: "...", input: {...}}, ...]
const AISDKRawToolCallArraySchema = z
  .array(
    z.looseObject({
      toolCallId: z.string(),
      toolName: z.string(),
      // Can have either 'input' (OpenAI) or 'args' (Bedrock)
    }),
  )
  .refine((arr) => arr.length > 0, {
    message: "Must have at least one tool call",
  });

// normalize a single AI SDK v5 message to ChatML format
// we don't want additional fields here to get clean rendering
function normalizeMessage(msg: unknown): Record<string, unknown> {
  if (!msg || typeof msg !== "object") return {};

  let working = msg as Record<string, unknown>;

  // Strip provider-specific metadata (Bedrock, OpenAI, etc.)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { providerMetadata, providerOptions, ...withoutProviderFields } =
    working;
  working = withoutProviderFields;

  let normalized = removeNullFields(working);

  // Normalize content: [{type: "text", text: "..."}] → string
  if (
    normalized.content &&
    Array.isArray(normalized.content) &&
    normalized.content.length > 0
  ) {
    // all text already or do owe need to normalize further?
    const allTextItems = normalized.content.every(
      (item: unknown) =>
        item &&
        typeof item === "object" &&
        (item as Record<string, unknown>).type === "text" &&
        typeof (item as Record<string, unknown>).text === "string",
    );

    if (allTextItems && normalized.content.length === 1) {
      // Single text item: extract the text
      const firstItem = normalized.content[0] as Record<string, unknown>;
      normalized.content = firstItem.text;
    } else if (allTextItems && normalized.content.length > 1) {
      // Multiple text items: concatenate
      const texts = normalized.content.map(
        (item: unknown) => (item as Record<string, unknown>).text,
      );
      normalized.content = texts.join("");
    } else {
      // Mixed content or tool-calls/tool-results: normalize each item
      normalized.content = normalized.content.map((item: unknown) => {
        if (!item || typeof item !== "object") return item;

        const contentItem = item as Record<string, unknown>;

        // Handle tool-call content item
        // {type: "tool-call", toolCallId, toolName, input|args, providerOptions}
        if (contentItem.type === "tool-call") {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { providerOptions: _po, ...cleanedItem } = contentItem;

          // Normalize args|input to arguments
          const args = contentItem.args ?? contentItem.input;
          return {
            ...cleanedItem,
            arguments:
              typeof args === "string" ? args : JSON.stringify(args ?? {}),
          };
        }

        // Handle tool-result content item
        // {type: "tool-result", toolCallId, toolName, output|result}
        if (contentItem.type === "tool-result") {
          // Normalize output|result to content
          const resultValue = contentItem.output ?? contentItem.result;

          // If result has nested {type: "text", value: "..."}, extract value
          if (
            resultValue &&
            typeof resultValue === "object" &&
            !Array.isArray(resultValue) &&
            (resultValue as Record<string, unknown>).type === "text" &&
            "value" in (resultValue as Record<string, unknown>)
          ) {
            return {
              ...contentItem,
              content: (resultValue as Record<string, unknown>).value,
            };
          }

          // Otherwise stringify the result
          return {
            ...contentItem,
            content:
              typeof resultValue === "string"
                ? resultValue
                : JSON.stringify(resultValue ?? ""),
          };
        }

        return contentItem;
      });

      // Convert tool-call content items to tool_calls array
      if (Array.isArray(normalized.content)) {
        const toolCallItems = normalized.content.filter(
          (item: unknown) =>
            item &&
            typeof item === "object" &&
            (item as Record<string, unknown>).type === "tool-call",
        );

        if (toolCallItems.length > 0) {
          normalized.tool_calls = toolCallItems.map((item: unknown) => {
            const tc = item as Record<string, unknown>;
            return {
              id: tc.toolCallId,
              name: tc.toolName,
              arguments: tc.arguments,
              type: "function",
            };
          });

          // Remove tool-call items from content, keep only text items
          const textItems = normalized.content.filter(
            (item: unknown) =>
              item &&
              typeof item === "object" &&
              (item as Record<string, unknown>).type === "text",
          );

          if (textItems.length > 0) {
            const texts = textItems.map(
              (item: unknown) => (item as Record<string, unknown>).text ?? "",
            );
            normalized.content = texts.join("");
          } else {
            // No text content, remove content field
            delete normalized.content;
          }
        }
      }

      // Handle tool-result content items for tool role messages
      // Only process if content is still an array (wasn't converted to string above)
      if (Array.isArray(normalized.content)) {
        const toolResultItems = normalized.content.filter(
          (item: unknown) =>
            item &&
            typeof item === "object" &&
            (item as Record<string, unknown>).type === "tool-result",
        );

        if (toolResultItems.length > 0 && normalized.role === "tool") {
          // For single tool result, extract tool_call_id and content
          if (toolResultItems.length === 1) {
            const result = toolResultItems[0] as Record<string, unknown>;
            normalized.tool_call_id = result.toolCallId;
            normalized.content = result.content;
          } else {
            // Multiple tool results: keep as array (less common)
            normalized.content = toolResultItems;
          }
        }
      }
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

function flattenToolDefinition(tool: unknown): Record<string, unknown> {
  // handle stringified tools (e.g. from metadata.tools with bedrock)
  if (typeof tool === "string") {
    try {
      tool = JSON.parse(tool);
    } catch {
      return {};
    }
  }

  if (typeof tool !== "object" || !tool) return {};

  const t = tool as Record<string, unknown>;

  const toolDef: Record<string, unknown> = {
    name: t.name,
    description: t.description ?? "",
  };

  // AI SDK uses inputSchema instead of parameters
  if (t.inputSchema != null) {
    toolDef.parameters = t.inputSchema;
  } else if (t.parameters != null) {
    toolDef.parameters = t.parameters;
  }

  return toolDef;
}

/**
 * Split tool result messages with multiple results into separate messages
 * AI SDK can have: {role: "tool", content: [{type: "tool-result", ...}, {type: "tool-result", ...}]}
 * ChatML expects: [{role: "tool", tool_call_id: "...", content: "..."}, ...]
 */
function splitToolResultMessages(messages: unknown[]): unknown[] {
  const result: unknown[] = [];

  for (const msg of messages) {
    if (!msg || typeof msg !== "object") {
      result.push(msg);
      continue;
    }

    const message = msg as Record<string, unknown>;

    // Check if this is a tool message with array content containing multiple tool-result items
    if (
      message.role === "tool" &&
      Array.isArray(message.content) &&
      message.content.length > 1 &&
      message.content.every(
        (item: unknown) =>
          item &&
          typeof item === "object" &&
          (item as Record<string, unknown>).type === "tool-result",
      )
    ) {
      // Split into separate messages, one per tool result
      for (const item of message.content) {
        const toolResult = item as Record<string, unknown>;
        result.push({
          role: "tool",
          tool_call_id: toolResult.toolCallId,
          content: toolResult.content,
        });
      }
    } else {
      result.push(message);
    }
  }

  return result;
}

function preprocessData(data: unknown, ctx?: NormalizerContext): unknown {
  if (!data) return data;

  // Extract tools from context metadata (observation.metadata.tools)
  let toolsFromContext: unknown[] | undefined;
  if (ctx?.metadata && typeof ctx.metadata === "object") {
    const meta = ctx.metadata as Record<string, unknown>;
    if (Array.isArray(meta.tools)) {
      toolsFromContext = meta.tools.map(flattenToolDefinition);
    }
  }

  // Handle wrapped format with messages and tools
  // {messages: [...], tools: [...]} or {messages: [...], providerOptions: {...}}
  if (typeof data === "object" && !Array.isArray(data) && "messages" in data) {
    const obj = data as Record<string, unknown>;
    const messagesArray = obj.messages as unknown[];

    if (Array.isArray(messagesArray)) {
      let tools: unknown[] | undefined;

      if (Array.isArray(obj.tools)) {
        tools = (obj.tools as unknown[]).map(flattenToolDefinition);
      }

      const normalized = messagesArray.map(normalizeMessage);

      const split = splitToolResultMessages(normalized);

      // Attach tools to messages if present
      if (tools && tools.length > 0) {
        return split.map((msg) => ({
          ...(msg as Record<string, unknown>),
          tools,
        }));
      }

      return split;
    }
  }

  if (Array.isArray(data)) {
    // is an array of raw tool call objects?
    // Example: [{toolCallId: "...", toolName: "...", input: {...}}, ...]
    const rawToolCallArrayResult = AISDKRawToolCallArraySchema.safeParse(data);

    if (rawToolCallArrayResult.success) {
      // Convert raw tool calls into a single assistant message with tool_calls
      const toolCalls = data.map((item) => {
        const tc = item as Record<string, unknown>;
        const args = tc.args ?? tc.input;

        return {
          id: tc.toolCallId,
          name: tc.toolName,
          arguments:
            typeof args === "string" ? args : JSON.stringify(args ?? {}),
          type: "function",
        };
      });

      const assistantMessage: Record<string, unknown> = {
        role: "assistant",
        content: "",
        tool_calls: toolCalls,
      };

      // Attach tools from context if available
      if (toolsFromContext && toolsFromContext.length > 0) {
        assistantMessage.tools = toolsFromContext;
      }

      return [assistantMessage];
    }

    // otherwise it's an array of messages
    const normalized = data.map(normalizeMessage);
    const split = splitToolResultMessages(normalized);

    // Attach tools from context metadata if present
    if (toolsFromContext && toolsFromContext.length > 0) {
      return split.map((msg) => ({
        ...(msg as Record<string, unknown>),
        tools: toolsFromContext,
      }));
    }

    return split;
  }

  // if it's not an array but just a single message
  if (typeof data === "object" && "role" in data) {
    return normalizeMessage(data);
  }

  return data;
}

export const aisdkAdapter: ProviderAdapter = {
  id: "aisdk",

  detect(ctx: NormalizerContext): boolean {
    const meta = parseMetadata(ctx.metadata);

    // EXPLICIT: Framework hint
    if (ctx.framework === "aisdk" || ctx.framework === "aisdk-v5") return true;

    // STRONG INDICATORS: AI SDK v5 telemetry markers
    if (meta && typeof meta === "object") {
      if ("scope" in meta && typeof meta.scope === "object") {
        const scope = meta.scope as Record<string, unknown>;
        if (scope.name === "ai") return true;
      }

      if ("attributes" in meta && typeof meta.attributes === "object") {
        const attrs = meta.attributes as Record<string, unknown> | null;
        if (
          attrs &&
          typeof attrs["operation.name"] === "string" &&
          attrs["operation.name"].startsWith("ai.")
        ) {
          return true;
        }
      }
    }

    // STRUCTURAL: Schema-based detection (for edge cases without metadata)
    if (AISDKToolCallMessageSchema.safeParse(ctx.metadata).success) return true;
    if (AISDKToolResultMessageSchema.safeParse(ctx.metadata).success)
      return true;
    if (AISDKMessagesArraySchema.safeParse(ctx.metadata).success) return true;

    if (AISDKToolCallMessageSchema.safeParse(ctx.data).success) return true;
    if (AISDKToolResultMessageSchema.safeParse(ctx.data).success) return true;
    if (AISDKMessagesArraySchema.safeParse(ctx.data).success) return true;

    // Raw tool call array detection (OUTPUT format)
    if (AISDKRawToolCallArraySchema.safeParse(ctx.data).success) return true;

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
