import { randomBytes, timingSafeEqual } from "node:crypto";

import { Prisma } from "../../db";
import type { PrismaClient } from "../../db";
import { LangfuseConflictError } from "../../index";
import {
  InAppAgentRunErrorCode,
  InAppAgentRunStatus,
  InAppAgentRunRequestSchema,
  resolveInAppAgentRootRunId,
} from "../../features/inAppAgent/types";
import {
  digestExecutionToken,
  digestScript,
  InAppAgentScriptExecutionLimitsSchema,
  InAppAgentScriptExecutionState,
  IN_APP_AGENT_SCRIPT_EXECUTION_DEFAULT_LIMITS,
  isTerminalScriptExecutionState,
  type InAppAgentScriptExecutionLimits,
} from "../scriptExecution";
import { InAppAgentRunApprovedScriptArgsSchema } from "../schema";
import { buildInAppAgentApprovalDecisionEvent } from "../approvalEvents";
import { lockConversation, type InAppAgentTx } from "./persistence";
import { recordRunTerminalOutcome } from "./runMetrics";
import { IN_APP_AGENT_APPROVAL_TTL_MS } from "./tunables";

export const ACTIVE_SCRIPT_EXECUTION_CONFLICT_MESSAGE =
  "A script is still running. Wait for it to finish before this action.";

export function generateExecutionToken(): {
  token: string;
  digest: string;
  credentialId: string;
} {
  const token = randomBytes(32).toString("base64url");
  const credentialId = randomBytes(16).toString("hex");
  return {
    token,
    digest: digestExecutionToken(token),
    credentialId,
  };
}

export async function activateExecutionCredential(params: {
  prisma: PrismaClient;
  projectId: string;
  executionId: string;
}): Promise<{ token: string; credentialId: string } | null> {
  const token = generateExecutionToken();
  const updated = await params.prisma.inAppAgentScriptExecution.updateMany({
    where: {
      id: params.executionId,
      projectId: params.projectId,
      state: InAppAgentScriptExecutionState.PENDING,
    },
    data: {
      credentialId: token.credentialId,
      tokenDigest: token.digest,
      tokenRevokedAt: null,
      state: InAppAgentScriptExecutionState.RUNNING,
      startedAt: new Date(),
    },
  });

  if (updated.count === 0) {
    return null;
  }

  return { token: token.token, credentialId: token.credentialId };
}

export function tokensEqual(left: string, right: string): boolean {
  const leftBuf = Buffer.from(left);
  const rightBuf = Buffer.from(right);
  if (leftBuf.length !== rightBuf.length) {
    return false;
  }
  return timingSafeEqual(leftBuf, rightBuf);
}

export async function assertNoActiveScriptExecution(params: {
  prisma: PrismaClient | InAppAgentTx;
  projectId: string;
  conversationId: string;
}): Promise<void> {
  const active = await params.prisma.inAppAgentScriptExecution.findFirst({
    where: {
      projectId: params.projectId,
      conversationId: params.conversationId,
      state: {
        in: [
          InAppAgentScriptExecutionState.PENDING,
          InAppAgentScriptExecutionState.RUNNING,
        ],
      },
    },
    select: { id: true },
  });

  if (active) {
    throw new LangfuseConflictError(ACTIVE_SCRIPT_EXECUTION_CONFLICT_MESSAGE);
  }
}

