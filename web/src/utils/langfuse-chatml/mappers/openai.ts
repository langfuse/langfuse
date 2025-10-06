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

  const jsonCopy = { ...jsonData };

  // OpenAI tool_calls in standard format
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

  // Tool response: tool_call_id
  if (jsonCopy.tool_call_id) {
    const toolCallId = String(jsonCopy.tool_call_id);
    delete jsonCopy.tool_call_id;
    return {
      ...base,
      toolCallId,
      json: Object.keys(jsonCopy).length > 0 ? jsonCopy : undefined,
    };
  }

  return { ...base, json: jsonCopy };
}

export const openAIMapper: ChatMLMapper = {
  mapperName: "openai",
  dataSourceName: "openai",

  canMapScore(input: unknown, output: unknown, metadata?: unknown): number {
    const meta = parseMetadata(metadata);

    // TODO: ls_provider is a LangSmith convention - may need to check other keys for pure OpenAI traces
    if (meta?.ls_provider === "openai") return MAPPER_SCORE_DEFINITIVE;

    if (OpenAIPartsAPISchema.safeParse(input).success) {
      return 8; // Strong structural indicator
    }

    return MAPPER_SCORE_NONE;
  },

  map: (
    input: unknown,
    output: unknown,
    _metadata?: unknown,
  ): LangfuseChatML => {
    const inChatMlArray = mapToChatMl(input);
    const outChatMlArray = mapOutputToChatMl(output);
    const outputClean = cleanLegacyOutput(output, output ?? null);
    const additionalInput = extractAdditionalInput(input);

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
