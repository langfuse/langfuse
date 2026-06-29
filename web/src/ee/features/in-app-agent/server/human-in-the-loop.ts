import { EventType } from "@ag-ui/core";
import { randomUUID } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";

import { InvalidRequestError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { env } from "@/src/env.mjs";
import { safeJsonParse, stableJsonStringify } from "@/src/utils/json";
import {
  type AgUiEvent,
  type AgUiMessage,
  type AgUiRunAgentInput,
  type InAppAgentToolApprovalRequest,
  type ResumeForwardedProps,
} from "@/src/ee/features/in-app-agent/schema";

export const IN_APP_AGENT_MCP_RUN_SECRET_TTL_SECONDS = 60 * 60;
const MANUAL_TOOL_APPROVAL_REJECTION_MESSAGE =
  "Tool call was not approved by the user.";
const IN_APP_AGENT_MCP_RUN_TOKEN_TYPE = "in_app_agent_mcp_run";

const PendingToolApprovalSchema = z.object({
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  runId: z.string().min(1),
  argsFingerprint: z.string(),
});

const InAppAgentMcpRunTokenClaimsSchema = z.object({
  tokenUse: z.literal(IN_APP_AGENT_MCP_RUN_TOKEN_TYPE),
  apiKeyId: z.string().min(1),
  projectId: z.string().min(1),
  runId: z.string().min(1),
});

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
    Date.now() + IN_APP_AGENT_MCP_RUN_SECRET_TTL_SECONDS * 1000,
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

// Check early, before stream setup, so malformed or forged resume payloads fail
// without starting another model/tool execution attempt.
export async function validatePendingToolApproval(params: {
  projectId: string;
  conversationId: string;
  forwardedProps: ResumeForwardedProps;
}) {
  const approvalRequest = params.forwardedProps.command.resume.approvalRequest;
  const pendingApproval = await prisma.inAppAgentPendingToolApproval.findFirst({
    where: {
      projectId: params.projectId,
      conversationId: params.conversationId,
      toolCallId: approvalRequest.toolCallId,
      approvalFingerprint:
        createPendingToolApprovalFingerprint(approvalRequest),
      expiresAt: { gt: new Date() },
    },
    select: { toolCallId: true },
  });

  if (!pendingApproval) {
    throw new InvalidRequestError("Invalid forwarded props");
  }
}

// Atomically consume before stream setup so a pending approval can start at most
// one resumed tool call attempt.
export async function consumeAndValidatePendingToolApproval(params: {
  projectId: string;
  conversationId: string;
  forwardedProps: ResumeForwardedProps;
}) {
  const approvalRequest = params.forwardedProps.command.resume.approvalRequest;
  const consumeResult = await prisma.inAppAgentPendingToolApproval.deleteMany({
    where: {
      projectId: params.projectId,
      conversationId: params.conversationId,
      toolCallId: approvalRequest.toolCallId,
      approvalFingerprint:
        createPendingToolApprovalFingerprint(approvalRequest),
      expiresAt: { gt: new Date() },
    },
  });

  if (consumeResult.count !== 1) {
    throw new InvalidRequestError("Invalid forwarded props");
  }
}

export async function createInAppAgentMcpRunAuthToken(params: {
  apiKeyId: string;
  projectId: string;
  runId: string;
}) {
  return new SignJWT({
    tokenUse: IN_APP_AGENT_MCP_RUN_TOKEN_TYPE,
    apiKeyId: params.apiKeyId,
    projectId: params.projectId,
    runId: params.runId,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setJti(randomUUID())
    .setExpirationTime(`${IN_APP_AGENT_MCP_RUN_SECRET_TTL_SECONDS}s`)
    .sign(getInAppAgentMcpRunTokenSigningSecret());
}

export async function hasValidInAppAgentMcpRunAuthToken(params: {
  apiKeyId: string;
  projectId: string;
  isInAppAgentKey: boolean;
  headerValue: string | string[] | undefined;
}) {
  // Only the server-side in-app agent receives this signed per-run token. This
  // keeps temporary in-app-agent API keys from being sufficient for mutating MCP
  // calls if they are replayed or used outside the active run path.
  if (!params.isInAppAgentKey || typeof params.headerValue !== "string") {
    return false;
  }

  const claims = await verifyInAppAgentMcpRunToken(params.headerValue);

  return (
    claims?.apiKeyId === params.apiKeyId &&
    claims.projectId === params.projectId
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
  shouldContinue: boolean;
};

export async function createManualToolApprovalRunInput(params: {
  input: AgUiRunAgentInput;
  executeToolCall: (
    approvalRequest: InAppAgentToolApprovalRequest,
  ) => Promise<unknown>;
  onApprovedToolCallExecuted?: () => void | Promise<void>;
}): Promise<ManualToolApprovalRunInput> {
  const forwardedProps = getResumeForwardedProps(params.input);

  if (!forwardedProps) {
    return { input: params.input, syntheticEvents: [], shouldContinue: true };
  }

  const { approved, approvalRequest } = forwardedProps.command.resume;
  if (!approved) {
    return {
      input: {
        ...params.input,
        forwardedProps: {},
      },
      syntheticEvents: createManualToolApprovalEvents({
        approvalRequest,
        toolResultContent: MANUAL_TOOL_APPROVAL_REJECTION_MESSAGE,
        toolError: MANUAL_TOOL_APPROVAL_REJECTION_MESSAGE,
      }),
      shouldContinue: false,
    };
  }

  const { toolResult, toolError } = await executeApprovedToolCall({
    approvalRequest,
    executeToolCall: params.executeToolCall,
  });
  await params.onApprovedToolCallExecuted?.();
  const toolResultContent = serializeToolResultContent(toolResult);
  const assistantMessage =
    createManualToolCallAssistantMessage(approvalRequest);
  const toolMessage: AgUiMessage = {
    id: createManualToolResultMessageId(approvalRequest),
    role: "tool",
    content: toolResultContent,
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
        ...(toolError
          ? [
              createToolExecutionErrorGuidanceMessage(
                approvalRequest,
                toolError,
              ),
            ]
          : []),
      ],
      forwardedProps: {},
    },
    syntheticEvents,
    shouldContinue: true,
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

async function verifyInAppAgentMcpRunToken(token: string) {
  try {
    const { payload, protectedHeader } = await jwtVerify(
      token,
      getInAppAgentMcpRunTokenSigningSecret(),
      { algorithms: ["HS256"] },
    );

    if (protectedHeader.typ !== "JWT") {
      return undefined;
    }

    const parsedClaims = InAppAgentMcpRunTokenClaimsSchema.safeParse(payload);

    return parsedClaims.success ? parsedClaims.data : undefined;
  } catch {
    return undefined;
  }
}

function getInAppAgentMcpRunTokenSigningSecret() {
  if (env.LANGFUSE_IN_APP_AGENT_MCP_RUN_TOKEN_SECRET) {
    return new TextEncoder().encode(
      env.LANGFUSE_IN_APP_AGENT_MCP_RUN_TOKEN_SECRET,
    );
  }

  if (env.NODE_ENV !== "production") {
    return new TextEncoder().encode(env.SALT);
  }

  throw new Error(
    "LANGFUSE_IN_APP_AGENT_MCP_RUN_TOKEN_SECRET is required to sign in-app agent run tokens",
  );
}
