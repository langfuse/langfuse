import { registeredProviders } from "../../conventions";
import type { MessageSource } from "../../conventions/io-convention";
import { asRecord, parseIfString, parseRecord } from "../utils/json";
import type { NormalizedMessage, NormalizedMessagePart } from "../../types";
import { addMessage, addToolDefinitionValue } from "./helpers";
import type { NormalizedIOAccumulator } from "./interface";
import type { ParserContext } from "../parser-context";
import {
  normalizePart,
  normalizeMessage,
  normalizeFinishReason,
} from "../normalize";
import { isMessageLike, isToolDefinitionMessage } from "../utils/format";

export type ParsedIOValue = {
  value: unknown;
  record?: Record<string, unknown>;
  messages?: unknown[];
};

function collectToolDefinitionsFromRecord(
  record: Record<string, unknown>,
  accumulator: NormalizedIOAccumulator,
): void {
  addToolDefinitionValue(accumulator, record.tools, {
    allowProviderToolWithoutName: true,
    allowToolMap: true,
  });

  if (isToolDefinitionMessage(record)) {
    addToolDefinitionValue(accumulator, record.content);
  }
}

function collectRootToolDefinitions(
  root: Record<string, unknown>,
  accumulator: NormalizedIOAccumulator,
): void {
  collectToolDefinitionsFromRecord(root, accumulator);

  // Definitions are independent of the message claim. A record can contain
  // an OpenAI `choices` carrier and, next to it, a framework `messages` or
  // `contents` carrier with additional declarations. Inspect only these
  // known carrier boundaries; do not recursively walk arbitrary payloads.
  for (const key of [
    "messages",
    "choices",
    "candidates",
    "contents",
    "output",
    "new_message",
  ]) {
    const parsed = parseIfString(root[key]);
    const candidate = parseRecord(parsed);
    const values = Array.isArray(parsed)
      ? parsed
      : candidate
        ? [candidate]
        : [];
    for (const value of values) {
      const record = asRecord(value);
      if (!record) continue;
      collectToolDefinitionsFromRecord(record, accumulator);
      for (const nestedKey of ["message", "content", "parts"]) {
        const nested = parseRecord(record[nestedKey]);
        if (nested) collectToolDefinitionsFromRecord(nested, accumulator);
      }
    }
  }

  for (const provider of registeredProviders) {
    const sources = provider.collectToolDefinitionSources?.({ root }) ?? [];
    for (const source of sources) {
      addToolDefinitionValue(accumulator, source.value, source.options);
    }
  }
}

function collectMetadataToolDefinitions(
  metadata: Record<string, unknown>,
  accumulator: NormalizedIOAccumulator,
): void {
  addToolDefinitionValue(accumulator, metadata.tools);

  const attributes = parseRecord(metadata.attributes);
  if (!attributes) return;

  addToolDefinitionValue(accumulator, attributes.tools);
  for (const provider of registeredProviders) {
    const sources =
      provider.collectToolDefinitionSources?.({
        metadataAttributes: attributes,
      }) ?? [];
    for (const source of sources) {
      addToolDefinitionValue(accumulator, source.value, source.options);
    }
  }
}

function collectMessageSequence(
  values: unknown[],
  fallbackRole: "user" | "assistant",
  parserContext: ParserContext,
  messages: NormalizedMessage[],
  accumulator: NormalizedIOAccumulator,
): void {
  const { source } = parserContext;
  const standaloneToolCalls: NormalizedMessagePart[] = [];

  const flushStandaloneToolCalls = () => {
    if (standaloneToolCalls.length === 0) return;
    addMessage(
      messages,
      {
        role: "assistant",
        parts: standaloneToolCalls.splice(0),
        source,
      },
      parserContext,
    );
  };

  for (const value of values) {
    const record = asRecord(value);
    if (record) collectToolDefinitionsFromRecord(record, accumulator);

    // OpenAI Responses tool listings are declarations, not conversation
    // content. Keep them side-band without breaking an adjacent call batch.
    if (record?.type === "mcp_list_tools") continue;

    if (record && !isMessageLike(record)) {
      const part = normalizePart(record, parserContext);
      if (part?.type === "tool-call") {
        standaloneToolCalls.push(part);
        continue;
      }
    }

    flushStandaloneToolCalls();
    const message = normalizeMessage(value, fallbackRole, parserContext);
    if (message) addMessage(messages, message, parserContext);
  }

  flushStandaloneToolCalls();
}