export async function admitApprovedScriptExecution(params: {
  prisma: PrismaClient;
  projectId: string;
  conversationId: string;
  parentRunId: string;
  waitingRunId: string;
  executionId: string;
  toolCallId: string;
  decidedByUserId: string;
  script: string;
  summary: string;
  limits?: InAppAgentScriptExecutionLimits;
  modelBinding?: Prisma.InputJsonValue;
  providerSessionId?: string | null;
  model?: string;
}): Promise<{ waitingRunId: string; executionId: string }> {
  const parsedArgs = InAppAgentRunApprovedScriptArgsSchema.parse({
    script: params.script,
    summary: params.summary,
  });
  const limits = InAppAgentScriptExecutionLimitsSchema.parse(
    params.limits ?? IN_APP_AGENT_SCRIPT_EXECUTION_DEFAULT_LIMITS,
  );
  const scriptDigest = digestScript(parsedArgs.script);
  const now = new Date();
  const deadlineAt = new Date(now.getTime() + limits.lifetimeMs);

  await params.prisma.$transaction(async (tx) => {
    await lockConversation(tx, params.projectId, params.conversationId);

    const parentRun = await tx.inAppAgentRun.findFirst({
      where: {
        id: params.parentRunId,
        projectId: params.projectId,
        conversationId: params.conversationId,
      },
      select: {
        status: true,
        finishedAt: true,
        claimedAt: true,
        createdAt: true,
        request: true,
      },
    });

    if (
      !parentRun ||
      parentRun.status !== InAppAgentRunStatus.AWAITING_APPROVAL
    ) {
      throw new LangfuseConflictError(
        "This approval is no longer pending. Reload the conversation.",
      );
    }

    const parkedAt = parentRun.finishedAt;
    if (
      parkedAt &&
      Date.now() - parkedAt.getTime() > IN_APP_AGENT_APPROVAL_TTL_MS
    ) {
      await tx.inAppAgentRun.updateMany({
        where: {
          id: params.parentRunId,
          projectId: params.projectId,
          status: InAppAgentRunStatus.AWAITING_APPROVAL,
        },
        data: {
          status: InAppAgentRunStatus.FAILED,
          errorCode: InAppAgentRunErrorCode.APPROVAL_EXPIRED,
          errorMessage: "The approval request expired",
        },
      });
      throw new LangfuseConflictError("The approval request expired.");
    }

    const { count } = await tx.inAppAgentRun.updateMany({
      where: {
        id: params.parentRunId,
        projectId: params.projectId,
        status: InAppAgentRunStatus.AWAITING_APPROVAL,
      },
      data: { status: InAppAgentRunStatus.SUCCEEDED },
    });

    if (count === 0) {
      throw new LangfuseConflictError(
        "This approval was already decided. Reload the conversation.",
      );
    }

    const parentRequest = InAppAgentRunRequestSchema.safeParse(
      parentRun.request,
    );
    const continuationNumber =
      parentRequest.success && parentRequest.data.kind !== "userMessage"
        ? (parentRequest.data.continuationNumber ?? 1) + 1
        : 1;
    const rootRunId = resolveInAppAgentRootRunId(
      parentRun.request,
      params.parentRunId,
    );
    const traceStartedAt =
      parentRequest.success &&
      parentRequest.data.kind !== "userMessage" &&
      parentRequest.data.traceStartedAt
        ? parentRequest.data.traceStartedAt
        : (parentRun.claimedAt ?? parentRun.createdAt).toISOString();

    await tx.inAppAgentEvent.create({
      data: {
        projectId: params.projectId,
        conversationId: params.conversationId,
        runId: params.parentRunId,
        sequenceNumber: await nextSequenceNumber(tx, {
          projectId: params.projectId,
          conversationId: params.conversationId,
        }),
        type: "CUSTOM",
        event: buildInAppAgentApprovalDecisionEvent({
          toolCallId: params.toolCallId,
          approved: true,
          decidedByUserId: params.decidedByUserId,
        }) as unknown as Prisma.InputJsonValue,
      },
    });

    await tx.inAppAgentRun.create({
      data: {
        id: params.waitingRunId,
        projectId: params.projectId,
        conversationId: params.conversationId,
        triggeredByUserId: params.decidedByUserId,
        model: params.model,
        status: InAppAgentRunStatus.WAITING_EXECUTION,
        request: {
          kind: "scriptExecution",
          parentRunId: params.parentRunId,
          rootRunId,
          traceStartedAt,
          continuationNumber,
          toolCallId: params.toolCallId,
          executionId: params.executionId,
          context: parentRequest.success ? parentRequest.data.context : [],
        },
      },
    });

    await tx.inAppAgentScriptExecution.create({
      data: {
        id: params.executionId,
        projectId: params.projectId,
        conversationId: params.conversationId,
        userId: params.decidedByUserId,
        parentRunId: params.parentRunId,
        waitingRunId: params.waitingRunId,
        toolCallId: params.toolCallId,
        script: parsedArgs.script,
        scriptDigest,
        summary: parsedArgs.summary,
        modelBinding: params.modelBinding,
        limits,
        providerSessionId: params.providerSessionId,
        admittedAt: now,
        deadlineAt,
        state: InAppAgentScriptExecutionState.PENDING,
        credentialId: params.executionId,
        tokenDigest: digestExecutionToken(`pending:${params.executionId}`),
        tokenRevokedAt: now,
      },
    });
  });

  recordRunTerminalOutcome({
    status: InAppAgentRunStatus.SUCCEEDED,
  });

  return {
    waitingRunId: params.waitingRunId,
    executionId: params.executionId,
  };
}

