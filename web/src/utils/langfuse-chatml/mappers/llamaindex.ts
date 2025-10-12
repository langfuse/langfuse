import {
  type ChatMLMapper,
  MAPPER_SCORE_DEFINITIVE,
  MAPPER_SCORE_NONE,
} from "./base";
import type { LangfuseChatML, LangfuseChatMLMessage } from "../types";
import { parseMetadata, normalizeMessageForChatMl } from "./utils";

export const llamaIndexMapper: ChatMLMapper = {
  mapperName: "llamaindex",
  dataSourceName: "llama-index",

  canMapScore(
    input: unknown,
    output: unknown,
    metadata?: unknown,
    _observationName?: string,
  ): number {
    const meta = parseMetadata(metadata);

    if (
      meta &&
      typeof meta === "object" &&
      "scope" in meta &&
      typeof meta.scope === "object" &&
      meta.scope !== null &&
      "name" in meta.scope &&
      typeof meta.scope.name === "string" &&
      (meta.scope.name as string).includes("llama_index")
    ) {
      return MAPPER_SCORE_DEFINITIVE;
    }

    return MAPPER_SCORE_NONE;
  },

  map: (
    input: unknown,
    output: unknown,
    metadata?: unknown,
    _observationName?: string,
  ): LangfuseChatML => {
    const inputMessages: LangfuseChatMLMessage[] = [];
    const outputMessages: LangfuseChatMLMessage[] = [];

    const meta = parseMetadata(metadata);

    // Extract prompts from metadata.attributes.llm.prompts
    if (
      meta &&
      typeof meta === "object" &&
      "attributes" in meta &&
      typeof meta.attributes === "object" &&
      meta.attributes !== null
    ) {
      const attrs = meta.attributes as Record<string, unknown>;

      // Process llm.prompts as input messages (user role)
      if (Array.isArray(attrs["llm.prompts"])) {
        for (const prompt of attrs["llm.prompts"]) {
          if (typeof prompt === "string") {
            inputMessages.push({
              role: "user",
              name: undefined,
              content: prompt,
              audio: undefined,
              type: undefined,
            });
          }
        }
      }
    }

    // Process output (direct string)
    if (typeof output === "string" && output.length > 0) {
      outputMessages.push({
        role: "assistant",
        name: undefined,
        content: output,
        audio: undefined,
        type: undefined,
      });
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
