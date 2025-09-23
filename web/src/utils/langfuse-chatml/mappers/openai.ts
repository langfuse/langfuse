import type { ChatMLMapper } from "./base";
import type { LangfuseChatML } from "../types";
import { genericMapper } from "./generic";

export const openAIMapper: ChatMLMapper = {
  name: "openai",

  canMap: (
    input: unknown,
    output: unknown,
    dataSource?: string,
    _dataSourceVersion?: string,
  ): boolean => {
    // Primary: SDK metadata match
    if (dataSource === "openai") return true;

    // Fallback: Structural detection (for old traces without metadata)
    if (typeof input !== "object" || !input) return false;
    const obj = input as any;

    // Check for messages with parts array (OpenAI Parts API)
    if (obj.messages && Array.isArray(obj.messages)) {
      return obj.messages.some(
        (m: any) =>
          Array.isArray(m.content) &&
          m.content.some(
            (c: any) =>
              c.type === "text" ||
              c.type === "image_url" ||
              c.type === "input_audio",
          ),
      );
    }

    return false;
  },

  map: (input: unknown, output: unknown): LangfuseChatML => {
    return genericMapper.map(input, output);
  },
};
