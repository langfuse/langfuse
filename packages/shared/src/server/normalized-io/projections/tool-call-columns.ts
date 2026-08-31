import type {
  NormalizedIO,
  ToolColumns,
} from "../../../utils/normalized-io/types";

/**
 * NormalizedIO -> ClickHouse tool-call columns. Shape matches
 * extractToolsBackend.ts's convertCallsToArrays/convertDefinitionsToMap
 * exactly, since this projection is meant to eventually replace that path.
 * Output-side tool calls have already been deduplicated by the parser.
 */
export function toToolColumns(io: NormalizedIO): ToolColumns {
  const tool_calls: string[] = [];
  const tool_call_names: string[] = [];

  // Calls only ever come from the output side: a tool-call part on an
  // input-tagged message is history from an earlier turn (already resolved),
  // not something this observation newly called
  for (const message of io.messages) {
    if (message.source !== "output") continue;

    // Parallel-call slot within the message (chat-completions `index`
    // semantics: tool_calls[i].index === i in assembled payloads). Counted
    // before the invalid filter so emitted slots match the raw payload.
    let callIndex = 0;
    for (const part of message.parts) {
      if (part.type !== "tool-call") continue;
      const index = callIndex++;
      // Columns count executable calls only; attempts whose arguments could
      // not be parsed stay out — legacy parity, the legacy extractor never
      // saw unparsed calls.
      if (part.invalid === true) continue;

      tool_call_names.push(part.toolName);
      tool_calls.push(
        JSON.stringify({
          id: part.toolCallId ?? "",
          arguments: JSON.stringify(part.input ?? {}),
          type: part.toolType ?? "",
          index,
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
