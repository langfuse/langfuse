import {
  type ChatMLMapper,
  MAPPER_SCORE_DEFINITIVE,
  MAPPER_SCORE_NONE,
} from "./base";
import type { LangfuseChatML, LangfuseChatMLMessage } from "../types";
import {
  isPlainObject,
  parseMetadata,
  normalizeMessageForChatMl,
} from "./utils";

function convertPydanticMessage(msg: any): LangfuseChatMLMessage | null {
  if (!msg || typeof msg !== "object") return null;

  const { role, content, ...rest } = msg;

  if (!role || typeof role !== "string") return null;

  // Remove gen_ai.* and event.name fields from json
  const jsonFields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (!key.startsWith("gen_ai.") && key !== "event.name") {
      jsonFields[key] = value;
    }
  }

  return {
    role,
    name: undefined,
    content: content ?? "",
    audio: undefined,
    type: undefined,
    json: Object.keys(jsonFields).length > 0 ? jsonFields : undefined,
  };
}

export const pydanticMapper: ChatMLMapper = {
  mapperName: "pydantic",
  dataSourceName: "pydantic-ai",

  canMapScore(input: unknown, output: unknown, metadata?: unknown): number {
    // Parse metadata (handles string or object)
    const meta = parseMetadata(metadata);

    // Check for pydantic-ai in scope.name (definitive detection)
    if (
      meta &&
      typeof meta === "object" &&
      "scope" in meta &&
      typeof meta.scope === "object" &&
      meta.scope !== null &&
      "name" in meta.scope &&
      meta.scope.name === "pydantic-ai"
    ) {
      return MAPPER_SCORE_DEFINITIVE;
    }

    // Structural detection: check for gen_ai.system and event.name fields
    const scoreData = (data: unknown): number => {
      if (!data) return MAPPER_SCORE_NONE;

      // Input format: array of messages with gen_ai.* fields
      if (Array.isArray(data)) {
        const hasPydanticFields = data.some(
          (msg: any) =>
            msg &&
            typeof msg === "object" &&
            "gen_ai.system" in msg &&
            "event.name" in msg &&
            typeof msg["event.name"] === "string" &&
            (msg["event.name"] as string).startsWith("gen_ai."),
        );
        if (hasPydanticFields) return 7; // High confidence structural indicator
      }

      // Output format: object with gen_ai.system and event.name fields
      if (isPlainObject(data)) {
        const obj = data as Record<string, unknown>;
        if (
          "gen_ai.system" in obj &&
          "event.name" in obj &&
          typeof obj["event.name"] === "string" &&
          (obj["event.name"] as string).startsWith("gen_ai.")
        ) {
          return 7;
        }
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
    const inputMessages: LangfuseChatMLMessage[] = [];
    const outputMessages: LangfuseChatMLMessage[] = [];

    // Process input messages
    if (Array.isArray(input)) {
      for (const msg of input) {
        const converted = convertPydanticMessage(msg);
        if (converted) inputMessages.push(converted);
      }
    }

    // Process output message
    if (output && typeof output === "object") {
      const obj = output as Record<string, unknown>;

      // Pydantic output has message nested in message field
      if ("message" in obj && typeof obj.message === "object") {
        const converted = convertPydanticMessage(obj.message);
        if (converted) outputMessages.push(converted);
      }
    }

    // Extract dataSource from metadata.scope.name
    let dataSource: string | undefined = undefined;
    if (
      meta &&
      typeof meta === "object" &&
      "scope" in meta &&
      typeof meta.scope === "object" &&
      meta.scope !== null &&
      "name" in meta.scope
    ) {
      dataSource = String(meta.scope.name);
    }

    return {
      input: {
        messages: inputMessages,
        additional: undefined,
      },
      output: {
        messages: outputMessages,
        additional: undefined,
      },
      dataSource,
      dataSourceVersion: undefined,

      canDisplayAsChat: function () {
        return inputMessages.length > 0 || outputMessages.length > 0;
      },

      getAllMessages: function () {
        return [...inputMessages, ...outputMessages].map(
          normalizeMessageForChatMl,
        );
      },
    };
  },
};
