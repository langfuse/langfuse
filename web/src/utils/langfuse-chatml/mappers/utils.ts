import { z } from "zod/v4";
import {
  ChatMlArraySchema,
  type ChatMlMessageSchema,
} from "@/src/components/schemas/ChatMlSchema";

// check if object (not array nor null)
export const isPlainObject = (val: unknown): val is Record<string, unknown> =>
  typeof val === "object" && val !== null && !Array.isArray(val);

export function parseMetadata(
  metadata: unknown,
): Record<string, unknown> | undefined {
  if (typeof metadata === "string") {
    try {
      return JSON.parse(metadata) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }
  if (metadata && typeof metadata === "object") {
    return metadata as Record<string, unknown>;
  }
  return undefined;
}

/**
 * Extract the actual json data from ChatML message json field.
 * ChatML schema's passthrough behavior wraps extra fields in nested json object.
 * This handles both: { json: {...} } and {...}
 */
export function extractJsonData(
  msgJson: unknown,
): Record<string, unknown> | undefined {
  if (!msgJson || typeof msgJson !== "object") return undefined;

  const obj = msgJson as Record<string, unknown>;

  // if it's the nested format: { json: {...} }
  if ("json" in obj && typeof obj.json === "object" && obj.json !== null) {
    return obj.json as Record<string, unknown>;
  }

  return obj;
}

/**
 * Generic ChatML input parser with fallback handling
 * Handles various input formats:
 * - Direct array: [{role, content}, ...]
 * - Nested array: [[{role, content}, ...]]
 * - Object wrapper: {messages: [{role, content}, ...]}
 */
export function mapToChatMl(
  input: unknown,
): ReturnType<typeof ChatMlArraySchema.safeParse> {
  let result = ChatMlArraySchema.safeParse(input);
  if (result.success) {
    return result;
  }

  // Check if input is an array of length 1 including an array of ChatMlMessageSchema
  // This is the case for some integrations
  // e.g. [[ChatMlMessageSchema, ...]]
  const inputArray = z.array(ChatMlArraySchema).safeParse(input);
  if (inputArray.success && inputArray.data.length === 1) {
    return ChatMlArraySchema.safeParse(inputArray.data[0]);
  }

  // Check if input is an object with a messages key
  // This is the case for some integrations
  // e.g. { messages: [ChatMlMessageSchema, ...] }
  const inputObject = z
    .object({
      messages: ChatMlArraySchema,
    })
    .safeParse(input);

  if (inputObject.success) {
    return ChatMlArraySchema.safeParse(inputObject.data.messages);
  }

  return result; // Return the original failed parse result
}

// Wraps single messages in array and validates
export function mapOutputToChatMl(
  output: unknown,
): ReturnType<typeof ChatMlArraySchema.safeParse> {
  const result = ChatMlArraySchema.safeParse(
    Array.isArray(output) ? output : [output],
  );

  return result;
}

// Cleans legacy completion format output for display
// handles {completion: string} -> string transformation
export function cleanLegacyOutput(output: unknown, fallback?: unknown) {
  const outLegacyCompletionSchema = z
    .object({
      completion: z.string(),
    })
    .refine((value) => Object.keys(value).length === 1);

  const outLegacyCompletionSchemaParsed =
    outLegacyCompletionSchema.safeParse(output);
  const outputClean = outLegacyCompletionSchemaParsed.success
    ? outLegacyCompletionSchemaParsed.data
    : (fallback ?? null);

  return outputClean;
}

// Extracts additional input fields beyond the messages array
// Returns raw additionalInput (may be empty object) - filtering done at usage site
export function extractAdditionalInput(
  input: unknown,
): Record<string, unknown> | undefined {
  const additionalInput =
    typeof input === "object" && input !== null && !Array.isArray(input)
      ? Object.fromEntries(
          Object.entries(input as object).filter(([key]) => key !== "messages"),
        )
      : undefined;

  // raw result should still be filtered (Object.keys().length > 0)
  return additionalInput;
}

// combines input and output messages into a single chat conversation
export function combineInputOutputMessages(
  inputResult: ReturnType<typeof mapToChatMl>,
  outputResult: ReturnType<typeof mapOutputToChatMl>,
  cleanOutput: unknown,
): ChatMlMessageSchema[] {
  if (!inputResult.success) {
    // Return empty array to prevent crash - this should never happen in normal usage
    return [];
  }

  const combinedMessages = [
    ...inputResult.data,
    ...(outputResult.success
      ? outputResult.data.map((m) => ({
          ...m,
          role: m.role ?? "assistant",
        }))
      : [
          {
            role: "assistant",
            ...(typeof cleanOutput === "string"
              ? { content: cleanOutput }
              : { json: cleanOutput }),
          } as ChatMlMessageSchema,
        ]),
  ];

  return combinedMessages;
}

// Normalize LangfuseChatMLMessage to match ChatMlMessageSchema structure
// Ensures all required fields are present (even if undefined) for type compatibility
export function normalizeMessageForChatMl(msg: any): ChatMlMessageSchema {
  return {
    role: msg.role,
    name: msg.name,
    content: msg.content,
    audio: msg.audio,
    type: msg.type,
    ...(msg.json && Object.keys(msg.json).length > 0 ? { json: msg.json } : {}),
  } as ChatMlMessageSchema;
}

/**
 * Extract tool data (tool_calls and tool_call_id) from json object
 * Returns updated message with toolCalls/toolCallId and remaining json fields
 */
export function extractToolData(
  base: any,
  jsonData: Record<string, unknown>,
): any {
  const jsonCopy = { ...jsonData };

  // Extract tool_calls
  if (jsonCopy.tool_calls && Array.isArray(jsonCopy.tool_calls)) {
    const toolCalls = jsonCopy.tool_calls.map((tc: any) => ({
      id: tc.id || null,
      type: "function" as const,
      function: {
        name: tc.function?.name || tc.name,
        arguments:
          typeof tc.function?.arguments === "string"
            ? tc.function.arguments
            : JSON.stringify(tc.function?.arguments || tc.args || {}),
      },
    }));

    delete jsonCopy.tool_calls;
    return {
      ...base,
      toolCalls,
      json: Object.keys(jsonCopy).length > 0 ? jsonCopy : undefined,
    };
  }

  // Extract tool_call_id
  if (jsonCopy.tool_call_id) {
    const toolCallId = String(jsonCopy.tool_call_id);
    delete jsonCopy.tool_call_id;
    return {
      ...base,
      toolCallId,
      json: Object.keys(jsonCopy).length > 0 ? jsonCopy : undefined,
    };
  }

  return {
    ...base,
    json: Object.keys(jsonCopy).length > 0 ? jsonCopy : undefined,
  };
}