function emitRootSource(
  rootSource: MessageSource,
  parserContext: ParserContext,
  messages: NormalizedMessage[],
  accumulator: NormalizedIOAccumulator,
): void {
  if (rootSource.kind === "sequence") {
    collectMessageSequence(
      rootSource.values,
      rootSource.fallbackRole,
      parserContext,
      messages,
      accumulator,
    );
    return;
  }

  const message = normalizeMessage(
    rootSource.value,
    rootSource.fallbackRole,
    parserContext,
  );
  if (!message) return;

  const finishReason =
    (rootSource.finishReasonCarrier
      ? normalizeFinishReason(rootSource.finishReasonCarrier)
      : undefined) ?? message.finishReason;
  addMessage(
    messages,
    {
      ...message,
      role: rootSource.roleOverride ?? message.role,
      ...(finishReason ? { finishReason } : {}),
    },
    parserContext,
  );
}

function collectRecordMessages(
  parsedValue: ParsedIOValue,
  parserContext: ParserContext,
  accumulator: NormalizedIOAccumulator,
): void {
  const record = parsedValue.record;
  if (!record) return;

  const { source } = parserContext;
  const fallbackRole = source === "input" ? "user" : "assistant";

  const providerClaims = registeredProviders.map((provider) => ({
    provider,
    sources: provider.claimMessages?.(record, source) ?? [],
    systemMessage: provider.getSystemMessage?.(record, source),
  }));
  const selectedClaim = providerClaims.find(
    ({ sources }) => sources.length > 0,
  );

  if (selectedClaim) {
    parserContext.preferredProvider = selectedClaim.provider;
  }

  const messages: NormalizedMessage[] = [];
  const claimedSources = selectedClaim?.sources;

  if (claimedSources && claimedSources.length > 0) {
    for (const rootSource of claimedSources) {
      emitRootSource(rootSource, parserContext, messages, accumulator);
    }
  } else if (parsedValue.messages) {
    collectMessageSequence(
      parsedValue.messages,
      fallbackRole,
      parserContext,
      messages,
      accumulator,
    );
  } else {
    const recordMessage = normalizeMessage(record, fallbackRole, parserContext);
    if (recordMessage) addMessage(messages, recordMessage, parserContext);
  }

  // System instructions supplement the selected input conversation. Defer
  // them until after message normalization so an existing system message
  // suppresses every top-level system sidecar.
  if (source === "input" && !parserContext.hasSystemMessage) {
    const systemMessages: NormalizedMessage[] = [];
    for (const { systemMessage } of providerClaims) {
      if (systemMessage) {
        emitRootSource(
          systemMessage,
          parserContext,
          systemMessages,
          accumulator,
        );
      }
      if (parserContext.hasSystemMessage) break;
    }
    messages.unshift(...systemMessages);
  }

  accumulator.messages.push(...messages);
}

export function collectMetadata(
  parsedValue: ParsedIOValue,
  accumulator: NormalizedIOAccumulator,
): void {
  if (parsedValue.record) {
    collectMetadataToolDefinitions(parsedValue.record, accumulator);
  }
  return;
}

export function collectIO(
  parsedValue: ParsedIOValue,
  context: ParserContext,
  accumulator: NormalizedIOAccumulator,
): void {
  const { source } = context;
  const fallbackRole = source === "input" ? "user" : "assistant";

  if (Array.isArray(parsedValue.value)) {
    collectMessageSequence(
      parsedValue.messages ?? parsedValue.value,
      fallbackRole,
      context,
      accumulator.messages,
      accumulator,
    );
    return;
  }

  if (parsedValue.record) {
    collectRootToolDefinitions(parsedValue.record, accumulator);
    collectRecordMessages(parsedValue, context, accumulator);
    return;
  }

  const message = normalizeMessage(parsedValue.value, fallbackRole, context);
  if (message) addMessage(accumulator.messages, message, context);
}
