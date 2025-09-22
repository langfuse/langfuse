import type { ChatMLMapper } from "./base";
import type { LangfuseChatML } from "../types";
import {
  isLangGraphTrace,
  normalizeLangGraphMessage,
} from "../../chatMlMappers";
import { genericMapperV0 } from "./generic-v0";

export const langGraphMapperV0: ChatMLMapper = {
  name: "langgraph",
  version: "v0",
  priority: 20,

  canMap: (input: unknown, output: unknown) => {
    console.log(
      "langGraphMapperV0.canMap checking:",
      JSON.stringify({ input, output }),
    );

    // Check for LangGraph metadata in either input or output
    const checkForLangGraph = (data: unknown): boolean => {
      if (!data || typeof data !== "object") return false;

      // Check if data has metadata field
      if ("metadata" in data && typeof (data as any).metadata === "string") {
        return isLangGraphTrace({ metadata: (data as any).metadata });
      }

      // Check if any messages have LangGraph indicators
      if ("messages" in data && Array.isArray((data as any).messages)) {
        return (data as any).messages.some(
          (msg: any) =>
            msg.metadata && isLangGraphTrace({ metadata: msg.metadata }),
        );
      }

      return false;
    };

    const result = checkForLangGraph(input) || checkForLangGraph(output);
    console.log("langGraphMapperV0.canMap result:", result);
    return result;
  },

  map: (input: unknown, output: unknown): LangfuseChatML => {
    console.log(
      "langGraphMapperV0.map called with:",
      JSON.stringify({ input, output }),
    );

    // Apply LangGraph-specific normalization to messages
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

    // Use generic mapper with normalized data
    const result = genericMapperV0.map(normalizedInput, normalizedOutput);

    // Add LangGraph-specific metadata
    result.metadata = {
      ...result.metadata,
      framework: {
        name: "langgraph",
        version: "v0",
      },
    };

    console.log("langGraphMapperV0.map result:", JSON.stringify(result));
    return result;
  },
};
