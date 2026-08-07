import { deepParseJsonIterative } from "@langfuse/shared";

const TOOL_CALLS_COLUMN_ID = "toolCalls";

/**
 * Decodes one sample-observation field the same way variable extraction does,
 * so objects stored as (multi-)encoded JSON strings are still drillable. Tool
 * calls are already normalized by extraction and deep-parsing them can corrupt
 * string-valued identifiers such as a tool named "true".
 */
export function parseSampleField(columnId: string, value: unknown): unknown {
  return columnId === TOOL_CALLS_COLUMN_ID
    ? value
    : deepParseJsonIterative(value);
}
