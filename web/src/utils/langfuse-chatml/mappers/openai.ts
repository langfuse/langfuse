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
      return 8; // Strong structural indicator
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
