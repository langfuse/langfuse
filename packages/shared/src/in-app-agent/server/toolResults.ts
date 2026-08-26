import { EventType } from "@ag-ui/core";

import {
  IN_APP_AGENT_SILENT_MCP_OUTPUT_MESSAGE,
  IN_APP_AGENT_SILENT_MCP_OUTPUT_TYPE,
} from "../constants";
import type { AgUiEvent } from "../schema";

export type SilentInAppAgentMcpToolOutput = {
  type: typeof IN_APP_AGENT_SILENT_MCP_OUTPUT_TYPE;
  output: unknown;
  toolCallId?: string;
  toolName?: string;
};

export type CompletedInAppAgentMcpToolCall = {
  toolCallId: string;
  toolName: string;
  request: unknown;
  response: unknown;
  error: string | null;
  createdAt: Date;
};

export const getInAppAgentSilentMcpOutputFilePath = (
  toolName: string,
  toolCallId: string,
) => `tool_calls/${toolName}_${toolCallId}.json`;

export const getInAppAgentSilentMcpOutputMessage = (
  toolName: string,
  toolCallId: string,
) =>
  `Output saved to /workspace/${getInAppAgentSilentMcpOutputFilePath(toolName, toolCallId)}`;

export function getPublicInAppAgentMcpToolResultContent(content: string) {
  try {
    const output = JSON.parse(content) as unknown;
    if (!isSilentInAppAgentMcpToolOutput(output)) {
      return content;
    }

    if (!output.toolCallId || !output.toolName) {
      return IN_APP_AGENT_SILENT_MCP_OUTPUT_MESSAGE;
    }

    return getInAppAgentSilentMcpOutputMessage(
      output.toolName,
      output.toolCallId,
    );
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

/** Withhold private persisted event payloads from browser-facing streams. */
export function toPublicInAppAgentEvent(event: AgUiEvent): AgUiEvent {
  if (event.type === EventType.RUN_STARTED && event.input !== undefined) {
    const publicEvent = { ...event };
    delete publicEvent.input;
    return publicEvent;
  }

  if (
    event.type === EventType.TOOL_CALL_RESULT &&
    typeof event.content === "string"
  ) {
    return {
      ...event,
      content: getPublicInAppAgentMcpToolResultContent(event.content),
    };
  }

  return event;
}
