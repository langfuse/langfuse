import { EventType } from "@ag-ui/core";
import { IN_APP_AGENT_TOOL_REJECTION_ERROR_CODE } from "@langfuse/shared/in-app-agent";
import {
  type AgUiEvent,
  type AgUiMessage,
  type InAppAgentToolApprovalRequest,
} from "@langfuse/shared/in-app-agent";
import { toAgUiToolResultContent } from "@langfuse/shared/in-app-agent/server/toolResults";
import type { AgUiRunAgentInput, ResumeForwardedProps } from "./types";

const MANUAL_TOOL_APPROVAL_REJECTION_MESSAGE =
  "Tool call was not approved by the user.";
const MANUAL_TOOL_APPROVAL_REJECTION_ERROR = JSON.stringify({
  code: IN_APP_AGENT_TOOL_REJECTION_ERROR_CODE,
  message: MANUAL_TOOL_APPROVAL_REJECTION_MESSAGE,
});

type DeveloperGuidanceMessage = Extract<AgUiMessage, { role: "developer" }>;

export type ManualToolApprovalRunInput = {
  input: AgUiRunAgentInput;
  syntheticEvents: AgUiEvent[];
  developerGuidance?: string;
  toolCallApproval?: {
    toolCallId: string;
    status: "approved" | "rejected";
  };
};

export async function createManualToolApprovalRunInput(params: {
  input: AgUiRunAgentInput;
  executeToolCall: (
    approvalRequest: InAppAgentToolApprovalRequest,
  ) => Promise<{ result: unknown; modelResult: unknown }>;
  onApprovedToolCallExecuted?: () => void | Promise<void>;
}): Promise<ManualToolApprovalRunInput> {
  const forwardedProps = getResumeForwardedProps(params.input);

  if (!forwardedProps) {
    return { input: params.input, syntheticEvents: [] };
  }

  const { approved, approvalRequest } = forwardedProps.command.resume;
  if (!approved) {
    const assistantMessage =
      createManualToolCallAssistantMessage(approvalRequest);
    const guidanceMessage = createToolRejectionGuidanceMessage(approvalRequest);
    const toolMessage: AgUiMessage = {
      id: createManualToolResultMessageId(approvalRequest),
      role: "tool",
      content: MANUAL_TOOL_APPROVAL_REJECTION_MESSAGE,
      toolCallId: approvalRequest.toolCallId,
      error: MANUAL_TOOL_APPROVAL_REJECTION_ERROR,
    };

    return {
      input: {
        ...params.input,
        messages: [
          ...params.input.messages,
          assistantMessage,
          toolMessage,
          guidanceMessage,
        ],
        forwardedProps: {},
      },
      syntheticEvents: createManualToolApprovalEvents({
        approvalRequest,
        toolResultContent: MANUAL_TOOL_APPROVAL_REJECTION_MESSAGE,
        toolError: MANUAL_TOOL_APPROVAL_REJECTION_ERROR,
      }),
      developerGuidance: guidanceMessage.content,
      toolCallApproval: {
        toolCallId: approvalRequest.toolCallId,
        status: "rejected",
      },
    };
  }

  const { toolResult, modelToolResult, toolError } =
    await executeApprovedToolCall({
      approvalRequest,
      executeToolCall: params.executeToolCall,
    });
  await params.onApprovedToolCallExecuted?.();
  const toolResultContent = serializeToolResultContent(toolResult);
  const assistantMessage =
    createManualToolCallAssistantMessage(approvalRequest);
  const modelToolResultContent = toAgUiToolResultContent(modelToolResult);
  // A successful tool call needs no guidance: the assistant tool call plus its
  // tool result already carry the outcome. Only the error path needs to tell
  // the model how to proceed.
  const guidanceMessage = toolError
    ? createToolExecutionErrorGuidanceMessage(approvalRequest, toolError)
    : undefined;
  const toolMessage: AgUiMessage = {
    id: createManualToolResultMessageId(approvalRequest),
    role: "tool",
    content: modelToolResultContent,
    toolCallId: approvalRequest.toolCallId,
    ...(toolError ? { error: toolError } : {}),
  };
  const syntheticEvents = createManualToolApprovalEvents({
    approvalRequest,
    toolResultContent,
    toolError,
  });

  return {
    input: {
      ...params.input,
      messages: [
        ...params.input.messages,
        assistantMessage,
        toolMessage,
        ...(guidanceMessage ? [guidanceMessage] : []),
      ],
      forwardedProps: {},
    },
    syntheticEvents,
    developerGuidance: guidanceMessage?.content,
    toolCallApproval: {
      toolCallId: approvalRequest.toolCallId,
      status: "approved",
    },
  };
}

