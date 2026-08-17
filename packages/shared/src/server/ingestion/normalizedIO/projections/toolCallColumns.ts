import type { NormalizedIO, NormalizedMessagePart } from "../types";

type ToolCallPart = NormalizedMessagePart & {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  input: unknown;
  index?: number;
};

function isToolCallPart(part: NormalizedMessagePart): part is ToolCallPart {
  return (
    part.type === "tool-call" &&
    typeof part.toolCallId === "string" &&
    typeof part.toolName === "string"
  );
}

/**
 * NormalizedIO -> ClickHouse tool-call columns. Shape matches
 * extractToolsBackend.ts's convertCallsToArrays/convertDefinitionsToMap
 * exactly, since this projection is meant to eventually replace that path.
 *
 * Not a drop-in replacement yet: dedup semantics differ (this projection
 * inherits the parser's dedup-by-toolCallId, extractToolsBackend.ts dedups
 * by `id || "${name}-${arguments}"`) — see open question Q2 in the
 * LFE-14998 interface plan. A regression test comparing both paths over real
 * fixtures is required before either path is cut over.
 */
export function toToolCallColumns(io: NormalizedIO): {
  toolCalls: string[];
  toolCallNames: string[];
  toolDefinitions: Record<string, string>;
} {
  const toolCalls: string[] = [];
  const toolCallNames: string[] = [];

  // Calls only ever come from the output side: a tool-call part on an
  // input-tagged message is history from an earlier turn (already resolved),
  // not something this observation newly called
  for (const message of io.messages) {
    if (message.source !== "output") continue;

    for (const part of message.parts) {
      if (!isToolCallPart(part)) continue;

      toolCallNames.push(part.toolName);
      toolCalls.push(
        JSON.stringify({
          id: part.toolCallId,
          arguments: JSON.stringify(part.input ?? {}),
          type: "",
          index: part.index ?? 0,
        }),
      );
    }
  }

  const toolDefinitions: Record<string, string> = {};
  for (const definition of io.toolDefinitions) {
    toolDefinitions[definition.name] = JSON.stringify({
      description: definition.description ?? "",
      parameters:
        definition.inputSchema !== undefined
          ? JSON.stringify(definition.inputSchema)
          : "",
    });
  }

  return { toolCalls, toolCallNames, toolDefinitions };
}