export async function completeScriptExecution(params: {
  prisma: PrismaClient;
  projectId: string;
  executionId: string;
  state:
    | typeof InAppAgentScriptExecutionState.SUCCEEDED
    | typeof InAppAgentScriptExecutionState.FAILED
    | typeof InAppAgentScriptExecutionState.TIMED_OUT
    | typeof InAppAgentScriptExecutionState.UNKNOWN;
  output?: string;
  exitCode?: number | null;
  errorMessage?: string | null;
  resultSummary?: Prisma.InputJsonValue;
  continuationRunId: string;
}): Promise<{ continuationRunId: string } | { alreadyCompleted: true }> {
  const outcome = await params.prisma.$transaction(async (tx) => {
    const execution = await tx.inAppAgentScriptExecution.findUnique({
      where: {
        id_projectId: {
          id: params.executionId,
          projectId: params.projectId,
        },
      },
    });

    if (!execution) {
      throw new LangfuseConflictError("Script execution was not found.");
    }

    await lockConversation(tx, execution.projectId, execution.conversationId);

    if (isTerminalScriptExecutionState(execution.state)) {
      return execution.continuationRunId
        ? {
            type: "existing" as const,
            continuationRunId: execution.continuationRunId,
          }
        : { type: "already" as const };
    }

    const waitingRun = await tx.inAppAgentRun.findFirst({
      where: {
        id: execution.waitingRunId,
        projectId: execution.projectId,
        status: InAppAgentRunStatus.WAITING_EXECUTION,
      },
      select: { request: true, triggeredByUserId: true, model: true },
    });

    if (!waitingRun) {
      throw new LangfuseConflictError(
        "The waiting run is no longer bound to this execution.",
      );
    }

    const waitingRequest = InAppAgentRunRequestSchema.safeParse(
      waitingRun.request,
    );
    const continuationNumber =
      waitingRequest.success && waitingRequest.data.kind !== "userMessage"
        ? (waitingRequest.data.continuationNumber ?? 1) + 1
        : 1;
    const rootRunId = resolveInAppAgentRootRunId(
      waitingRun.request,
      execution.waitingRunId,
    );
    const traceStartedAt =
      waitingRequest.success &&
      waitingRequest.data.kind !== "userMessage" &&
      waitingRequest.data.traceStartedAt
        ? waitingRequest.data.traceStartedAt
        : undefined;

    const finishError = waitingRunFinishError(params);

    await tx.inAppAgentRun.updateMany({
      where: {
        id: execution.waitingRunId,
        projectId: execution.projectId,
        status: InAppAgentRunStatus.WAITING_EXECUTION,
      },
      data: {
        status:
          params.state === InAppAgentScriptExecutionState.SUCCEEDED
            ? InAppAgentRunStatus.SUCCEEDED
            : InAppAgentRunStatus.FAILED,
        finishedAt: new Date(),
        ...finishError,
      },
    });

    await tx.inAppAgentScriptExecution.update({
      where: {
        id_projectId: {
          id: execution.id,
          projectId: execution.projectId,
        },
      },
      data: {
        state: params.state,
        output: params.output,
        exitCode: params.exitCode,
        errorMessage: params.errorMessage,
        resultSummary: params.resultSummary,
        tokenRevokedAt: new Date(),
        continuationRunId: params.continuationRunId,
      },
    });

    await tx.inAppAgentRun.create({
      data: {
        id: params.continuationRunId,
        projectId: execution.projectId,
        conversationId: execution.conversationId,
        triggeredByUserId: waitingRun.triggeredByUserId,
        model: waitingRun.model,
        status: InAppAgentRunStatus.QUEUED,
        request: {
          kind: "scriptExecutionCompleted",
          parentRunId: execution.waitingRunId,
          rootRunId,
          traceStartedAt,
          continuationNumber,
          toolCallId: execution.toolCallId,
          executionId: execution.id,
          context:
            waitingRequest.success && waitingRequest.data.kind !== "userMessage"
              ? waitingRequest.data.context
              : [],
        },
      },
    });

    return {
      type: "created" as const,
      continuationRunId: params.continuationRunId,
    };
  });

  if (outcome.type === "already") {
    return { alreadyCompleted: true };
  }

  if (outcome.type === "created") {
    recordRunTerminalOutcome({
      status:
        params.state === InAppAgentScriptExecutionState.SUCCEEDED
          ? InAppAgentRunStatus.SUCCEEDED
          : InAppAgentRunStatus.FAILED,
      errorCode: waitingRunErrorCode(params.state),
    });
  }

  return { continuationRunId: outcome.continuationRunId };
}

