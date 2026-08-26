import { normalizeToolDefinitionValue } from "../normalize/toolDefinitions";
import {
  NormalizedMessage,
  NormalizedMessagePart,
  ToolDefinition,
} from "../../types";
import { NormalizedIOAccumulator } from "./interface";
import { ToolDefinitionOptions } from "../../conventions/IOConvention";

export function addToolDefinitionValue(
  accumulator: NormalizedIOAccumulator,
  value: unknown,
  options: ToolDefinitionOptions = {},
): void {
  for (const definition of normalizeToolDefinitionValue(value, options)) {
    addToolDefinition(accumulator, definition);
  }
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

export function addMessage(
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
