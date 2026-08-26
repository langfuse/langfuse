import { registeredProviders } from "../../conventions";
import type {
  MessageEnvelopeContext,
  PartHandlerContext,
  SiblingPartSlot,
} from "../../conventions/IOConvention";
import { isMessageLike, isToolDefinitionMessage } from "../utils/format";
import type {
  NormalizedMessage,
  NormalizedMessagePart,
  NormalizedMessageRole,
  ToolResultPart,
} from "../../types";
import {
  asRecord,
  compact,
  isRecord,
  nullableString,
  optionalString,
  parseArray,
  parseIfString,
  toJsonValue,
  toProviderMetadata,
} from "../utils/json";
import { normalizeFinishReason } from "./finish-reason";
import { normalizeMediaPartsFromString } from "./message-parts/media";
import { extractCitations } from "./message-parts/text";
import { normalizePart, normalizePartList } from "./part";
import { coerceRole, normalizeRole } from "./role";

/** Normalize the content owned by one already-selected message. */
function normalizeMessageContent(
  value: Record<string, unknown>,
  nestedContent: Record<string, unknown> | undefined,
  role: NormalizedMessageRole,
): NormalizedMessagePart[] {
  if (role === "tool" && value.tool_call_id) {
    // OpenAI Chat Completions tool message + LangChain ToolMessage (status
    // marks failed executions; artifact is side-band data).
    return [
      compact<ToolResultPart>({
        type: "tool-result",
        toolCallId: nullableString(value.tool_call_id),
        output: toJsonValue(parseIfString(value.content ?? null)),
        isError: value.status === "error" ? true : undefined,
        providerMetadata:
          value.artifact !== undefined && value.artifact !== null
            ? toProviderMetadata({ artifact: value.artifact })
            : undefined,
      }),
    ];
  }

  const rawParts = Array.isArray(value.parts)
    ? value.parts
    : Array.isArray(value.content)
      ? value.content
      : Array.isArray(nestedContent?.parts)
        ? nestedContent.parts
        : undefined;
  if (rawParts) return normalizePartList(rawParts);

  if (typeof value.content === "string" && value.content.length > 0) {
    // Koog can serialize an assistant tool-call batch into a string under a
    // tool-role message. Only treat it as parts when every item is a tool.
    const parsedContent = parseArray(value.content);
    if (parsedContent?.length) {
      const parsedParts = parsedContent.map(normalizePart);
      if (
        parsedParts.every(
          (part) => part?.type === "tool-call" || part?.type === "tool-result",
        )
      ) {
        return parsedParts.filter((part) => part !== null);
      }
    }

    return normalizeMediaPartsFromString(value.content);
  }

  if (isRecord(value.content)) {
    const part = normalizePart(value.content);
    return part ? [part] : [];
  }

  return [];
}

/**
 * Parts and part mutations from fields that live beside `content`. The
 * generic `tool_calls`/`toolCalls` array is universal (OpenAI, LangChain,
 * AI-SDK-flavored logging); everything else folds through
 * `collectSiblingParts`, then message-level citations attach (Chat
 * Completions carries them on the message; Anthropic/Responses carry them
 * per part, handled in `normalize/part.ts`).
 */
function applySiblingFields(
  value: Record<string, unknown>,
  parts: NormalizedMessagePart[],
): void {
  const partContext: PartHandlerContext = {
    normalizePart: normalizePart,
    normalizePartList,
  };
  const contributions = [] as Array<{
    slot: SiblingPartSlot;
    parts: NormalizedMessagePart[];
  }>;
  for (const provider of registeredProviders) {
    const siblingParts = provider.collectSiblingParts?.(
      value,
      parts,
      partContext,
    );
    if (siblingParts?.length) contributions.push(...siblingParts);
  }

  const bySlot = (slot: SiblingPartSlot) =>
    contributions
      .filter((contribution) => contribution.slot === slot)
      .flatMap((contribution) => contribution.parts);

  parts.unshift(...bySlot("before-content"));
  parts.push(...bySlot("after-content"));
  parts.push(
    ...normalizePartList(
      parseArray(value.tool_calls) ?? parseArray(value.toolCalls) ?? [],
    ),
  );
  parts.push(...bySlot("after-tool-calls"));

  const citations = extractCitations(value);
  if (citations) {
    const textPart = parts.find((part) => part.type === "text");
    if (textPart) {
      textPart.providerMetadata = { ...textPart.providerMetadata, citations };
    }
  }
}

export function normalizeMessage(
  value: unknown,
  fallbackRole: "user" | "assistant",
  source: "input" | "output",
): NormalizedMessage | null {
  if (typeof value === "string") {
    if (value.length === 0) return null;
    for (const provider of registeredProviders) {
      const preProcessed = provider.tryPreprocessMessage?.(value);
      if (preProcessed?.matched) {
        return preProcessed.value === null
          ? null
          : normalizeMessage(preProcessed.value, fallbackRole, source);
      }
    }
    const parts = normalizeMediaPartsFromString(value);
    return parts.length > 0 ? { role: fallbackRole, parts, source } : null;
  }
  if (!isRecord(value) || isToolDefinitionMessage(value)) return null;

  const envelopeContext: MessageEnvelopeContext = {
    source,
    normalizeMessage: (nestedValue, nestedFallbackRole) =>
      normalizeMessage(nestedValue, nestedFallbackRole, source),
    isMessageLike,
    normalizeFinishReason,
  };
  for (const provider of registeredProviders) {
    const unwrapped = provider.tryUnwrapMessage?.(
      value,
      fallbackRole,
      envelopeContext,
    );
    if (unwrapped?.matched) return unwrapped.value;
  }

  // Standalone tool-call/result values (no message keys): normalize once,
  // inspect the result, rather than shape-probing before normalizing.
  const directPart = !isMessageLike(value) ? normalizePart(value) : null;
  if (
    directPart &&
    (directPart.type === "tool-call" || directPart.type === "tool-result")
  ) {
    return {
      role: directPart.type === "tool-result" ? "tool" : "assistant",
      parts: [directPart],
      source,
    };
  }

  const nestedContent = asRecord(value.content);
  let role =
    normalizeRole(value) ??
    (nestedContent ? normalizeRole(nestedContent) : undefined) ??
    fallbackRole;

  const parts = normalizeMessageContent(value, nestedContent, role);
  applySiblingFields(value, parts);
  role = coerceRole(role, value, parts);

  // Last resort for non-message payloads (function-span args/results, plain
  // records, {text} items): represent them instead of dropping — the trace
  // view renders these as JSON too.
  if (parts.length === 0 && !isMessageLike(value)) {
    const part = normalizePart(value);
    if (part) parts.push(part);
  }

  // Choice/candidate-level values are wired in by the accumulator collector.
  const finishReason = normalizeFinishReason(
    value,
    asRecord(value.response_metadata), // langchain
  );

  // Unrecognized declared roles (e.g. LangGraph putting the tool name in the
  // role field) collapse to "unknown" — keep the raw string as the name so
  // the information survives.
  const declaredRole =
    typeof value.role === "string" ? optionalString(value.role) : undefined;

  return parts.length > 0
    ? {
        ...(optionalString(value.id) ? { id: String(value.id) } : {}),
        ...(optionalString(value.name)
          ? { name: String(value.name) }
          : role === "unknown" && declaredRole
            ? { name: declaredRole }
            : {}),
        role,
        parts,
        ...(finishReason ? { finishReason } : {}),
        source,
      }
    : null;
}
