import type { ChatMLMapper } from "./base";
import type { LangfuseChatML } from "../types";
import { normalizeLangGraphMessage } from "../../chatMlMappers";
import { genericMapper } from "./generic";

export const langGraphMapper: ChatMLMapper = {
  name: "langgraph",

  canMap: (
    input: unknown,
    output: unknown,
    dataSource?: string,
    _dataSourceVersion?: string,
  ): boolean => {
    // Primary: SDK metadata match
    if (dataSource === "langgraph") return true;

    // Fallback: Structural detection (for old traces without metadata)
    const checkForLangGraph = (data: unknown): boolean => {
      if (!data || typeof data !== "object") return false;

      // Import the function dynamically to avoid circular dependencies
      // TODO: fix this
      const { isLangGraphTrace } = require("../../chatMlMappers");

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

    return checkForLangGraph(input) || checkForLangGraph(output);
  },

  map: (input: unknown, output: unknown): LangfuseChatML => {
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

    // Use generic mapper with normalized data, caller will set dataSource
    return genericMapper.map(normalizedInput, normalizedOutput);
  },
};
