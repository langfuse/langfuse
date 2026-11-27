import type { ToolCallPart } from "../../../types";
import {
  compact,
  parseIfString,
  toJsonValue,
  nullableString,
  toProviderMetadata,
} from "../../utils/json";

/**
 * Canonical tool-part constructors. Callers extract their own dialect's
 * fields and pass them here; the flat-sniff fallback in `fallback.ts` and
 * the otel-genai convention keep deliberately loose extractions for shapes
 * whose dialect is unknown.
 */

export type ToolCallFields = {
  /** Raw id value; coerced via nullableString. */
  toolCallId?: unknown;
  /** Must be a non-empty string, otherwise no part is constructed. */
  toolName: unknown;
  /** Raw arguments payload; one JSON-string boundary is parsed. Defaults {}. */
  input?: unknown;
  toolType?: string;
  /** Kept only when a boolean. */
  providerExecuted?: unknown;
};

export function toolCallPart(fields: ToolCallFields): ToolCallPart | null {
  if (typeof fields.toolName !== "string" || fields.toolName.length === 0) {
    return null;
  }

  return compact<ToolCallPart>({
    type: "tool-call",
    toolCallId: nullableString(fields.toolCallId),
    toolName: fields.toolName,
    input: toJsonValue(parseIfString(fields.input ?? {})),
    toolType: fields.toolType,
    providerExecuted:
      typeof fields.providerExecuted === "boolean"
        ? fields.providerExecuted
        : undefined,
  });
}

/**
 * Provider-executed named calls (OpenAI mcp_call, Anthropic server_tool_use /
 * mcp_tool_use): decorates an already-extracted call with providerExecuted
 * and provider-side extras (server_label, server_name, output, error) in
 * providerMetadata.
 */
export function providerExecutedToolCall(
  part: ToolCallPart | null,
  extras?: Record<string, unknown>,
): ToolCallPart | null {
  if (!part) return null;

  return compact<ToolCallPart>({
    ...part,
    providerExecuted: true,
    providerMetadata: extras ? toProviderMetadata(extras) : undefined,
  });
}
