import { EventType } from "@ag-ui/core";

import {
  IN_APP_AGENT_SILENT_MCP_OUTPUT_MESSAGE,
  IN_APP_AGENT_SILENT_MCP_OUTPUT_TYPE,
} from "../constants";
import type { AgUiEvent } from "../schema";
import { isRecord } from "./toolErrors";

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

const AI_SDK_TOOL_MODEL_OUTPUT_TYPES = [
  "text",
  "json",
  "content",
  "error-text",
  "error-json",
] as const;

type AiSdkToolModelOutputType = (typeof AI_SDK_TOOL_MODEL_OUTPUT_TYPES)[number];

export type AiSdkToolModelOutput = {
  type: AiSdkToolModelOutputType;
  value: unknown;
};

/**
 * Map MCP CallToolResult envelopes (and silent pointers) to the AI SDK
 * `{ type, value }` tool-result shape. Bedrock Converse only serializes
 * `output.value`; a raw `{ content: [...] }` envelope becomes an empty
 * `toolResult` on the wire.
 */
export function toAiSdkToolModelOutput(output: unknown): AiSdkToolModelOutput {
  if (typeof output === "string") {
    return { type: "text", value: output };
  }

  if (isSilentInAppAgentMcpToolOutput(output)) {
    if (output.toolCallId && output.toolName) {
      return {
        type: "text",
        value: getInAppAgentSilentMcpOutputMessage(
          output.toolName,
          output.toolCallId,
        ),
      };
    }

    return toAiSdkToolModelOutput(output.output);
  }

  if (isAiSdkToolModelOutput(output)) {
    return output;
  }

  const mcpText = getMcpContentText(output);
  if (mcpText !== undefined) {
    const isError =
      isRecord(output) && (output.isError === true || output.error === true);

    return { type: isError ? "error-text" : "text", value: mcpText };
  }

  return { type: "json", value: output };
}

function isAiSdkToolModelOutput(value: unknown): value is AiSdkToolModelOutput {
  return (
    isRecord(value) &&
    typeof value.type === "string" &&
    AI_SDK_TOOL_MODEL_OUTPUT_TYPES.includes(
      value.type as AiSdkToolModelOutputType,
    ) &&
    "value" in value
  );
}

function getMcpContentText(output: unknown): string | undefined {
  if (!isRecord(output) || !Array.isArray(output.content)) {
    return undefined;
  }

  const texts = output.content.flatMap((part) =>
    isRecord(part) && part.type === "text" && typeof part.text === "string"
      ? [part.text]
      : [],
  );

  return texts.length > 0 ? texts.join("\n") : undefined;
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
