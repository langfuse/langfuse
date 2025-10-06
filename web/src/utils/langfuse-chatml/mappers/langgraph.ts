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
import { ChatMessageRole } from "@langfuse/shared";

function hasLangGraphIndicators(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;

  const obj = metadata as Record<string, unknown>;
  return "langgraph_node" in obj || "langgraph_step" in obj;
}

// Normalize LangGraph tool messages by converting tool-name roles to "tool"
// and normalize Google/Gemini format (model role + parts field)
function normalizeLangGraphMessage(
  message: unknown,
  isLangGraph: boolean = false,
): unknown {
  if (!message || typeof message !== "object" || !("role" in message)) {
    return message;
  }

  const msg = message as any;
  const validRoles = Object.values(ChatMessageRole);
  let normalizedMessage = { ...msg };

  // convert google format: "model" role -> "assistant"
  if (msg.role === "model") {
    normalizedMessage.role = ChatMessageRole.Assistant;
  }

  // convert google format: "parts" field -> "content" field
  if (msg.parts && Array.isArray(msg.parts)) {
    const content = msg.parts
      .map((part: any) =>
        typeof part === "object" && part.text ? part.text : String(part),
      )
      .join("");
    normalizedMessage.content = content;
    delete normalizedMessage.parts;
  }

  // convert LangGraph: invalid roles -> "tool" role
  if (
    isLangGraph &&
    !validRoles.includes(normalizedMessage.role as ChatMessageRole)
  ) {
    return {
      ...normalizedMessage,
      role: ChatMessageRole.Tool,
      _originalRole: msg.role,
    };
  }

  return normalizedMessage;
}

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

  const jsonData = extractJsonData(msg.json);
  if (!jsonData) return base;

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

  canMapScore(input: unknown, output: unknown, metadata?: unknown): number {
    const meta = parseMetadata(metadata);

    // LangGraph uses both framework and ls_provider keys
    if (meta?.framework === "langgraph" || meta?.ls_provider === "langgraph") {
      return MAPPER_SCORE_DEFINITIVE;
    }

    // TODO: move to this mapper
    if (hasLangGraphIndicators(meta)) {
      return 8; // Strong indicator
    }

    const scoreData = (data: unknown): number => {
      if (!data || typeof data !== "object") return MAPPER_SCORE_NONE;

      const obj = data as Record<string, unknown>;

      // Check top-level metadata
      // TODO: remove this check, already doing it above
      if ("metadata" in obj && typeof obj.metadata === "string") {
        try {
          const metadata = JSON.parse(obj.metadata);
          if (hasLangGraphIndicators(metadata)) return 8; // Strong structural indicator
        } catch {
          // Ignore parse errors
        }
      }

      // Check if any messages have LangGraph indicators
      if ("messages" in obj && Array.isArray(obj.messages)) {
        const hasLangGraphMsg = obj.messages.some((msg: unknown) => {
          if (!msg || typeof msg !== "object") return false;
          const msgObj = msg as Record<string, unknown>;

          if (!msgObj.metadata) return false;

          try {
            const metadata =
              typeof msgObj.metadata === "string"
                ? JSON.parse(msgObj.metadata)
                : msgObj.metadata;
            return hasLangGraphIndicators(metadata);
          } catch {
            return false;
          }
        });
        if (hasLangGraphMsg) return 8; // Strong structural indicator
      }

      return MAPPER_SCORE_NONE;
    };

    return Math.max(scoreData(input), scoreData(output));
  },

  map: (
    input: unknown,
    output: unknown,
    _metadata?: unknown,
  ): LangfuseChatML => {
    // Apply LangGraph-specific normalization to messages first
    const normalizeData = (data: unknown): unknown => {
      if (!data || typeof data !== "object") return data;

      const obj = data as Record<string, unknown>;

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
