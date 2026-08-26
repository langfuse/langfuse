import { registeredProviders } from "../conventions";
import type {
  MessageEnvelopeContext,
  PartHandlerContext,
  SiblingPartSlot,
} from "../conventions/IOConvention";
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
} from "../json";
import type {
  NormalizedMessage,
  NormalizedMessagePart,
  NormalizedMessageRole,
  ToolResultPart,
} from "../types";
import { normalizeFinishReason } from "./finishReason";
import { normalizePartsFromString } from "./media";
import {
  extractCitations,
  isToolPartValue,
  normalizeMessagePart,
  normalizeParts,
} from "./parts";

/**
 * Message skeleton: envelope unwrap -> role resolution -> content collection
 * -> sibling-field folds -> role coercion -> finish reason -> assembly.
 * Provider-owned pieces are folds over `registeredProviders`; everything
 * else here is generic mechanics or a named, owner-commented residual.
 */

/** `role`/`content` are the universal message keys; every other container
 * key is provider vocabulary contributed via `messageLikeKeys`. */
export function isMessageLike(value: Record<string, unknown>): boolean {
  if ("role" in value || "content" in value) return true;
  return registeredProviders.some((provider) => {
    for (const key of provider.messageLikeKeys ?? []) {
      if (key in value) return true;
    }
    return false;
  });
}

const CANONICAL_ROLES = new Set([
  "system",
  "developer", // openai
  "user",
  "assistant",
  "tool",
]);

function normalizeRole(
  message: Record<string, unknown>,
): NormalizedMessageRole | undefined {
  const rawRole = message.role ?? message.author; // author: gemini/PaLM-era
  if (typeof rawRole === "string") {
    const lowered = rawRole.toLowerCase();
    for (const provider of registeredProviders) {
      const role = provider.roleByRawRole?.[lowered];
      if (role) return role;
    }
    if (CANONICAL_ROLES.has(lowered)) return lowered as NormalizedMessageRole;
    return "unknown";
  }

  if (typeof message.type !== "string") return undefined;
  for (const provider of registeredProviders) {
    const role = provider.roleByMessageType?.[message.type];
    if (role) return role;
  }
  return undefined;
}

/** Tool-definition messages fold: shapes only a convention can recognize. */
export function isToolDefinitionMessage(
  message: Record<string, unknown>,
): boolean {
  return registeredProviders.some(
    (provider) => provider.isToolDefinitionMessage?.(message) ?? false,
  );
}

function appendParts(target: NormalizedMessagePart[], values: unknown[]): void {
  target.push(...normalizeParts(values));
}

/** Parts from the message's own content (parts/content array, string, record). */
function collectContentParts(
  value: Record<string, unknown>,
  nestedContent: Record<string, unknown> | undefined,
  role: NormalizedMessageRole,
  parts: NormalizedMessagePart[],
): void {
  if (role === "tool" && value.tool_call_id) {
    // OpenAI Chat Completions tool message + LangChain ToolMessage (status
    // marks failed executions; artifact is side-band data).
    parts.push(
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
    );
    return;
  }

  const rawParts = Array.isArray(value.parts) // gemini, ai sdk
    ? value.parts
    : Array.isArray(value.content) // openai, anthropic
      ? value.content
      : Array.isArray(nestedContent?.parts) // gemini candidates
        ? nestedContent.parts
        : undefined;
  if (rawParts) {
    appendParts(parts, rawParts);
  } else if (typeof value.content === "string" && value.content.length > 0) {
    // Content that is a JSON-string array of tool parts (e.g. koog logs an
    // assistant call batch as a stringified array under role "tool").
    const parsedContent = parseArray(value.content);
    const isToolPartArray =
      parsedContent !== undefined &&
      parsedContent.length > 0 &&
      parsedContent.every((item) => isRecord(item) && isToolPartValue(item));
    if (isToolPartArray) {
      appendParts(parts, parsedContent);
    } else {
      parts.push(...normalizePartsFromString(value.content));
    }
  } else if (isRecord(value.content)) {
    const part = normalizeMessagePart(value.content);
    if (part) parts.push(part);
  }
}

/**
 * Parts and part mutations from fields that live beside `content`. The
 * generic `tool_calls`/`toolCalls` array is universal (OpenAI, LangChain,
 * AI-SDK-flavored logging); everything else folds through
 * `collectSiblingParts`, then message-level citations attach (Chat
 * Completions carries them on the message; Anthropic/Responses carry them
 * per part, handled in `core/parts.ts`).
 */
function applySiblingFields(
  value: Record<string, unknown>,
  parts: NormalizedMessagePart[],
): void {
  const partContext: PartHandlerContext = {
    normalizePart: normalizeMessagePart,
    normalizeParts,
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
  appendParts(
    parts,
    parseArray(value.tool_calls) ?? parseArray(value.toolCalls) ?? [],
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

/**
 * Role corrections that depend on the collected parts: user turns holding
 * only tool results are tool turns; tool-labeled turns without a
 * tool_call_id (koog/Traceloop-style conversions) are either mislabeled
 * assistant call batches or tool responses (the content IS the result).
 */
function coerceRole(
  role: NormalizedMessageRole,
  value: Record<string, unknown>,
  parts: NormalizedMessagePart[],
): NormalizedMessageRole {
  if (
    role === "user" &&
    parts.length > 0 &&
    parts.every((part) => part.type === "tool-result")
  ) {
    return "tool";
  }

  if (role === "tool" && !value.tool_call_id && parts.length > 0) {
    // Explicit boolean return type: TS would otherwise infer a type
    // predicate and narrow `parts` to TextPart[], rejecting the splice.
    if (parts.every((part): boolean => part.type === "tool-call")) {
      return "assistant";
    }
    if (parts.every((part): boolean => part.type === "text")) {
      const output = parts
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("\n");
      parts.splice(0, parts.length, {
        type: "tool-result",
        toolCallId: null,
        output,
      });
    }
  }

  return role;
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
    const parts = normalizePartsFromString(value);
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
  const directPart = !isMessageLike(value) ? normalizeMessagePart(value) : null;
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

  const parts: NormalizedMessagePart[] = [];
  collectContentParts(value, nestedContent, role, parts);
  applySiblingFields(value, parts);
  role = coerceRole(role, value, parts);

  // Last resort for non-message payloads (function-span args/results, plain
  // records, {text} items): represent them instead of dropping — the trace
  // view renders these as JSON too.
  if (parts.length === 0 && !isMessageLike(value)) {
    const part = normalizeMessagePart(value);
    if (part) parts.push(part);
  }

  // Choice/candidate-level values are wired in by core/containers.ts.
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