function waitingRunFinishError(params: {
  state:
    | typeof InAppAgentScriptExecutionState.SUCCEEDED
    | typeof InAppAgentScriptExecutionState.FAILED
    | typeof InAppAgentScriptExecutionState.TIMED_OUT
    | typeof InAppAgentScriptExecutionState.UNKNOWN;
  errorMessage?: string | null;
}): {
  errorCode?: InAppAgentRunErrorCode;
  errorMessage?: string;
} {
  if (params.state === InAppAgentScriptExecutionState.TIMED_OUT) {
    return {
      errorCode: InAppAgentRunErrorCode.SCRIPT_EXECUTION_TIMEOUT,
      errorMessage: params.errorMessage ?? "The script deadline elapsed",
    };
  }

  if (params.state === InAppAgentScriptExecutionState.UNKNOWN) {
    return {
      errorCode: InAppAgentRunErrorCode.SCRIPT_EXECUTION_UNKNOWN,
      errorMessage:
        params.errorMessage ?? "Script start acknowledgement was lost",
    };
  }

  if (params.state === InAppAgentScriptExecutionState.FAILED) {
    return {
      errorCode: InAppAgentRunErrorCode.SCRIPT_EXECUTION_FAILED,
      errorMessage: params.errorMessage ?? "The script failed",
    };
  }

  return {};
}

function waitingRunErrorCode(
  state:
    | typeof InAppAgentScriptExecutionState.SUCCEEDED
    | typeof InAppAgentScriptExecutionState.FAILED
    | typeof InAppAgentScriptExecutionState.TIMED_OUT
    | typeof InAppAgentScriptExecutionState.UNKNOWN,
): InAppAgentRunErrorCode | null {
  if (state === InAppAgentScriptExecutionState.TIMED_OUT) {
    return InAppAgentRunErrorCode.SCRIPT_EXECUTION_TIMEOUT;
  }

  if (state === InAppAgentScriptExecutionState.UNKNOWN) {
    return InAppAgentRunErrorCode.SCRIPT_EXECUTION_UNKNOWN;
  }

  if (state === InAppAgentScriptExecutionState.FAILED) {
    return InAppAgentRunErrorCode.SCRIPT_EXECUTION_FAILED;
  }

  return null;
}

async function nextSequenceNumber(
  tx: InAppAgentTx,
  params: { projectId: string; conversationId: string },
): Promise<number> {
  const latestEvent = await tx.inAppAgentEvent.findFirst({
    where: {
      projectId: params.projectId,
      conversationId: params.conversationId,
    },
    orderBy: { sequenceNumber: "desc" },
    select: { sequenceNumber: true },
  });

  return (latestEvent?.sequenceNumber ?? -1) + 1;
}
