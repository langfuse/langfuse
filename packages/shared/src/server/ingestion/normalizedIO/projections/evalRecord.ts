import type {
  ObservationForEval,
  ToolCallForEval,
} from "../../../../features/evals/observationForEval";
import type {
  NormalizedIO,
  NormalizedMessage,
  NormalizedMessagePart,
  ToolDefinition,
} from "../types";

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
 * The 6 fields on ObservationForEval that the parser actually computes.
 * Everything else (identifiers, usage/cost, experiment fields, ...) is
 * unrelated to message/tool-call parsing and passes through from the
 * ClickHouse record unchanged — see the field table in the LFE-14998
 * interface plan (Q3).
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
  const toolCalls: ToolCallForEval[] = [];
  const input: NormalizedMessage[] = [];
  const output: NormalizedMessage[] = [];

  for (const message of io.messages) {
    if (message.source === "input") {
      input.push(message);
    } else {
      output.push(message);
    }

    for (const part of message.parts) {
      if (!isToolCallPart(part)) continue;

      toolCalls.push({
        id: part.toolCallId,
        name: part.toolName,
        arguments: part.input ?? {},
        type: "",
        index: part.index ?? 0,
      });
    }
  }

  return {
    ...record,
    input,
    output,
    toolCalls,
    toolDefinitions: io.toolDefinitions,
  };
}
