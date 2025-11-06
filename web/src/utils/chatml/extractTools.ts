import { z } from "zod/v4";
import { OpenAIToolSchema } from "@langfuse/shared";
import type { PlaygroundTool } from "@/src/features/playground/page/types";
import { extractAdditionalInput } from "./core";

/**
 * Extracts tool definitions from various LLM input formats.
 * Supports OpenAI, LangChain, and Microsoft Agent Framework formats.
 * Note: Gemini tools come from config.tools, extracted by the Gemini adapter during preprocessing.
 *
 * @param input - Parsed input object (messages array or object with messages)
 * @param metadata - Optional metadata object that may contain tool definitions
 * @returns Array of PlaygroundTool objects with id, name, description, and parameters
 */
export function extractTools(
  input: unknown,
  metadata?: unknown,
): PlaygroundTool[] {
  // Microsoft Agent Framework: tools in metadata.attributes["gen_ai.tool.definitions"]
  if (metadata && typeof metadata === "object" && metadata !== null) {
    const meta = metadata as Record<string, unknown>;
    if (meta.attributes && typeof meta.attributes === "object") {
      const attributes = meta.attributes as Record<string, unknown>;
      const toolDefs = attributes["gen_ai.tool.definitions"];
      if (toolDefs && Array.isArray(toolDefs)) {
        const parsedTools = z.array(OpenAIToolSchema).safeParse(toolDefs);
        if (parsedTools.success) {
          return parsedTools.data.map((tool) => ({
            id: Math.random().toString(36).substring(2),
            ...tool.function,
          }));
        }
      }
    }
  }

  if (!input) return [];

  // LangChain format: tools in additional.tools field
  const additionalInput = extractAdditionalInput(input);
  if (additionalInput?.tools && Array.isArray(additionalInput.tools)) {
    return additionalInput.tools.map((tool: any) => ({
      id: Math.random().toString(36).substring(2),
      name: tool.name || tool.function?.name,
      description: tool.description || tool.function?.description,
      parameters: tool.parameters || tool.function?.parameters,
    }));
  }

  // OpenAI format: tools in input.tools field
  if (typeof input === "object" && input !== null && "tools" in input) {
    const parsedTools = z
      .array(OpenAIToolSchema)
      .safeParse((input as Record<string, unknown>)["tools"]);

    if (parsedTools.success) {
      return parsedTools.data.map((tool) => ({
        id: Math.random().toString(36).substring(2),
        ...tool.function,
      }));
    }
  }

  // LangChain format: tool definitions embedded in messages array
  if (Array.isArray(input)) {
    const toolMessages = input.filter(
      (msg: any) =>
        msg &&
        typeof msg === "object" &&
        msg.role === "tool" &&
        typeof msg.content === "object" &&
        msg.content?.type === "function" &&
        msg.content?.function,
    );

    if (toolMessages.length > 0) {
      const toolDefs = toolMessages.map((msg: any) => msg.content);
      const parsedTools = z.array(OpenAIToolSchema).safeParse(toolDefs);

      if (parsedTools.success) {
        return parsedTools.data.map((tool) => ({
          id: Math.random().toString(36).substring(2),
          ...tool.function,
        }));
      }
    }
  }

  // Also check messages field within input object (LangChain nested format)
  if (
    typeof input === "object" &&
    input !== null &&
    "messages" in input &&
    Array.isArray((input as Record<string, unknown>).messages)
  ) {
    const messages = (input as Record<string, unknown>).messages as unknown[];
    const toolMessages = messages.filter(
      (msg: any) =>
        msg &&
        typeof msg === "object" &&
        msg.role === "tool" &&
        typeof msg.content === "object" &&
        msg.content?.type === "function" &&
        msg.content?.function,
    );

    if (toolMessages.length > 0) {
      const toolDefs = toolMessages.map((msg: any) => msg.content);
      const parsedTools = z.array(OpenAIToolSchema).safeParse(toolDefs);

      if (parsedTools.success) {
        return parsedTools.data.map((tool) => ({
          id: Math.random().toString(36).substring(2),
          ...tool.function,
        }));
      }
    }
  }

  return [];
}
