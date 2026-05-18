import type { NormalizerContext, ProviderAdapter } from "../types";
import {
  removeNullFields,
  stringifyToolResultContent,
  parseMetadata,
  getNestedProperty,
} from "../helpers";

/**
 * AG2 (formerly AutoGen) adapter
 *
 * AG2 v0.11+ emits native OpenTelemetry spans with GenAI semantic conventions.
 * Span types (ag2.span.type): conversation, agent, llm, tool, code_execution,
 * human_input, speaker_selection.
 *
 * Detection:
 * - scope.name containing "autogen" or "ag2"
 * - attributes with "ag2.span.type"
 * - observation name patterns: "conversation ", "invoke_agent ", "chat ",
 *   "execute_tool ", "execute_code ", "speaker_selection"
 *
 * Message format: AG2 uses OpenAI-compatible ChatML via OpenAIWrapper,
 * so LLM span input/output follows OpenAI Chat Completions format.
 * Agent-level spans carry conversation messages as arrays.
 */

// AG2 agent-level messages can have a "name" field for the agent identity
// and use standard OpenAI roles, but may also include AG2-specific fields
function normalizeMessage(msg: unknown): Record<string, unknown> {
  if (!msg || typeof msg !== "object") return {};

  const normalized = removeNullFields(msg);

  // AG2 tool results: content may be an object
  if (
    normalized.role === "tool" &&
    typeof normalized.content === "object" &&
    normalized.content !== null &&
    !Array.isArray(normalized.content)
  ) {
    normalized.content = stringifyToolResultContent(normalized.content);
  }

  // Flatten nested tool_calls format (OpenAI-style {function: {name, arguments}})
  if (normalized.tool_calls && Array.isArray(normalized.tool_calls)) {
    normalized.tool_calls = (normalized.tool_calls as unknown[])
      .filter(
        (tc): tc is Record<string, unknown> =>
          Boolean(tc) && typeof tc === "object",
      )
      .map((tc) => {
        if (tc.function && typeof tc.function === "object") {
          const func = tc.function as Record<string, unknown>;
          return {
            id: tc.id,
            name: func.name,
            arguments:
              typeof func.arguments === "string"
                ? func.arguments
                : JSON.stringify(func.arguments ?? {}),
            type: tc.type || "function",
          };
        }
        return {
          ...tc,
          arguments:
            typeof tc.arguments === "string"
              ? tc.arguments
              : JSON.stringify(tc.arguments ?? {}),
        };
      });
  }

  return normalized;
}

function preprocessData(data: unknown): unknown {
  if (!data) return data;

  // Array of messages
  if (Array.isArray(data)) {
    return data.map(normalizeMessage);
  }

  // Object with messages key
  if (typeof data === "object" && "messages" in data) {
    const obj = data as Record<string, unknown>;
    return {
      ...obj,
      messages: Array.isArray(obj.messages)
        ? obj.messages.map(normalizeMessage)
        : obj.messages,
    };
  }

  // Single message
  if (typeof data === "object" && "role" in data) {
    return [normalizeMessage(data)];
  }

  return data;
}

/** AG2-specific observation name patterns */
const AG2_NAME_PATTERNS = [
  /^conversation\s/,
  /^invoke_agent\s/,
  /^execute_tool\s/,
  /^execute_code\s/,
  /^await_human_input\s/,
  /^speaker_selection$/,
];

export const ag2Adapter: ProviderAdapter = {
  id: "ag2",

  detect(ctx: NormalizerContext): boolean {
    // Explicit framework override
    if (ctx.framework === "ag2" || ctx.framework === "autogen") return true;

    // Check observation name for AG2 patterns (before metadata, as metadata may be absent)
    if (ctx.observationName) {
      for (const pattern of AG2_NAME_PATTERNS) {
        if (pattern.test(ctx.observationName)) return true;
      }
      // "chat <model>" pattern is too generic, only match if combined with other signals
    }

    const meta = parseMetadata(ctx.metadata);
    if (!meta) return false;

    // Check scope.name for autogen or ag2
    const scopeName = getNestedProperty(meta, "scope", "name");
    if (typeof scopeName === "string") {
      const lower = scopeName.toLowerCase();
      if (lower.includes("autogen") || lower.includes("ag2")) return true;
    }

    // Check for ag2.span.type attribute
    const attributes = getNestedProperty(meta, "attributes");
    if (attributes && typeof attributes === "object") {
      const attrs = attributes as Record<string, unknown>;
      if ("ag2.span.type" in attrs) return true;

      // Check for ag2-prefixed attributes
      if (Object.keys(attrs).some((key) => key.startsWith("ag2."))) return true;
    }

    return false;
  },

  preprocess(
    data: unknown,
    _kind: "input" | "output",
    _ctx: NormalizerContext,
  ): unknown {
    return preprocessData(data);
  },
};
