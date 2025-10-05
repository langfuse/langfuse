import {
  type ChatMLMapper,
  MAPPER_SCORE_DEFINITIVE,
  MAPPER_SCORE_NONE,
} from "./base";
import type { LangfuseChatML, LangfuseChatMLMessage } from "../types";
import type { ChatMlMessageSchema } from "@/src/components/schemas/ChatMlSchema";
import {
  normalizeLangGraphMessage,
  mapToChatMl,
  mapOutputToChatMl,
  cleanLegacyOutput,
  extractAdditionalInput,
  combineInputOutputMessages,
} from "../../chatMlMappers";
import {
  LANGGRAPH_NODE_TAG,
  LANGGRAPH_STEP_TAG,
} from "@/src/features/trace-graph-view/types";
import { isPlainObject } from "./utils";

function convertLangGraphMessage(
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

  // ChatML schema wraps extra fields in a nested json object
  const jsonData = (msg.json as any).json || msg.json;
  const jsonCopy = { ...jsonData };

  // keep _originalRole for tool call ID inference
  if (jsonCopy._originalRole) {
    base._originalRole = String(jsonCopy._originalRole);
  }

  // tool_calls
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

  if (jsonCopy.tool_call_id) {
    base.toolCallId = String(jsonCopy.tool_call_id);
    delete jsonCopy.tool_call_id;
  }

  return {
    ...base,
    json: Object.keys(jsonCopy).length > 0 ? jsonCopy : undefined,
  };
}

export const langGraphMapper: ChatMLMapper = {
  mapperName: "langgraph",
  dataSourceName: "langgraph",

  canMapScore(
    input: unknown,
    output: unknown,
    dataSource?: string,
    _dataSourceVersion?: string,
    _dataSourceLanguage?: string,
  ): number {
    // Metadata match = definitive
    if (dataSource === "langgraph") return MAPPER_SCORE_DEFINITIVE;

    const hasLangGraphMetadata = (metadataStr: string): boolean => {
      try {
        const metadata =
          typeof metadataStr === "string"
            ? JSON.parse(metadataStr)
            : metadataStr;

        if (typeof metadata === "object" && metadata !== null) {
          return (
            LANGGRAPH_NODE_TAG in metadata || LANGGRAPH_STEP_TAG in metadata
          );
        }
      } catch {}
      return false;
    };

    const scoreData = (data: unknown): number => {
      if (!data || typeof data !== "object") return MAPPER_SCORE_NONE;

      // Check top-level metadata
      if ("metadata" in data && typeof (data as any).metadata === "string") {
        if (hasLangGraphMetadata((data as any).metadata)) return 8; // Strong structural indicator
      }

      // Check if any messages have LangGraph indicators
      if ("messages" in data && Array.isArray((data as any).messages)) {
        const hasLangGraphMsg = (data as any).messages.some(
          (msg: any) => msg.metadata && hasLangGraphMetadata(msg.metadata),
        );
        if (hasLangGraphMsg) return 8; // Strong structural indicator
      }

      return MAPPER_SCORE_NONE;
    };

    return Math.max(scoreData(input), scoreData(output));
  },

  map: (input: unknown, output: unknown): LangfuseChatML => {
    // Apply LangGraph-specific normalization to messages first
    const normalizeData = (data: unknown): unknown => {
      if (!data || typeof data !== "object") return data;

      const obj = data as any;

      // Normalize messages if they exist
      if (obj.messages && Array.isArray(obj.messages)) {
        return {
          ...obj,
          messages: obj.messages.map((msg: unknown) =>
            normalizeLangGraphMessage(msg, true),
          ),
        };
      }

      // If it's a single message, normalize it
      if (obj.role) {
        return normalizeLangGraphMessage(obj, true);
      }

      return data;
    };

    const normalizedInput = normalizeData(input);
    const normalizedOutput = normalizeData(output);

    const inChatMlArray = mapToChatMl(normalizedInput);
    const outChatMlArray = mapOutputToChatMl(normalizedOutput);
    const outputClean = cleanLegacyOutput(output, output ?? null);
    const additionalInput = extractAdditionalInput(normalizedInput);

    const result: LangfuseChatML = {
      input: {
        messages: inChatMlArray.success
          ? inChatMlArray.data.map(convertLangGraphMessage)
          : [],
        additional:
          Object.keys(additionalInput ?? {}).length > 0
            ? additionalInput
            : undefined,
      },
      output: {
        messages: outChatMlArray.success
          ? outChatMlArray.data.map(convertLangGraphMessage)
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
