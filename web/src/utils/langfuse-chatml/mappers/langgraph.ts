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
import { ChatMessageRole } from "@langfuse/shared";

function hasLangGraphIndicators(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;

  const obj = data as Record<string, unknown>;

  // Check direct properties
  if ("langgraph_node" in obj || "langgraph_step" in obj) {
    return true;
  }

  // Check top-level metadata field
  if ("metadata" in obj) {
    const metadata = parseMetadata(obj.metadata);
    if (
      metadata &&
      ("langgraph_node" in metadata || "langgraph_step" in metadata)
    ) {
      return true;
    }
  }

  // Check nested messages[].metadata
  if ("messages" in obj && Array.isArray(obj.messages)) {
    return obj.messages.some((msg: unknown) => {
      if (!msg || typeof msg !== "object") return false;
      const msgObj = msg as Record<string, unknown>;
      if (!msgObj.metadata) return false;

      const metadata = parseMetadata(msgObj.metadata);
      return (
        metadata &&
        ("langgraph_node" in metadata || "langgraph_step" in metadata)
      );
    });
  }

  return false;
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

  // Keep _originalRole for tool call ID inference (LangGraph-specific)
  if (jsonCopy._originalRole) {
    base._originalRole = String(jsonCopy._originalRole);
    delete jsonCopy._originalRole;
  }

  return extractToolData(base, jsonCopy);
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

    if (
      hasLangGraphIndicators(meta) ||
      hasLangGraphIndicators(input) ||
      hasLangGraphIndicators(output)
    ) {
      return 8;
    }

    return MAPPER_SCORE_NONE;
  },

  map: (
    input: unknown,
    output: unknown,
    metadata?: unknown,
  ): LangfuseChatML => {
    const meta = parseMetadata(metadata);
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
      dataSource: meta?.framework
        ? String(meta.framework)
        : meta?.ls_provider
          ? String(meta.ls_provider)
          : undefined,
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
