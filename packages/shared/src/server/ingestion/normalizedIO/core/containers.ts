import { registeredProviders } from "../conventions";
import { asRecord, isRecord, parseRecord } from "../json";
import type {
  NormalizedMessage,
  NormalizedMessagePart,
  ToolDefinition,
} from "../types";
import { normalizeFinishReason } from "./finishReason";
import {
  isMessageLike,
  isToolDefinitionMessage,
  normalizeMessage,
} from "./message";
import { isToolPartValue, normalizeMessagePart } from "./parts";
import { normalizeToolDefinitionValue } from "./toolDefinitions";

/**
 * Container discovery: locating messages and tool definitions on the IO
 * root, and the per-side accumulator (tool-call dedup, tool-definition
 * merge) they feed. Provider-owned discovery is a fold over
 * `registeredProviders`; the few carriers no convention claims yet stay
 * here as named residuals.
 */

// ---------------------------------------------------------------------------
// Accumulation
// ---------------------------------------------------------------------------

export type NormalizedIOAccumulator = {
  messages: NormalizedMessage[];
  toolDefinitions: ToolDefinition[];
  toolDefinitionIndexByName: Map<string, number>;
  toolCallKeys: Record<"input" | "output", Set<string>>;
};

export function createAccumulator(): NormalizedIOAccumulator {
  return {
    messages: [],
    toolDefinitions: [],
    toolDefinitionIndexByName: new Map(),
    toolCallKeys: { input: new Set(), output: new Set() },
  };
}

function getToolCallKey(part: NormalizedMessagePart): string | undefined {
  if (part.type !== "tool-call") return undefined;

  const id = part.toolCallId;
  if (typeof id === "string" && id.length > 0) return `id:${id}`;

  try {
    return `value:${String(part.toolName)}:${JSON.stringify(part.input)}`;
  } catch {
    return undefined;
  }
}

function addMessage(
  accumulator: NormalizedIOAccumulator,
  message: NormalizedMessage,
): void {
  // Dedup tool calls within one source only. A call echoed across the
  // input/output boundary is kept on both sides.
  const seenKeys = accumulator.toolCallKeys[message.source];
  const parts = message.parts.filter((part) => {
    const key = getToolCallKey(part);
    if (!key) return true;
    if (seenKeys.has(key)) return false;

    seenKeys.add(key);
    return true;
  });

  if (parts.length > 0) {
    accumulator.messages.push({ ...message, parts });
  }
}

function addToolDefinition(
  accumulator: NormalizedIOAccumulator,
  definition: ToolDefinition,
): void {
  const existingIndex = accumulator.toolDefinitionIndexByName.get(
    definition.name,
  );

  if (existingIndex === undefined) {
    accumulator.toolDefinitionIndexByName.set(
      definition.name,
      accumulator.toolDefinitions.length,
    );
    accumulator.toolDefinitions.push(definition);
    return;
  }

  const existing = accumulator.toolDefinitions[existingIndex];
  if (!existing) return;

  accumulator.toolDefinitions[existingIndex] = {
    name: existing.name,
    description: existing.description ?? definition.description,
    inputSchema: existing.inputSchema ?? definition.inputSchema,
    type: existing.type ?? definition.type,
    providerMetadata:
      existing.providerMetadata && definition.providerMetadata
        ? { ...definition.providerMetadata, ...existing.providerMetadata }
        : (existing.providerMetadata ?? definition.providerMetadata),
  };
}

function addToolDefinitionValue(
  accumulator: NormalizedIOAccumulator,
  value: unknown,
  options: {
    allowProviderToolWithoutName?: boolean;
    allowToolMap?: boolean;
  } = {},
): void {
  for (const definition of normalizeToolDefinitionValue(value, options)) {
    addToolDefinition(accumulator, definition);
  }
}

// ---------------------------------------------------------------------------
// Message container discovery
// ---------------------------------------------------------------------------

