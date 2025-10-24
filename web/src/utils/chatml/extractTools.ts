import { z } from "zod/v4";
import { OpenAIToolSchema } from "@langfuse/shared";
import type { PlaygroundTool } from "@/src/features/playground/page/types";
import { extractGeminiToolDefinitions } from "./adapters/gemini";
import { extractAdditionalInput } from "./core";

/**
 * Extracts tool definitions from various LLM input formats.
 * Supports OpenAI, LangChain, and Gemini formats.
 *
 * @param input - Parsed input object (messages array or object with messages)
 * @returns Array of PlaygroundTool objects with id, name, description, and parameters
 */
export function extractTools(input: unknown): PlaygroundTool[] {
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

  // Gemini format: tool definitions embedded in messages array
  if (Array.isArray(input)) {
    const geminiTools = extractGeminiToolDefinitions(input);
    if (geminiTools.length > 0) {
      return geminiTools.map((tool) => ({
        id: Math.random().toString(36).substring(2),
        ...tool,
      }));
    }
  }

  // Also check messages field within input object (Gemini nested format)
  if (
    typeof input === "object" &&
    input !== null &&
    "messages" in input &&
    Array.isArray((input as Record<string, unknown>).messages)
  ) {
    const geminiTools = extractGeminiToolDefinitions(
      (input as Record<string, unknown>).messages as unknown[],
    );
    if (geminiTools.length > 0) {
      return geminiTools.map((tool) => ({
        id: Math.random().toString(36).substring(2),
        ...tool,
      }));
    }
  }

  return [];
}
