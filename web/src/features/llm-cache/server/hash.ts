import { createHash } from "crypto";

/**
 * Generates a deterministic cache key from an OpenAI-compatible chat completion request.
 * Hashes: model + messages + tools (names/schemas only) + key model params.
 */
export function hashLLMRequest(body: Record<string, unknown>): string {
  const normalized: Record<string, unknown> = {};

  // Model
  if (body.model) normalized.model = body.model;

  // Messages — include role + content (strip metadata)
  if (Array.isArray(body.messages)) {
    normalized.messages = body.messages.map((msg: Record<string, unknown>) => ({
      role: msg.role,
      content: msg.content,
      ...(msg.tool_call_id ? { tool_call_id: msg.tool_call_id } : {}),
      ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}),
      ...(msg.name ? { name: msg.name } : {}),
    }));
  }

  // Tools — include name + schema, not implementations
  if (Array.isArray(body.tools)) {
    normalized.tools = body.tools.map((tool: Record<string, unknown>) => ({
      type: tool.type,
      function: tool.function,
    }));
  }

  // Key model params that affect output
  if (body.temperature !== undefined)
    normalized.temperature = body.temperature;
  if (body.top_p !== undefined) normalized.top_p = body.top_p;
  if (body.max_tokens !== undefined)
    normalized.max_tokens = body.max_tokens;
  if (body.response_format !== undefined)
    normalized.response_format = body.response_format;

  const canonical = JSON.stringify(normalized, Object.keys(normalized).sort());
  return createHash("sha256").update(canonical).digest("hex");
}