function collectMessageArray(
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
    // openai: mcp_list_tools items are tool listings, not conversation
    // content — collect them side-band without flushing the call batch.
    if (isRecord(value) && value.type === "mcp_list_tools") {
      addToolDefinitionValue(accumulator, value.tools, {
        allowProviderToolWithoutName: true,
        allowToolMap: true,
      });
      continue;
    }

    // Standalone tool-call items (Responses function_call, built-in
    // provider-executed calls, custom_tool_call) batch into one synthetic
    // assistant message until a non-call item flushes them.
    if (isRecord(value) && !isMessageLike(value)) {
      const part = normalizeMessagePart(value);
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

export function collectMessages(
  parsedValue: {
    value: unknown;
    record?: Record<string, unknown>;
    messages?: unknown[];
  },
  kind: "input" | "output",
  accumulator: NormalizedIOAccumulator,
): void {
  const fallbackRole = kind === "input" ? "user" : "assistant";
  const { value, record } = parsedValue;

  if (Array.isArray(value)) {
    collectMessageArray(
      parsedValue.messages ?? value,
      fallbackRole,
      kind,
      accumulator,
    );
    return;
  }

  if (!record) {
    const message = normalizeMessage(value, fallbackRole, kind);
    if (message) addMessage(accumulator, message);
    return;
  }

  let collectedNestedMessages = false;
  const messages = parsedValue.messages;

  for (const provider of registeredProviders) {
    const sources = provider.collectRootMessageSources?.(record, kind) ?? [];
    if (sources.length === 0) continue;

    for (const rootSource of sources) {
      if (Array.isArray(rootSource.value)) {
        collectMessageArray(
          rootSource.value,
          rootSource.fallbackRole,
          kind,
          accumulator,
        );
        continue;
      }

      const message = normalizeMessage(
        rootSource.value,
        rootSource.fallbackRole,
        kind,
      );
      if (!message) continue;

      const finishReason =
        (rootSource.finishReasonCarrier
          ? normalizeFinishReason(rootSource.finishReasonCarrier)
          : undefined) ?? message.finishReason;
      addMessage(accumulator, {
        ...message,
        role: rootSource.forceRole ?? message.role,
        ...(finishReason ? { finishReason } : {}),
      });
    }

    if (sources.some((rootSource) => rootSource.forceRole !== "system")) {
      collectedNestedMessages = true;
    }
  }

  if (messages) {
    collectMessageArray(messages, fallbackRole, kind, accumulator);
    collectedNestedMessages = true;
  }

  const newMessage = asRecord(record.new_message);
  if (kind === "input" && newMessage) {
    const message = normalizeMessage(newMessage, "user", kind);
    if (message) addMessage(accumulator, message);
    collectedNestedMessages = true;
  }

  if (
    !collectedNestedMessages ||
    isMessageLike(record) ||
    isToolPartValue(record)
  ) {
    const message = normalizeMessage(record, fallbackRole, kind);
    if (message) addMessage(accumulator, message);
  }
}

// ---------------------------------------------------------------------------
// Tool-definition discovery
// ---------------------------------------------------------------------------

export function collectToolDefinitionsFromIO(
  parsedValue: { record?: Record<string, unknown>; messages?: unknown[] },
  accumulator: NormalizedIOAccumulator,
): void {
  const root = parsedValue.record;
  if (root) {
    addToolDefinitionValue(accumulator, root.tools, {
      allowProviderToolWithoutName: true,
      allowToolMap: true,
    });

    for (const provider of registeredProviders) {
      for (const source of provider.collectToolDefinitionSources?.({ root }) ??
        []) {
        addToolDefinitionValue(accumulator, source.value, source.options);
      }
    }
  }

  const messages = parsedValue.messages;
  if (!messages) return;

  for (const message of messages) {
    if (!isRecord(message)) continue;

    addToolDefinitionValue(accumulator, message.tools, {
      allowProviderToolWithoutName: true,
      allowToolMap: true,
    });

    if (isToolDefinitionMessage(message)) {
      addToolDefinitionValue(accumulator, message.content);
    }
  }
}

export function collectMetadataToolDefinitions(
  metadata: unknown,
  accumulator: NormalizedIOAccumulator,
): void {
  const parsedMetadata = asRecord(metadata);
  if (!parsedMetadata) return;

  addToolDefinitionValue(accumulator, parsedMetadata.tools);

  const attributes = parseRecord(parsedMetadata.attributes);
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
