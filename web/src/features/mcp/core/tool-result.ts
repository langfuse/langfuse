import {
  isInputRequiredResult,
  type CallToolResult,
  type InputRequiredResult,
} from "@modelcontextprotocol/server";

const callToolResults = new WeakSet<object>();

const isCallToolResult = (value: unknown): value is CallToolResult =>
  typeof value === "object" && value !== null && callToolResults.has(value);

/**
 * Marks a handler's return value as a complete `CallToolResult`, for tools
 * that need more than JSON text, such as `_meta` for an MCP App. Other return
 * values are sent as their JSON.
 */
export const callToolResult = (result: CallToolResult): CallToolResult => {
  callToolResults.add(result);
  return result;
};

/** The MCP result of a tool handler's return value. */
export const toCallToolResult = (
  value: unknown,
): CallToolResult | InputRequiredResult => {
  if (isInputRequiredResult(value) || isCallToolResult(value)) return value;
  return {
    content: [
      {
        type: "text",
        text:
          typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
};
