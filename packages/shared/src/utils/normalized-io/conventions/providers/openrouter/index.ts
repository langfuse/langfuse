import { asRecord } from "../../../core/utils/json";
import type {
  IOConvention,
  MessageSource,
  ToolDefinitionCarrier,
  ToolDefinitionSource,
} from "../../io-convention";

/**
 * OpenRouter Broadcast convention. Broadcast forwards every request
 * OpenRouter serves as a generation whose output is a response envelope
 * rather than a message: `{ completion, reasoning, toolCalls, tools?,
 * rawRequest }`. `completion` is the assistant text (an empty string when the
 * model only called tools), `reasoning` the visible reasoning text,
 * `toolCalls` the Chat Completions call entries, and `rawRequest` the echoed
 * request parameters. The request tools sit either beside the envelope as
 * `tools` (read by the generic root carrier) or under `rawRequest.tools`.
 *
 * The envelope has no `role`/`content`, and `completion` alone is too generic
 * a key to claim, so recognition requires the whole signature.
 */
function broadcastRawRequest(
  root: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if ("role" in root || "content" in root) return undefined;
  if (!("completion" in root) || !Array.isArray(root.toolCalls)) {
    return undefined;
  }
  return asRecord(root.rawRequest);
}

// Not `typeof === "string"`: a caller that deep-parses the payload before
// normalizing hands over a JSON-mode `completion` as a structured value, which
// the shared text handler keeps as a data part.
const isPresent = (value: unknown): boolean =>
  value !== undefined && value !== null && value !== "";

function openRouterMessages(
  root: Record<string, unknown>,
  kind: "input" | "output",
): MessageSource[] {
  if (kind !== "output" || !broadcastRawRequest(root)) return [];

  // Rebuilt as a message with typed content blocks so the shared part
  // handlers own text, reasoning and tool-call normalization. `rawRequest`
  // is request echo, not conversation content, and is left out.
  const content: unknown[] = [];
  if (isPresent(root.reasoning)) {
    content.push({ type: "reasoning", text: root.reasoning });
  }
  if (isPresent(root.completion)) {
    content.push({ type: "text", text: root.completion });
  }

  return [
    {
      kind: "single",
      value: { role: "assistant", content, toolCalls: root.toolCalls },
      fallbackRole: "assistant",
    },
  ];
}

function openRouterToolDefinitionSources(
  carrier: ToolDefinitionCarrier,
): ToolDefinitionSource[] {
  const rawRequest = carrier.root && broadcastRawRequest(carrier.root);
  if (rawRequest?.tools === undefined) return [];

  return [
    {
      sourceKey: "rawRequest.tools",
      value: rawRequest.tools,
      options: { allowProviderToolWithoutName: true },
    },
  ];
}

export const openRouterProvider = {
  name: "openrouter",
  claimMessages: openRouterMessages,
  collectToolDefinitionSources: openRouterToolDefinitionSources,
} satisfies IOConvention;