function createToolRejectionGuidanceMessage(
  approvalRequest: InAppAgentToolApprovalRequest,
): DeveloperGuidanceMessage {
  return {
    id: `${approvalRequest.toolCallId}-approval-rejection-guidance`,
    role: "developer",
    content: [
      `The user declined the proposed tool call ${approvalRequest.toolName}.`,
      "The action was not completed.",
      "Do not retry this tool call or attempt an equivalent action unless the user explicitly requests it.",
      "Briefly acknowledge that the action was not completed and ask the user how they would like to continue.",
    ].join("\n"),
  };
}

async function executeApprovedToolCall(params: {
  approvalRequest: InAppAgentToolApprovalRequest;
  executeToolCall: (
    approvalRequest: InAppAgentToolApprovalRequest,
  ) => Promise<{ result: unknown; modelResult: unknown }>;
}): Promise<{
  toolResult: unknown;
  modelToolResult: unknown;
  toolError?: string;
}> {
  try {
    const { result, modelResult } = await params.executeToolCall(
      params.approvalRequest,
    );

    return { toolResult: result, modelToolResult: modelResult };
  } catch (error) {
    const toolError = formatToolExecutionError(error);

    return { toolResult: toolError, modelToolResult: toolError, toolError };
  }
}

function getResumeForwardedProps(
  input: AgUiRunAgentInput,
): ResumeForwardedProps | undefined {
  const forwardedProps = input.forwardedProps as
    | ResumeForwardedProps
    | undefined;

  if (!forwardedProps?.command?.resume) {
    return undefined;
  }

  return forwardedProps;
}

function createManualToolCallAssistantMessage(
  approvalRequest: InAppAgentToolApprovalRequest,
): AgUiMessage {
  return {
    id: createManualToolCallParentMessageId(approvalRequest),
    role: "assistant",
    content: "",
    toolCalls: [
      {
        id: approvalRequest.toolCallId,
        type: "function",
        function: {
          name: approvalRequest.toolName,
          arguments: serializeToolCallArgs(approvalRequest.args),
        },
      },
    ],
    runId: approvalRequest.runId,
  };
}

function createToolExecutionErrorGuidanceMessage(
  approvalRequest: InAppAgentToolApprovalRequest,
  toolError: string,
): DeveloperGuidanceMessage {
  const args = serializeToolCallArgs(approvalRequest.args);

  return {
    id: `${approvalRequest.toolCallId}-approval-tool-error-guidance`,
    role: "developer",
    content: [
      `The approved tool call ${approvalRequest.toolName} failed during execution.`,
      `Rejected arguments: ${args}`,
      `Tool error: ${toolError}`,
      "Do not call the same tool again with identical arguments.",
      "Correct the arguments based on the tool error and retry only if a valid correction is clear. If you cannot infer a valid correction, ask the user for clarification or explain why the action could not be completed.",
    ].join("\n"),
  };
}

function createManualToolApprovalEvents(params: {
  approvalRequest: InAppAgentToolApprovalRequest;
  toolResultContent: string;
  toolError?: string;
}): AgUiEvent[] {
  const { approvalRequest } = params;
  const args = serializeToolCallArgs(approvalRequest.args);

  return [
    {
      type: EventType.TOOL_CALL_START,
      parentMessageId: createManualToolCallParentMessageId(approvalRequest),
      toolCallId: approvalRequest.toolCallId,
      toolCallName: approvalRequest.toolName,
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: approvalRequest.toolCallId,
      delta: args,
    },
    {
      type: EventType.TOOL_CALL_END,
      toolCallId: approvalRequest.toolCallId,
    },
    {
      type: EventType.TOOL_CALL_RESULT,
      messageId: createManualToolResultMessageId(approvalRequest),
      toolCallId: approvalRequest.toolCallId,
      content: params.toolResultContent,
      role: "tool",
      ...(params.toolError ? { error: params.toolError } : {}),
    },
  ];
}

function formatToolExecutionError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error) {
    return error;
  }

  return "Tool execution failed.";
}

function createManualToolCallParentMessageId(
  approvalRequest: InAppAgentToolApprovalRequest,
) {
  return `${approvalRequest.toolCallId}-approval-tool-call`;
}

function createManualToolResultMessageId(
  approvalRequest: InAppAgentToolApprovalRequest,
) {
  return `${approvalRequest.toolCallId}-approval-tool-result`;
}

function serializeToolCallArgs(args: unknown) {
  return serializeToolResultContent(args ?? {});
}

function serializeToolResultContent(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value ?? null);
  } catch {
    return String(value);
  }
}
