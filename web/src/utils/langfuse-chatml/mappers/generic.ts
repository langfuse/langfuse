import { type ChatMLMapper, MAPPER_SCORE_NONE } from "./base";
import type {
  LangfuseChatML,
  LangfuseChatMLMessage,
  ChatMlMessageSchema,
} from "../types";
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

  canMapScore(
    _input: unknown,
    _output: unknown,
    _metadata?: unknown,
    _observationName?: string,
  ): number {
    // Fallback mapper, always tried last
    return MAPPER_SCORE_NONE;
  },

  map: (
    input: unknown,
    output: unknown,
    _metadata?: unknown,
    _observationName?: string,
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
        // if input/output parsing failed, exit early for performance reasons
        if (!inChatMlArray.success && !outChatMlArray.success) {
          return false;
        }

        // Only display as chat if we have actual renderable messages
        // Check getAllMessages() instead of just parse success, may filter out messages
        // TODO: once we move to langfuse-chatml, we can fix this
        const allMessages = combineInputOutputMessages(
          inChatMlArray,
          outChatMlArray,
          outputClean,
        );
        const canDisplay = allMessages.length > 0;
        return canDisplay;
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
