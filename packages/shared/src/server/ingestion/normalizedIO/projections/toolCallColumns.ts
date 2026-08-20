import type { NormalizedIO, ToolColumns } from "../types";

/**
 * NormalizedIO -> ClickHouse tool-call columns. Shape matches
 * extractToolsBackend.ts's convertCallsToArrays/convertDefinitionsToMap
 * exactly, since this projection is meant to eventually replace that path.
 *
 * TODO: align dedup with extractToolsBackend (it dedups by
 * `id || "${name}-${arguments}"`; the parser dedups by toolCallId) before
 * replacing that path.
 */
export function toToolColumns(io: NormalizedIO): ToolColumns {
  const tool_calls: string[] = [];
  const tool_call_names: string[] = [];

  // Calls only ever come from the output side: a tool-call part on an
  // input-tagged message is history from an earlier turn (already resolved),
  // not something this observation newly called
  for (const message of io.messages) {
    if (message.source !== "output") continue;

    for (const part of message.parts) {
      if (part.type !== "tool-call") continue;
      // Columns count executable calls only; attempts whose arguments could
      // not be parsed (KnownPartFlags.invalid) stay out — legacy parity, the
      // legacy extractor never saw unparsed calls.
      if (part.providerMetadata?.invalid === true) continue;

      tool_call_names.push(part.toolName);
      tool_calls.push(
        JSON.stringify({
          id: part.toolCallId ?? "",
          arguments: JSON.stringify(part.input ?? {}),
          type: "",
          index: part.index ?? 0,
        }),
      );
    }
  }

  const tool_definitions: Record<string, string> = {};
  for (const definition of io.toolDefinitions) {
    tool_definitions[definition.name] = JSON.stringify({
      description: definition.description ?? "",
      parameters:
        definition.inputSchema !== undefined
          ? JSON.stringify(definition.inputSchema)
          : "",
    });
  }

  return { tool_definitions, tool_calls, tool_call_names };
}
