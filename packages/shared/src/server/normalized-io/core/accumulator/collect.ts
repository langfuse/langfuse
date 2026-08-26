import { registeredProviders } from "../../conventions";
import type { RootMessageSource } from "../../conventions/IOConvention";
import { asRecord, parseRecord } from "../utils/json";
import type { NormalizedMessagePart } from "../../types";
import { addMessage, addToolDefinitionValue } from "./helpers";
import type { NormalizedIOAccumulator } from "./interface";
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

export type CollectContext =
  | { kind: "io"; source: "input" | "output" }
  | { kind: "metadata" };

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
  source: "input" | "output",
  accumulator: NormalizedIOAccumulator,
): void {
  const standaloneToolCalls: NormalizedMessagePart[] = [];

  const flushStandaloneToolCalls = () => {
    if (standaloneToolCalls.length === 0) return;
    addMessage(accumulator, {
      role: "assistant",
      parts: standaloneToolCalls.splice(0),
      source,
    });
  };

  for (const value of values) {
    const record = asRecord(value);
    if (record) collectToolDefinitionsFromRecord(record, accumulator);

    // OpenAI Responses tool listings are declarations, not conversation
    // content. Keep them side-band without breaking an adjacent call batch.
    if (record?.type === "mcp_list_tools") continue;

    if (record && !isMessageLike(record)) {
      const part = normalizePart(record);
      if (part?.type === "tool-call") {
        standaloneToolCalls.push(part);
        continue;
      }
    }

    flushStandaloneToolCalls();
    const message = normalizeMessage(value, fallbackRole, source);
    if (message) addMessage(accumulator, message);
  }

  flushStandaloneToolCalls();
}

function emitRootSource(
  rootSource: RootMessageSource,
  source: "input" | "output",
  accumulator: NormalizedIOAccumulator,
): void {
  if (rootSource.kind === "sequence") {
    collectMessageSequence(
      rootSource.values,
      rootSource.fallbackRole,
      source,
      accumulator,
    );
    return;
  }

  const message = normalizeMessage(
    rootSource.value,
    rootSource.fallbackRole,
    source,
  );
  if (!message) return;

  const finishReason =
    (rootSource.finishReasonCarrier
      ? normalizeFinishReason(rootSource.finishReasonCarrier)
      : undefined) ?? message.finishReason;
  addMessage(accumulator, {
    ...message,
    role: rootSource.roleOverride ?? message.role,
    ...(finishReason ? { finishReason } : {}),
  });
}

function collectRecordMessages(
  parsedValue: ParsedIOValue,
  source: "input" | "output",
  accumulator: NormalizedIOAccumulator,
): void {
  const record = parsedValue.record;
  if (!record) return;

  const fallbackRole = source === "input" ? "user" : "assistant";
  let conversationClaimed = false;

  for (const provider of registeredProviders) {
    const rootSources =
      provider.collectRootMessageSources?.(record, source) ?? [];
    for (const rootSource of rootSources) {
      emitRootSource(rootSource, source, accumulator);
      conversationClaimed ||= rootSource.claimsConversation;
    }
  }

  if (parsedValue.messages) {
    collectMessageSequence(
      parsedValue.messages,
      fallbackRole,
      source,
      accumulator,
    );
    conversationClaimed = true;
  }

  // Google ADK stores the input message beside the event payload.
  const newMessage = asRecord(record.new_message);
  if (source === "input" && newMessage) {
    collectToolDefinitionsFromRecord(newMessage, accumulator);
    const message = normalizeMessage(newMessage, "user", source);
    if (message) addMessage(accumulator, message);
    conversationClaimed = true;
  }

  // Rule 1: when no nested source claims the conversation, the record is the
  // message. Rule 2: a message/tool-shaped record is also a message even when
  // it contains nested sources. Normalize once, then inspect the result.
  const recordMessage = normalizeMessage(record, fallbackRole, source);
  const hasToolPart = recordMessage?.parts.some(
    (part) => part.type === "tool-call" || part.type === "tool-result",
  );
  if (
    recordMessage &&
    (!conversationClaimed || isMessageLike(record) || hasToolPart)
  ) {
    addMessage(accumulator, recordMessage);
  }
}

export function collect(
  parsedValue: ParsedIOValue,
  context: CollectContext,
  accumulator: NormalizedIOAccumulator,
): void {
  if (context.kind === "metadata") {
    if (parsedValue.record) {
      collectMetadataToolDefinitions(parsedValue.record, accumulator);
    }
    return;
  }

  const { source } = context;
  const fallbackRole = source === "input" ? "user" : "assistant";

  if (Array.isArray(parsedValue.value)) {
    collectMessageSequence(
      parsedValue.messages ?? parsedValue.value,
      fallbackRole,
      source,
      accumulator,
    );
    return;
  }

  if (parsedValue.record) {
    collectRootToolDefinitions(parsedValue.record, accumulator);
    collectRecordMessages(parsedValue, source, accumulator);
    return;
  }

  const message = normalizeMessage(parsedValue.value, fallbackRole, source);
  if (message) addMessage(accumulator, message);
}
