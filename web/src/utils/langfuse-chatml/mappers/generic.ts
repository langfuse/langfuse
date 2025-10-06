import { type ChatMLMapper, MAPPER_SCORE_NONE } from "./base";
import type { LangfuseChatML, LangfuseChatMLMessage } from "../types";
import type { ChatMlMessageSchema } from "@/src/components/schemas/ChatMlSchema";
import {
  isPlainObject,
  mapToChatMl,
  mapOutputToChatMl,
  cleanLegacyOutput,
  extractAdditionalInput,
  combineInputOutputMessages,
} from "./utils";

export const genericMapper: ChatMLMapper = {
  mapperName: "generic",
  dataSourceName: "generic",

  canMapScore(_input: unknown, _output: unknown, _metadata?: unknown): number {
    // Fallback mapper, always tried last
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
          ? inChatMlArray.data.map(convertToLangfuseChatMLMessage)
          : [],
        additional:
          Object.keys(additionalInput ?? {}).length > 0
            ? additionalInput
            : undefined,
      },
      output: {
        messages: outChatMlArray.success
          ? outChatMlArray.data.map(convertToLangfuseChatMLMessage)
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

function convertToLangfuseChatMLMessage(
  msg: ChatMlMessageSchema,
): LangfuseChatMLMessage {
  // Generic mapper: simple pass-through, no framework-specific tool extraction
  return {
    role: msg.role || "assistant",
    name: msg.name,
    content: msg.content,
    audio: msg.audio,
    type: msg.type,
    json: msg.json,
  };
}
