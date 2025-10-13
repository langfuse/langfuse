import {
  type ChatMLMapper,
  MAPPER_SCORE_DEFINITIVE,
  MAPPER_SCORE_NONE,
} from "./base";
import type {
  LangfuseChatML,
  LangfuseChatMLMessage,
  ChatMlMessageSchema,
} from "../types";
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

// normalization by stringifying tool call arguments
// Input: tool_calls[].function.arguments may be object or string (from DB)
// Output: tool_calls[].function.arguments is always a JSON string (API-compliant)
function normalizeToolCall(tc: unknown): unknown {
  if (!tc || typeof tc !== "object") return tc;

  const toolCall = tc as Record<string, unknown>;
  return {
    ...toolCall,
    function:
      toolCall.function &&
      typeof toolCall.function === "object" &&
      !Array.isArray(toolCall.function)
        ? {
            ...(toolCall.function as Record<string, unknown>),
            arguments:
              typeof (toolCall.function as any).arguments === "string"
                ? (toolCall.function as any).arguments
                : JSON.stringify((toolCall.function as any).arguments ?? {}),
          }
        : toolCall.function,
  };
}

// transformations
// 1. Removes explicit null fields (schema uses .optional() not .nullish())
// 2. tool_calls[].function.arguments: object → JSON string (via normalizeToolCall)
// 3. tool message content: object → JSON string
function normalizeMessage(msg: any): any {
  if (!msg || typeof msg !== "object") return msg;

  const normalized: Record<string, unknown> = { ...msg };

  // Remove explicit null fields
  Object.keys(normalized).forEach((key) => {
    if (normalized[key] === null) {
      delete normalized[key];
    }
  });

  // Stringify tool_calls arguments if present
  if (normalized.tool_calls && Array.isArray(normalized.tool_calls)) {
    normalized.tool_calls = normalized.tool_calls.map(normalizeToolCall);
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

// outputs normalized messages
const NormalizedOpenAIDataSchema = z.preprocess((data) => {
  if (!data) return data;

  // arrays
  if (Array.isArray(data)) {
    return data.map(normalizeMessage);
  }

  // object with messages key
  if (typeof data === "object" && "messages" in data) {
    const obj = data as Record<string, unknown>;
    return {
      ...obj,
      messages: Array.isArray(obj.messages)
        ? obj.messages.map(normalizeMessage)
        : obj.messages,
    };
  }

  // single message object
  if (typeof data === "object" && "role" in data) {
    return normalizeMessage(data);
  }

  return data;
}, z.unknown());

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
    let currentScore = MAPPER_SCORE_NONE;

    // TODO: ls_provider is a LangSmith convention - may need to check other keys for pure OpenAI traces
    if (meta?.ls_provider === "openai") return MAPPER_SCORE_DEFINITIVE;

    // Check for langfuse-sdk in scope.name (OpenTelemetry convention)
    if ((meta?.scope as Record<string, unknown>)?.name === "langfuse-sdk") {
      currentScore += 5;
    }

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

    const normalizedInput = NormalizedOpenAIDataSchema.parse(input);
    const normalizedOutput = NormalizedOpenAIDataSchema.parse(output);

    const inChatMlArray = mapToChatMl(normalizedInput);
    const outChatMlArray = mapOutputToChatMl(normalizedOutput);
    const outputClean = cleanLegacyOutput(output, output);
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
