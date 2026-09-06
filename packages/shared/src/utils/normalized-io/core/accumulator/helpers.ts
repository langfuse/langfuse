import { normalizeToolDefinitionValue } from "../normalize/tool-definitions";
import {
  NormalizedMessage,
  NormalizedMessagePart,
  ToolDefinition,
} from "../../types";
import type { NormalizedIOAccumulator } from "./interface";
import { ToolDefinitionOptions } from "../../conventions/io-convention";
import type { ParserContext } from "../parser-context";
import { getToolCallKeyForPart } from "../normalize/part";

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

  // Keep legacy identity (including raw argument spelling) out of the public
  // part shape while still using it for output-side compatibility deduping.
  const rawKey = getToolCallKeyForPart(part);
  if (rawKey) return rawKey;

  const id = part.toolCallId;
  if (typeof id === "string" && id.length > 0) return `id:${id}`;

  try {
    return `value:${String(part.toolName)}:${JSON.stringify(part.input)}`;
  } catch {
    return undefined;
  }
}

export function addMessage(
  messages: NormalizedMessage[],
  message: NormalizedMessage,
  context: ParserContext,
): void {
  // Input is conversation history and must preserve repeated calls. Output
  // is projected into the legacy tool columns, where duplicate
  // representations are removed as they are encountered.
  const parts =
    context.source === "output"
      ? message.parts.filter((part) => {
          const key = getToolCallKey(part);
          if (!key) return true;
          if (context.toolCallKeys.has(key)) return false;

          context.toolCallKeys.add(key);
          return true;
        })
      : message.parts;

  if (parts.length > 0) {
    if (context.source === "input" && message.role === "system") {
      context.hasSystemMessage = true;
    }
    messages.push({ ...message, parts });
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
