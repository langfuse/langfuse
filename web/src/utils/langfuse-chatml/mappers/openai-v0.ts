import type { ChatMLMapper } from "./base";
import type { LangfuseChatML } from "../types";
import { genericMapperV0 } from "./generic-v0";

export const openAIMapperV0: ChatMLMapper = {
  name: "openai",
  version: "v0",
  priority: 10,

  canMap: (input: unknown) => {
    console.log("openAIMapperV0.canMap checking:", JSON.stringify(input));

    // Simple detection: Check for OpenAI-specific structure
    if (typeof input !== "object" || !input) return false;
    const obj = input as any;

    // Check for messages with parts array (OpenAI Parts API)
    if (obj.messages && Array.isArray(obj.messages)) {
      const hasOpenAIParts = obj.messages.some(
        (m: any) =>
          Array.isArray(m.content) &&
          m.content.some(
            (c: any) =>
              c.type === "text" ||
              c.type === "image_url" ||
              c.type === "input_audio",
          ),
      );

      console.log("openAIMapperV0.canMap result:", hasOpenAIParts);
      return hasOpenAIParts;
    }

    return false;
  },

  map: (input: unknown, output: unknown): LangfuseChatML => {
    console.log(
      "openAIMapperV0.map called with:",
      JSON.stringify({ input, output }),
    );

    // For MVP, just use generic mapper with framework metadata
    const result = genericMapperV0.map(input, output);

    // Add OpenAI-specific metadata
    result.metadata = {
      ...result.metadata,
      framework: {
        name: "openai",
        version: "v0",
      },
    };

    console.log("openAIMapperV0.map result:", JSON.stringify(result));
    return result;
  },
};
