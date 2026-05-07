import type { NormalizerContext, ProviderAdapter } from "../types";
import { parseMetadata, getNestedProperty, removeNullFields } from "../helpers";

/**
 * Semantic Kernel Adapter
 *
 * Microsoft Semantic Kernel wraps message content in `gen_ai.event.content` as a JSON string.
 * Detection is based on scope.name starting with "Microsoft.SemanticKernel".
 *
 * Input format:
 * [{
 *   "role": "system",
 *   "gen_ai.event.content": "{\"role\":\"system\",\"content\":\"...\",\"tool_calls\":[]}",
 *   "gen_ai.system": "openai"
 * }]
 *
 * Output format:
 * {
 *   "gen_ai.event.content": "{\"index\":0,\"message\":{\"role\":\"Assistant\",\"content\":\"...\"},\"finish_reason\":\"Stop\"}"
 * }
 */

/**
 * Parse gen_ai.event.content JSON string and extract normalized message
 */
function parseEventContent(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== "object") return null;

    // Handle output format with nested message: {index, message: {...}, finish_reason}
    if ("message" in parsed && typeof parsed.message === "object") {
      return parsed.message as Record<string, unknown>;
    }

    // Handle input format: {role, content, tool_calls, name}
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Normalize role casing: "Assistant" -> "assistant"
 */
function normalizeRole(role: unknown): string {
  if (typeof role !== "string") return "assistant";
  return role.toLowerCase();
}

/**
 * Normalize a single Semantic Kernel message
 */
function normalizeMessage(msg: unknown): Record<string, unknown> {
  if (!msg || typeof msg !== "object") return {};

  const message = msg as Record<string, unknown>;

  // If has gen_ai.event.content, parse and extract
  if (typeof message["gen_ai.event.content"] === "string") {
    const inner = parseEventContent(message["gen_ai.event.content"]);
    if (inner) {
      const normalized: Record<string, unknown> = {
        role: normalizeRole(inner.role),
      };

      // Extract content
      if (inner.content !== null && inner.content !== undefined) {
        normalized.content = inner.content;
      }

      // Extract tool_calls if present and non-empty
      if (Array.isArray(inner.tool_calls) && inner.tool_calls.length > 0) {
        normalized.tool_calls = inner.tool_calls;
      }

      // Extract name if present
      if (inner.name !== null && inner.name !== undefined) {
        normalized.name = inner.name;
      }

      return removeNullFields(normalized);
    }
  }

  // Fallback: return as-is without OTel fields
  const {
    "gen_ai.event.content": _content,
    "gen_ai.system": _system,
    ...rest
  } = message;
  return removeNullFields(rest);
}

function normalizeMessages(data: unknown[]): unknown[] {
  return data.map(normalizeMessage);
}

function preprocessData(data: unknown, _ctx: NormalizerContext): unknown {
  if (!data) return data;

  // Array of messages (input format)
  if (Array.isArray(data)) {
    return normalizeMessages(data);
  }

  // Single object with gen_ai.event.content (output format)
  if (typeof data === "object" && "gen_ai.event.content" in data) {
    const normalized = normalizeMessage(data);
    // Wrap single message in array for consistency
    return [normalized];
  }

  // Object with messages key
  if (typeof data === "object" && "messages" in data) {
    const obj = data as Record<string, unknown>;
    return {
      ...obj,
      messages: Array.isArray(obj.messages)
        ? normalizeMessages(obj.messages)
        : obj.messages,
    };
  }

  // Single message object with role
  if (typeof data === "object" && "role" in data) {
    return normalizeMessage(data);
  }

  return data;
}

export const semanticKernelAdapter: ProviderAdapter = {
  id: "semantic-kernel",

  detect(ctx: NormalizerContext): boolean {
    // Explicit framework override
    if (ctx.framework === "semantic-kernel") return true;

    // Detect by scope name (Microsoft.SemanticKernel.Diagnostics)
    // gen_ai.event.content is Semantic Kernel-specific, so we require scope name
    const meta = parseMetadata(ctx.metadata);
    const scopeName = getNestedProperty(meta, "scope", "name");

    return (
      typeof scopeName === "string" &&
      scopeName.startsWith("Microsoft.SemanticKernel")
    );
  },

  preprocess(
    data: unknown,
    _kind: "input" | "output",
    ctx: NormalizerContext,
  ): unknown {
    return preprocessData(data, ctx);
  },
};
