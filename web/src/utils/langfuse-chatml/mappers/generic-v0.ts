import type { ChatMLMapper } from "./base";
import type { LangfuseChatML, LangfuseChatMLMessage } from "../types";
import type { ChatMlMessageSchema } from "@/src/components/schemas/ChatMlSchema";
import {
  mapToChatMl,
  mapOutputToChatMl,
  cleanLegacyOutput,
  extractAdditionalInput,
  combineInputOutputMessages,
} from "../../chatMlMappers";

export const genericMapperV0: ChatMLMapper = {
  name: "generic",
  version: "v0",
  priority: 999, // Lowest priority (fallback)

  canMap: () => true, // Always can map (fallback)

  map: (input: unknown, output: unknown): LangfuseChatML => {
    console.log(
      "genericMapperV0.map called with:",
      JSON.stringify({ input, output }),
    );

    // Reuse existing logic from chatMlMappers
    const inChatMlArray = mapToChatMl(input);
    const outChatMlArray = mapOutputToChatMl(output);
    const outputClean = cleanLegacyOutput(output, output ?? null);
    const additionalInput = extractAdditionalInput(input);

    console.log(
      "genericMapperV0 parsed:",
      JSON.stringify({
        inChatMlSuccess: inChatMlArray.success,
        outChatMlSuccess: outChatMlArray.success,
        additionalInput,
        outputClean,
      }),
    );

    // Create the LangfuseChatML object
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
        additional:
          typeof outputClean === "object" &&
          outputClean !== null &&
          !Array.isArray(outputClean)
            ? outputClean
            : undefined,
      },

      canDisplayAsChat: function () {
        console.log(
          "canDisplayAsChat called, inSuccess:",
          inChatMlArray.success,
          "outSuccess:",
          outChatMlArray.success,
        );
        return inChatMlArray.success || outChatMlArray.success;
      },

      getAllMessages: function () {
        console.log("getAllMessages called");
        return combineInputOutputMessages(
          inChatMlArray,
          outChatMlArray,
          outputClean,
        );
      },
    };

    console.log("genericMapperV0 result:", JSON.stringify(result));
    return result;
  },
};

function convertToLangfuseChatMLMessage(
  msg: ChatMlMessageSchema,
): LangfuseChatMLMessage {
  return {
    role: msg.role || "assistant",
    name: msg.name,
    content: msg.content,
    audio: msg.audio,
    type: msg.type,
    json: msg.json,
    // TODO: Extract toolCalls, toolCallId from json if needed
  };
}
