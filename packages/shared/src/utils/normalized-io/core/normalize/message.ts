import type {
  MessageEnvelopeContext,
  PartHandlerContext,
  SiblingPartContribution,
  SiblingPartSlot,
} from "../../conventions/io-convention";
import { isMessageLike, isToolDefinitionMessage } from "../utils/format";
import type {
  NormalizedMessage,
  NormalizedMessagePart,
  NormalizedMessageRole,
} from "../../types";
import { asRecord, isRecord, optionalString, parseArray } from "../utils/json";
import { normalizeFinishReason } from "./finish-reason";
import { normalizeMediaPartsFromString } from "./message-parts/media";
import { extractCitations } from "./message-parts/text";
import { normalizePart, normalizePartList } from "./part";
import { coerceRole, normalizeRole } from "./role";
import type { ParserContext } from "../parser-context";
import { providersInOrder } from "../utils/providers";

/** Normalize the content owned by one already-selected message. */
function normalizeMessageContent(
  value: Record<string, unknown>,
  nestedContent: Record<string, unknown> | undefined,
  role: NormalizedMessageRole,
  parserContext: ParserContext,
): NormalizedMessagePart[] {
  const rawParts = Array.isArray(value.parts)
    ? value.parts
    : Array.isArray(value.content)
      ? value.content
      : Array.isArray(nestedContent?.parts)
        ? nestedContent.parts
        : undefined;
  if (rawParts) return normalizePartList(rawParts, parserContext);

  if (typeof value.content === "string" && value.content.length > 0) {
    // Koog can serialize an assistant tool-call batch into a string under a
    // tool-role message. Only treat it as parts when every item is a tool.
    const parsedContent = parseArray(value.content);
    if (parsedContent?.length) {
      const parsedParts = parsedContent.map((part) =>
        normalizePart(part, parserContext),
      );
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
    const part = normalizePart(value.content, parserContext);
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
  parserContext: ParserContext,
): void {
  const partContext: PartHandlerContext = {
    normalizePart: (part) => normalizePart(part, parserContext),
    normalizePartList: (values) => normalizePartList(values, parserContext),
  };
  const contributions: SiblingPartContribution[] = [];
  for (const provider of providersInOrder(parserContext.preferredProvider)) {
    const siblingParts = provider.collectSiblingParts?.(
      value,
      parts,
      partContext,
    );
    if (siblingParts?.length) contributions.push(...siblingParts);
  }

  // One message can expose the same call through native content and one or
  // more framework sibling fields. Claim it in the first carrier only. This
  // is deliberately message-local: identical calls in other turns survive.
  const claimedCarrierByToolCall = new Map<string, string>();
  const claimKey = (part: NormalizedMessagePart): string | undefined => {
    if (part.type !== "tool-call") return undefined;
    if (part.toolCallId) return `id:${part.toolCallId}`;
    try {
      return `value:${part.toolName}:${JSON.stringify(part.input)}`;
    } catch {
      return undefined;
    }
  };
  const claimCarrierParts = (
    carrier: string,
    carrierParts: NormalizedMessagePart[],
  ) =>
    carrierParts.filter((part) => {
      const key = claimKey(part);
      if (!key) return true;
      const claimedCarrier = claimedCarrierByToolCall.get(key);
      if (claimedCarrier && claimedCarrier !== carrier) return false;
      if (!claimedCarrier) claimedCarrierByToolCall.set(key, carrier);
      return true;
    });

  for (const part of parts) {
    const key = claimKey(part);
    if (key && !claimedCarrierByToolCall.has(key)) {
      claimedCarrierByToolCall.set(key, "content");
    }
  }

  const bySlot = (slot: SiblingPartSlot) =>
    contributions
      .filter((contribution) => contribution.slot === slot)
      .flatMap((contribution) =>
        claimCarrierParts(contribution.sourceKey, contribution.parts),
      );

  parts.unshift(...bySlot("before-content"));
  parts.push(...bySlot("after-content"));
  for (const key of ["tool_calls", "toolCalls"]) {
    parts.push(
      ...claimCarrierParts(
        key,
        normalizePartList(parseArray(value[key]) ?? [], parserContext),
      ),
    );
  }
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
  parserContext: ParserContext,
): NormalizedMessage | null {
  const { source } = parserContext;
  if (typeof value === "string") {
    if (value.length === 0) return null;
    for (const provider of providersInOrder(parserContext.preferredProvider)) {
      const preProcessed = provider.tryPreprocessMessage?.(value);
      if (preProcessed?.matched) {
        return preProcessed.value === null
          ? null
          : normalizeMessage(preProcessed.value, fallbackRole, parserContext);
      }
    }
    const parts = normalizeMediaPartsFromString(value);
    return parts.length > 0 ? { role: fallbackRole, parts, source } : null;
  }
  if (!isRecord(value) || isToolDefinitionMessage(value)) return null;

  const envelopeContext: MessageEnvelopeContext = {
    source,
    normalizeMessage: (nestedValue, nestedFallbackRole) =>
      normalizeMessage(nestedValue, nestedFallbackRole, parserContext),
    isMessageLike,
    normalizeFinishReason,
  };
  for (const provider of providersInOrder(parserContext.preferredProvider)) {
    const unwrapped = provider.tryUnwrapMessage?.(
      value,
      fallbackRole,
      envelopeContext,
    );
    if (unwrapped?.matched) return unwrapped.value;
  }

  // Standalone tool-call/result values (no message keys): normalize once,
  // inspect the result, rather than shape-probing before normalizing.
  const directPart = !isMessageLike(value)
    ? normalizePart(value, parserContext)
    : null;
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
  const recognizedRole = normalizeRole(value);
  let role =
    recognizedRole ??
    (nestedContent ? normalizeRole(nestedContent) : undefined) ??
    fallbackRole;

  const parts = normalizeMessageContent(
    value,
    nestedContent,
    role,
    parserContext,
  );
  applySiblingFields(value, parts, parserContext);
  role = coerceRole(role, value, parts);

  // Last resort for non-message payloads (function-span args/results, plain
  // records, {text} items): represent them instead of dropping — the trace
  // view renders these as JSON too.
  if (parts.length === 0 && !isMessageLike(value)) {
    const part = normalizePart(value, parserContext);
    if (part) parts.push(part);
  }

  // Choice/candidate-level values are wired in by the accumulator collector.
  const finishReason = normalizeFinishReason(
    value,
    asRecord(value.response_metadata), // langchain
  );

  // Sender identity: an explicit participant name, or — for unrecognized
  // declared roles (e.g. LangGraph putting the agent name in the role field)
  // — the raw role string, so the identity survives the role fallback.
  const declaredRole = optionalString(value.role ?? value.author);
  const senderName =
    optionalString(value.name) ??
    (recognizedRole === undefined ? declaredRole : undefined);

  return parts.length > 0
    ? {
        ...(optionalString(value.id) ? { id: String(value.id) } : {}),
        ...(senderName ? { senderName } : {}),
        role,
        parts,
        ...(finishReason ? { finishReason } : {}),
        source,
      }
    : null;
}
