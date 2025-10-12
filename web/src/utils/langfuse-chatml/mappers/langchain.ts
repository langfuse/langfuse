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
import { OpenAIToolSchema, type LLMToolDefinition } from "@langfuse/shared";

// is a message a LangChain tool **definition** schema?
function isToolDefinitionMessage(msg: ChatMlMessageSchema): boolean {
  if (msg.role !== "tool") return false;
  if (typeof msg.content !== "string") return false;
  // Tool results have tool_call_id in json field, tool definitions don't
  const jsonData = extractJsonData(msg.json);
  if (jsonData?.tool_call_id) return false;

  try {
    const parsed = JSON.parse(msg.content);
    return OpenAIToolSchema.safeParse(parsed).success;
  } catch {
    return false;
  }
}

function extractToolDefinition(msg: ChatMlMessageSchema) {
  try {
    const parsed = JSON.parse(msg.content as string);
    if (parsed.type === "function" && parsed.function) {
      return {
        name: parsed.function.name,
        description: parsed.function.description,
        parameters: parsed.function.parameters,
      };
    }
  } catch {}
  return null;
}

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
  const jsonData = extractJsonData(msg.json);
  if (!jsonData) return base;

  // NOTE: mapToChatMl() flattens LangChain's additional_kwargs.tool_calls to just tool_calls
  // So by the time we get here, LangChain format looks the same as OpenAI format
  return extractToolData(base, jsonData);
}

export const langChainMapper: ChatMLMapper = {
  mapperName: "langchain",
  dataSourceName: "langchain",

  canMapScore(input: unknown, output: unknown, metadata?: unknown): number {
    const meta = parseMetadata(metadata);

    if (meta?.framework === "langchain") {
      return MAPPER_SCORE_DEFINITIVE;
    }

    // Check for any ls_ prefixed fields (common for LangChain due to LangSmith integration)
    if (meta && typeof meta === "object") {
      const hasLsPrefix = Object.keys(meta).some((key) =>
        key.startsWith("ls_"),
      );
      if (hasLsPrefix) {
        return MAPPER_SCORE_DEFINITIVE;
      }
    }

    // Structural detection for LangChain traces
    const scoreData = (data: unknown): number => {
      if (!data || typeof data !== "object") return MAPPER_SCORE_NONE;

      const obj = data as Record<string, unknown>;

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
        if (hasAdditionalKwargs) return 5; // Structural indicator
      }

      return MAPPER_SCORE_NONE;
    };

    return Math.max(scoreData(input), scoreData(output));
  },

  map: (
    input: unknown,
    output: unknown,
    metadata?: unknown,
  ): LangfuseChatML => {
    const meta = parseMetadata(metadata);
    const inChatMlArray = mapToChatMl(input);
    const outChatMlArray = mapOutputToChatMl(output);
    const outputClean = cleanLegacyOutput(output, output ?? null);
    const additionalInput = extractAdditionalInput(input);

    // Separate tool definitions from regular messages
    const toolDefinitions: LLMToolDefinition[] = [];
    const regularMessages: ChatMlMessageSchema[] = [];

    if (inChatMlArray.success) {
      for (const msg of inChatMlArray.data) {
        if (isToolDefinitionMessage(msg)) {
          const toolDef = extractToolDefinition(msg);
          if (toolDef) toolDefinitions.push(toolDef);
        } else {
          regularMessages.push(msg);
        }
      }
    }

    // Build additional field with tools if present
    const additional = {
      ...additionalInput,
      ...(toolDefinitions.length > 0 ? { tools: toolDefinitions } : {}),
    };

    const result: LangfuseChatML = {
      input: {
        messages: regularMessages.map(convertLangChainMessage),
        additional: Object.keys(additional).length > 0 ? additional : undefined,
      },
      output: {
        messages: outChatMlArray.success
          ? outChatMlArray.data.map(convertLangChainMessage)
          : [],
        additional: isPlainObject(outputClean) ? outputClean : undefined,
      },
      dataSource: meta?.framework ? String(meta.framework) : undefined,
      dataSourceVersion: meta?.ls_version ? String(meta.ls_version) : undefined,

      canDisplayAsChat: function () {
        return regularMessages.length > 0 || outChatMlArray.success;
      },

      getAllMessages: function () {
        return combineInputOutputMessages(
          { success: true, data: regularMessages },
          outChatMlArray,
          outputClean,
        );
      },
    };

    return result;
  },
};
