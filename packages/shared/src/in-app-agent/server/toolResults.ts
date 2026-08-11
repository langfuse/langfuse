import {
  IN_APP_AGENT_SILENT_MCP_OUTPUT_MESSAGE,
  IN_APP_AGENT_SILENT_MCP_OUTPUT_TYPE,
} from "../constants";

export type SilentInAppAgentMcpToolOutput = {
  type: typeof IN_APP_AGENT_SILENT_MCP_OUTPUT_TYPE;
  output: unknown;
};

export type CompletedInAppAgentMcpToolCall = {
  toolCallId: string;
  toolName: string;
  request: unknown;
  response: unknown;
  error: string | null;
  createdAt: Date;
};

export function getPublicInAppAgentMcpToolResultContent(content: string) {
  try {
    return isSilentInAppAgentMcpToolOutput(JSON.parse(content) as unknown)
      ? IN_APP_AGENT_SILENT_MCP_OUTPUT_MESSAGE
      : content;
  } catch {
    return content;
  }
}

export function getSandboxInAppAgentMcpToolResultContent(content: string) {
  const parsed = JSON.parse(content) as unknown;

  return isSilentInAppAgentMcpToolOutput(parsed) ? parsed.output : parsed;
}

export function isSilentInAppAgentMcpToolOutput(
  value: unknown,
): value is SilentInAppAgentMcpToolOutput {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === IN_APP_AGENT_SILENT_MCP_OUTPUT_TYPE &&
    "output" in value
  );
}
