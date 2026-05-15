import {
  extractAdditionalInput,
  normalizeToolDefinitionsForChatMl,
} from "@langfuse/shared";
import type { PlaygroundTool } from "@/src/features/playground/page/types";

const EMPTY_TOOL_PARAMETERS = {
  type: "object",
  properties: {},
} as const;

/**
 * Helper to map normalized tool definitions to PlaygroundTool format.
 * Ensures description is always a string (never null/undefined).
 */
function mapToolsToPlayground(tools: unknown): PlaygroundTool[] {
  return normalizeToolDefinitionsForChatMl(tools).map((tool) => ({
    id: Math.random().toString(36).substring(2),
    name: tool.name as string,
    description: typeof tool.description === "string" ? tool.description : "",
    parameters:
      tool.parameters &&
      typeof tool.parameters === "object" &&
      !Array.isArray(tool.parameters)
        ? tool.parameters
        : EMPTY_TOOL_PARAMETERS,
  }));
}

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
  // Check metadata for tool definitions
  if (metadata && typeof metadata === "object" && metadata !== null) {
    const meta = metadata as Record<string, unknown>;
    if (meta.attributes && typeof meta.attributes === "object") {
      const attributes = meta.attributes as Record<string, unknown>;

      // Microsoft Agent Framework: tools in "gen_ai.tool.definitions"
      const toolDefs = attributes["gen_ai.tool.definitions"];
      if (toolDefs) {
        const tools = mapToolsToPlayground(toolDefs);
        if (tools.length > 0) return tools;
      }

      // OpenTelemetry semantic convention: tools indexed as "llm.tools.{N}.tool.json_schema"
      // Example: "llm.tools.0.tool.json_schema", "llm.tools.1.tool.json_schema", ...
      const toolKeys = Object.keys(attributes).filter((key) =>
        /^llm\.tools\.\d+\.tool\.json_schema$/.test(key),
      );
      if (toolKeys.length > 0) {
        const toolDefs = toolKeys.map((key) => attributes[key]);
        const tools = mapToolsToPlayground(toolDefs);
        if (tools.length > 0) return tools;
      }
    }
  }

  if (!input) return [];

  // ChatML normalized format: tools attached to messages (from OpenAI Agents/Responses API)
  // After preprocessing, tools are attached to each message
  if (Array.isArray(input)) {
    const firstMessageWithTools = input.find(
      (msg: any) =>
        msg &&
        typeof msg === "object" &&
        msg.tools &&
        Array.isArray(msg.tools) &&
        msg.tools.length > 0,
    );
    if (firstMessageWithTools && Array.isArray(firstMessageWithTools.tools)) {
      return mapToolsToPlayground(firstMessageWithTools.tools);
    }
  }

  // LangChain format: tools in additional.tools field
  const additionalInput = extractAdditionalInput(input);
  if (additionalInput?.tools && Array.isArray(additionalInput.tools)) {
    return mapToolsToPlayground(additionalInput.tools);
  }

  // OpenAI format: tools in input.tools field
  if (typeof input === "object" && input !== null && "tools" in input) {
    const tools = mapToolsToPlayground(
      (input as Record<string, unknown>)["tools"],
    );
    if (tools.length > 0) return tools;
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
      const tools = mapToolsToPlayground(toolDefs);
      if (tools.length > 0) return tools;
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
      const tools = mapToolsToPlayground(toolDefs);
      if (tools.length > 0) return tools;
    }
  }

  return [];
}
