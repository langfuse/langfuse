import { EventType } from "@ag-ui/core";
import { z } from "zod";

import { InvalidRequestError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import type { McpToolName } from "@/src/features/mcp/server/bootstrap";
import { IN_APP_AGENT_TOOL_REJECTION_ERROR_CODE } from "@/src/ee/features/in-app-agent/constants";
import { IN_APP_AGENT_LANGFUSE_MCP_TOOL_NAMES } from "@/src/ee/features/in-app-agent/server/tools";
import { safeJsonParse, stableJsonStringify } from "@/src/utils/json";
import {
  getResumeDecisions,
  type AgUiEvent,
  type AgUiMessage,
  type AgUiRunAgentInput,
  type InAppAgentToolApprovalDecision,
  type InAppAgentToolApprovalRequest,
  type ResumeForwardedProps,
} from "@/src/ee/features/in-app-agent/schema";

const MANUAL_TOOL_APPROVAL_REJECTION_MESSAGE =
  "Tool call was not approved by the user.";
const MANUAL_TOOL_APPROVAL_REJECTION_ERROR = JSON.stringify({
  code: IN_APP_AGENT_TOOL_REJECTION_ERROR_CODE,
  message: MANUAL_TOOL_APPROVAL_REJECTION_MESSAGE,
});

export const IN_APP_AGENT_PENDING_TOOL_APPROVAL_TTL_SECONDS = 60 * 60;

const PendingToolApprovalSchema = z.object({
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  runId: z.string().min(1),
  argsFingerprint: z.string(),
});

const McpToolNameSchema = z.custom<McpToolName>(
  (value) =>
    typeof value === "string" &&
    IN_APP_AGENT_LANGFUSE_MCP_TOOL_NAMES.has(value as McpToolName),
  { message: "Invalid MCP tool name" },
);

export const InAppAgentMcpRunOverrideSchema = z.union([
  z.object({ toolNames: z.array(McpToolNameSchema).min(1) }),
  // Legacy single-tool shape, still minted for single-tool overrides and
  // parsed for rolling-deploy compatibility.
  z.object({ toolName: McpToolNameSchema }),
]);

export type InAppAgentMcpRunOverride = z.infer<
  typeof InAppAgentMcpRunOverrideSchema
>;

export function getInAppAgentMcpOverrideToolNames(
  override: InAppAgentMcpRunOverride,
): McpToolName[] {
  return "toolNames" in override ? override.toolNames : [override.toolName];
}

const MastraSuspendEventSchema = z.object({
  type: z.literal("mastra_suspend"),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  args: z.unknown().optional(),
  runId: z.string().min(1),
});

export async function storePendingToolApproval(params: {
  projectId: string;
  conversationId: string;
  approvalRequest: InAppAgentToolApprovalRequest;
}) {
  const approvalFingerprint = createPendingToolApprovalFingerprint(
    params.approvalRequest,
  );
  const expiresAt = new Date(
    Date.now() + IN_APP_AGENT_PENDING_TOOL_APPROVAL_TTL_SECONDS * 1000,
  );

  await prisma.inAppAgentPendingToolApproval.upsert({
    where: {
      projectId_conversationId_toolCallId: {
        projectId: params.projectId,
        conversationId: params.conversationId,
        toolCallId: params.approvalRequest.toolCallId,
      },
    },
    create: {
      projectId: params.projectId,
      conversationId: params.conversationId,
      toolCallId: params.approvalRequest.toolCallId,
      approvalFingerprint,
      expiresAt,
    },
    update: {
      approvalFingerprint,
      expiresAt,
    },
  });
}

// Every decision must reference a distinct pending approval; a duplicated
// toolCallId would let one row satisfy two decisions in the count checks below.
function getValidatedDecisions(forwardedProps: ResumeForwardedProps) {
  const decisions = getResumeDecisions(forwardedProps);
  const toolCallIds = new Set(
    decisions.map((decision) => decision.approvalRequest.toolCallId),
  );

  if (toolCallIds.size !== decisions.length) {
    throw new InvalidRequestError("Invalid forwarded props");
  }

  return decisions;
}

function createPendingToolApprovalConditions(
  decisions: InAppAgentToolApprovalDecision[],
) {
  const now = new Date();

  return decisions.map(({ approvalRequest }) => ({
    toolCallId: approvalRequest.toolCallId,
    approvalFingerprint: createPendingToolApprovalFingerprint(approvalRequest),
    expiresAt: { gt: now },
  }));
}

// Check early, before stream setup, so malformed or forged resume payloads fail
// without starting another model/tool execution attempt.
export async function validatePendingToolApproval(params: {
  projectId: string;
  conversationId: string;
  forwardedProps: ResumeForwardedProps;
}) {
  const decisions = getValidatedDecisions(params.forwardedProps);
  const pendingCount = await prisma.inAppAgentPendingToolApproval.count({
    where: {
      projectId: params.projectId,
      conversationId: params.conversationId,
      OR: createPendingToolApprovalConditions(decisions),
    },
  });

  if (pendingCount !== decisions.length) {
    throw new InvalidRequestError("Invalid forwarded props");
  }
}

// Atomically consume before stream setup so every pending approval can start at
// most one resumed tool call attempt. All-or-nothing: if any decision does not
// match a live pending approval, nothing is consumed.
export async function consumeAndValidatePendingToolApproval(params: {
  projectId: string;
  conversationId: string;
  forwardedProps: ResumeForwardedProps;
}) {
  const decisions = getValidatedDecisions(params.forwardedProps);

  await prisma.$transaction(async (tx) => {
    const consumeResult = await tx.inAppAgentPendingToolApproval.deleteMany({
      where: {
        projectId: params.projectId,
        conversationId: params.conversationId,
        OR: createPendingToolApprovalConditions(decisions),
      },
    });

    if (consumeResult.count !== decisions.length) {
      throw new InvalidRequestError("Invalid forwarded props");
    }
  });
}

export async function createInAppAgentMcpRunOverride(params: {
  toolNames: McpToolName[];
}) {
  // Single-tool overrides keep the legacy shape so web instances that predate
  // the batch contract still parse them during a rolling deploy.
  return JSON.stringify(
    params.toolNames.length === 1
      ? { toolName: params.toolNames[0] }
      : { toolNames: params.toolNames },
  );
}

export function parseInAppAgentInterruptEvent(
  event: AgUiEvent,
): InAppAgentToolApprovalRequest | undefined {
  if (event.type !== EventType.CUSTOM || event.name !== "on_interrupt") {
    return undefined;
  }

  const value = event.value;
  const interrupt =
    typeof value === "string" ? safeJsonParse(value) : (value as unknown);
  const parsedInterrupt = MastraSuspendEventSchema.safeParse(interrupt);

  return parsedInterrupt.success
    ? { ...parsedInterrupt.data, type: "tool_approval_request" }
    : undefined;
}

export type ManualToolApprovalRunInput = {
  input: AgUiRunAgentInput;
  syntheticEvents: AgUiEvent[];
  toolCallApprovals: Array<{
    toolCallId: string;
    status: "approved" | "rejected";
  }>;
};

export async function createManualToolApprovalRunInput(params: {
  input: AgUiRunAgentInput;
  executeToolCall: (
    approvalRequest: InAppAgentToolApprovalRequest,
  ) => Promise<unknown>;
  onApprovedToolCallExecuted?: (toolCallId: string) => void | Promise<void>;
}): Promise<ManualToolApprovalRunInput> {
  const forwardedProps = getResumeForwardedProps(params.input);

  if (!forwardedProps) {
    return { input: params.input, syntheticEvents: [], toolCallApprovals: [] };
  }

  const decisions = getResumeDecisions(forwardedProps);
  const messages: AgUiMessage[] = [...params.input.messages];
  const syntheticEvents: AgUiEvent[] = [];
  const toolCallApprovals: ManualToolApprovalRunInput["toolCallApprovals"] = [];

  // Decision order is the order the tool calls were proposed in; approved
  // calls execute sequentially so their effects and transcript entries match
  // what the user reviewed.
  for (const { approved, approvalRequest } of decisions) {
    if (!approved) {
      messages.push(
        createManualToolCallAssistantMessage(approvalRequest),
        {
          id: createManualToolResultMessageId(approvalRequest),
          role: "tool",
          content: MANUAL_TOOL_APPROVAL_REJECTION_MESSAGE,
          toolCallId: approvalRequest.toolCallId,
          error: MANUAL_TOOL_APPROVAL_REJECTION_ERROR,
        },
        createToolRejectionGuidanceMessage(approvalRequest),
      );
      syntheticEvents.push(
        ...createManualToolApprovalEvents({
          approvalRequest,
          toolResultContent: MANUAL_TOOL_APPROVAL_REJECTION_MESSAGE,
          toolError: MANUAL_TOOL_APPROVAL_REJECTION_ERROR,
        }),
      );
      toolCallApprovals.push({
        toolCallId: approvalRequest.toolCallId,
        status: "rejected",
      });
      continue;
    }

    const { toolResult, toolError } = await executeApprovedToolCall({
      approvalRequest,
      executeToolCall: params.executeToolCall,
    });
    await params.onApprovedToolCallExecuted?.(approvalRequest.toolCallId);
    const toolResultContent = serializeToolResultContent(toolResult);

    messages.push(
      createManualToolCallAssistantMessage(approvalRequest),
      {
        id: createManualToolResultMessageId(approvalRequest),
        role: "tool",
        content: toolResultContent,
        toolCallId: approvalRequest.toolCallId,
        ...(toolError ? { error: toolError } : {}),
      },
      ...(toolError
        ? [createToolExecutionErrorGuidanceMessage(approvalRequest, toolError)]
        : []),
    );
    syntheticEvents.push(
      ...createManualToolApprovalEvents({
        approvalRequest,
        toolResultContent,
        toolError,
      }),
    );
    toolCallApprovals.push({
      toolCallId: approvalRequest.toolCallId,
      status: "approved",
    });
  }

  return {
    input: {
      ...params.input,
      messages,
      forwardedProps: {},
    },
    syntheticEvents,
    toolCallApprovals,
  };
}

function createToolRejectionGuidanceMessage(
  approvalRequest: InAppAgentToolApprovalRequest,
): AgUiMessage {
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
  ) => Promise<unknown>;
}): Promise<{ toolResult: unknown; toolError?: string }> {
  try {
    return { toolResult: await params.executeToolCall(params.approvalRequest) };
  } catch (error) {
    const toolError = formatToolExecutionError(error);

    return { toolResult: toolError, toolError };
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

export function createManualToolCallAssistantMessage(
  approvalRequest: InAppAgentToolApprovalRequest,
): AgUiMessage {
  return {
    id: createManualToolCallParentMessageId(approvalRequest),
    role: "assistant",
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
): AgUiMessage {
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

export function createManualToolApprovalEvents(params: {
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

function createPendingToolApprovalFingerprint(
  approvalRequest: InAppAgentToolApprovalRequest,
): string {
  // Persist only the stable approval identity, including a sorted-JSON argument
  // fingerprint, so approved calls cannot be replayed with changed arguments.
  return JSON.stringify(
    PendingToolApprovalSchema.parse({
      toolCallId: approvalRequest.toolCallId,
      toolName: approvalRequest.toolName,
      runId: approvalRequest.runId,
      argsFingerprint: stableJsonStringify(approvalRequest.args),
    }),
  );
}
