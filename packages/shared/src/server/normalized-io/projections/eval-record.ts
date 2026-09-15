import type {
  NormalizedIO,
  NormalizedMessage,
  ToolDefinition,
} from "../../../utils/normalized-io/types";
import {
  ObservationForEval,
  ToolCallForEval,
} from "../../../features/evals/observationForEval";

/**
 * The 6 fields on ObservationForEval that the parser actually computes.
 * Everything else (identifiers, usage/cost, experiment fields, ...) is
 * unrelated to message/tool-call parsing and passes through from the
 * ClickHouse record unchanged.
 *
 * TODO: shape still being tightened; not consumed by any production path yet.
 */
export type NormalizedEvalRecord = Omit<
  ObservationForEval,
  | "input"
  | "output"
  | "tool_definitions"
  | "tool_calls"
  | "tool_call_names"
  | "tool_call_count"
> & {
  input: NormalizedMessage[];
  output: NormalizedMessage[];
  toolCalls: ToolCallForEval[];
  toolDefinitions: ToolDefinition[];
};

/**
 * (NormalizedIO, ObservationForEval) -> eval-ready record. A spread-and-
 * override rather than an enumeration of all of ObservationForEval's
 * fields, so this projection does not need updating when ObservationForEval
 * gains fields unrelated to I/O parsing.
 */
export function toEvalRecord(
  io: NormalizedIO,
  record: ObservationForEval,
): NormalizedEvalRecord {
  const {
    input: _rawInput,
    output: _rawOutput,
    tool_definitions: _rawToolDefinitions,
    tool_calls: _rawToolCalls,
    tool_call_names: _rawToolCallNames,
    tool_call_count: _rawToolCallCount,
    ...passthrough
  } = record;
  const toolCalls: ToolCallForEval[] = [];
  const input: NormalizedMessage[] = [];
  const output: NormalizedMessage[] = [];

  for (const message of io.messages) {
    if (message.source === "input") {
      input.push(message);
    } else {
      output.push(message);
    }

    // Calls only ever come from the output side: a tool-call part on an
    // input-tagged message is history from an earlier turn, not something
    // this observation newly called
    if (message.source !== "output") continue;

    // Parallel-call slot within the message (chat-completions `index`
    // semantics: tool_calls[i].index === i in assembled payloads).
    let callIndex = 0;
    for (const part of message.parts) {
      if (part.type !== "tool-call") continue;

      toolCalls.push({
        id: part.toolCallId ?? "",
        name: part.toolName,
        arguments: part.input ?? {},
        type: part.toolType ?? "",
        index: callIndex++,
      });
    }
  }

  return {
    ...passthrough,
    input,
    output,
    toolCalls,
    toolDefinitions: io.toolDefinitions,
  };
}
