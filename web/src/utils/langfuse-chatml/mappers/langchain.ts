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
import { isPlainObject } from "./utils";

function convertLangChainMessage(
  msg: ChatMlMessageSchema,
): LangfuseChatMLMessage {
  const base: LangfuseChatMLMessage = {
    role: msg.role || "assistant",
    name: msg.name,
    content: msg.content,
    audio: msg.audio,
    type: msg.type,
  };

  if (!msg.json) return base;

  // ChatML schema wraps extra fields in nested json object
  const jsonData = (msg.json as any).json || msg.json;
  const jsonCopy = { ...jsonData };

  // NOTE: mapToChatMl() flattens LangChain's additional_kwargs.tool_calls to just tool_calls
  // So by the time we get here, LangChain format looks the same as OpenAI format
  // TODO: that logic should be moved here
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

export const langChainMapper: ChatMLMapper = {
  mapperName: "langchain",
  dataSourceName: "langchain",

  canMapScore(
    input: unknown,
    output: unknown,
    dataSource?: string,
    _dataSourceVersion?: string,
    _dataSourceLanguage?: string,
  ): number {
    if (dataSource === "langchain") return 100;

    // Structural detection for LangChain traces
    const scoreData = (data: unknown): number => {
      if (!data || typeof data !== "object") return 0;

      const obj = data as any;

      // Check if messages have additional_kwargs (LangChain-specific structure)
      if (obj.messages && Array.isArray(obj.messages)) {
        const hasAdditionalKwargs = obj.messages.some(
          (msg: any) =>
            msg &&
            typeof msg === "object" &&
            "additional_kwargs" in msg &&
            msg.additional_kwargs &&
            typeof msg.additional_kwargs === "object",
        );
        if (hasAdditionalKwargs) return 5; // Strong indicator
      }

      return 0;
    };

    return Math.max(scoreData(input), scoreData(output));
  },

  map: (input: unknown, output: unknown): LangfuseChatML => {
    const inChatMlArray = mapToChatMl(input);
    const outChatMlArray = mapOutputToChatMl(output);
    const outputClean = cleanLegacyOutput(output, output ?? null);
    const additionalInput = extractAdditionalInput(input);

    const result: LangfuseChatML = {
      input: {
        messages: inChatMlArray.success
          ? inChatMlArray.data.map(convertLangChainMessage)
          : [],
        additional:
          Object.keys(additionalInput ?? {}).length > 0
            ? additionalInput
            : undefined,
      },
      output: {
        messages: outChatMlArray.success
          ? outChatMlArray.data.map(convertLangChainMessage)
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
