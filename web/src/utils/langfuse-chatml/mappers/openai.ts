import {
  type ChatMLMapper,
  MAPPER_SCORE_DEFINITIVE,
  MAPPER_SCORE_NONE,
} from "./base";
import type { LangfuseChatML, LangfuseChatMLMessage } from "../types";
import type { ChatMlMessageSchema } from "@/src/components/schemas/ChatMlSchema";
import {
  isPlainObject,
  parseMetadata,
  extractJsonData,
  extractToolData,
  mapToChatMl,
  mapOutputToChatMl,
  cleanLegacyOutput,
  extractAdditionalInput,
  combineInputOutputMessages,
} from "./utils";
import { z } from "zod/v4";

const OpenAIPartsAPISchema = z.object({
  messages: z.array(
    z.object({
      content: z.array(
        z.object({
          type: z.enum(["text", "image_url", "input_audio"]),
        }),
      ),
    }),
  ),
});

/**
 * Normalizes a single OpenAI message to match internal format
 *
 * Output: API-compliant message structure:
 * {
 *   role?: string,
 *   content?: string,  // Objects converted to JSON strings
 *   tool_calls?: [{
 *     id?: string,
 *     type?: string,
 *     function?: {
 *       name?: string,
 *       arguments: string  // Always a JSON string (objects are stringified)
 *     }
 *   }],
 *   tool_call_id?: string,
 *   name?: string,
 *   // removed null values
 *   // additional fields preserved via passthrough
 * }
 *
 * Transforms:
 * 1. Removes explicit null fields (schema uses .optional() not .nullish())
 * 2. tool_calls[].function.arguments: stringify if objects
 * 3. tool message content: stringify if object
 */
function normalizeOpenAIMessage(msg: any): any {
  if (!msg || typeof msg !== "object") return msg;

  const normalized = { ...msg };

  // Remove explicit null fields (schema uses .optional() not .nullish())
  Object.keys(normalized).forEach((key) => {
    if (normalized[key] === null) {
      delete normalized[key];
    }
  });

  // Stringify tool_calls arguments if they're objects
  if (normalized.tool_calls && Array.isArray(normalized.tool_calls)) {
    normalized.tool_calls = normalized.tool_calls.map((tc: any) => ({
      ...tc,
      function: tc.function
        ? {
            ...tc.function,
            arguments:
              typeof tc.function.arguments === "string"
                ? tc.function.arguments
                : JSON.stringify(tc.function.arguments ?? {}),
          }
        : tc.function,
    }));
  }

  // Stringify object content for tool messages
  if (
    normalized.role === "tool" &&
    typeof normalized.content === "object" &&
    normalized.content !== null &&
    !Array.isArray(normalized.content)
  ) {
    normalized.content = JSON.stringify(normalized.content);
  }

  return normalized;
}

/**
 * Normalizes OpenAI data in various formats.
 *
 * Handles three input patterns from DB:
 * 1. Direct array: [{role, content}, ...]
 * 2. Object wrapper: {messages: [...], tools: [...]}
 * 3. Single message: {role, content}
 *
 * Output: Same structure as input, but with all messages normalized via normalizeOpenAIMessage
 * - Array input → array with normalized messages
 * - Object with messages → object with messages array normalized
 * - Single message → single normalized message
 * - Other types → returned as-is
 *
 * All messages in output have stringified tool arguments/content and no null fields.
 */
function normalizeOpenAIData(data: unknown): unknown {
  if (!data) return data;

  // Handle array of messages
  if (Array.isArray(data)) {
    return data.map(normalizeOpenAIMessage);
  }

  // Handle object with messages key
  if (typeof data === "object" && "messages" in data) {
    const obj = data as any;
    return {
      ...obj,
      messages: Array.isArray(obj.messages)
        ? obj.messages.map(normalizeOpenAIMessage)
        : obj.messages,
    };
  }

  // Handle single message object
  if (typeof data === "object" && "role" in data) {
    return normalizeOpenAIMessage(data);
  }

  return data;
}

function convertOpenAIMessage(msg: ChatMlMessageSchema): LangfuseChatMLMessage {
  const base: LangfuseChatMLMessage = {
    role: msg.role || "assistant",
    name: msg.name,
    content: msg.content,
    audio: msg.audio,
    type: msg.type,
  };

  if (!msg.json) return base;

  // The ChatML schema wraps extra fields in a nested json object
  // extractJsonData handles both: { json: {...} } and {...}
  const jsonData = extractJsonData(msg.json);
  if (!jsonData) return base;

  return extractToolData(base, jsonData);
}

export const openAIMapper: ChatMLMapper = {
  mapperName: "openai",
  dataSourceName: "openai",

  canMapScore(
    input: unknown,
    output: unknown,
    metadata?: unknown,
    observationName?: string,
  ): number {
    const meta = parseMetadata(metadata);
    let currentScore = 0;

    // TODO: ls_provider is a LangSmith convention - may need to check other keys for pure OpenAI traces
    if (meta?.ls_provider === "openai") return MAPPER_SCORE_DEFINITIVE;

    // Check for langfuse-sdk in scope.name (OpenTelemetry convention)
    if ((meta?.scope as Record<string, unknown>)?.name === "langfuse-sdk") {
      currentScore += 5;
    }

    // Check observation name for "openai" hint
    if (observationName && observationName.toLowerCase().includes("openai")) {
      currentScore += 3;
    }

    if (OpenAIPartsAPISchema.safeParse(input).success) {
      currentScore = Math.max(currentScore, 8);
    }

    return Math.min(10, currentScore);
  },

  map: (
    input: unknown,
    output: unknown,
    metadata?: unknown,
    _observationName?: string,
  ): LangfuseChatML => {
    const meta = parseMetadata(metadata);

    const normalizedInput = normalizeOpenAIData(input);
    const normalizedOutput = normalizeOpenAIData(output);
    const inChatMlArray = mapToChatMl(normalizedInput);
    const outChatMlArray = mapOutputToChatMl(normalizedOutput);
    const outputClean = cleanLegacyOutput(output, output ?? null);
    const additionalInput = extractAdditionalInput(normalizedInput);

    const result: LangfuseChatML = {
      input: {
        messages: inChatMlArray.success
          ? inChatMlArray.data.map(convertOpenAIMessage)
          : [],
        additional:
          Object.keys(additionalInput ?? {}).length > 0
            ? additionalInput
            : undefined,
      },
      output: {
        messages: outChatMlArray.success
          ? outChatMlArray.data.map(convertOpenAIMessage)
          : [],
        additional: isPlainObject(outputClean) ? outputClean : undefined,
      },
      dataSource: meta?.ls_provider ? String(meta.ls_provider) : undefined,
      dataSourceVersion: meta?.ls_version ? String(meta.ls_version) : undefined,

      canDisplayAsChat: function () {
        return inChatMlArray.success || outChatMlArray.success;
      },

      getAllMessages: function () {
        return combineInputOutputMessages(
          inChatMlArray,
          outChatMlArray,
          outputClean,
        );
      },
    };

    return result;
  },
};
