import { createHash } from "node:crypto";
import { EventType } from "@ag-ui/core";
import { z } from "zod";
import {
  BaseError,
  ForbiddenError,
  LangfuseConflictError,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { prisma, Prisma } from "@langfuse/shared/src/db";
import type { ApiAccessScope } from "@langfuse/shared/src/server";
import {
  InAppAgentRunStatus,
  InAppAgentRunStatusSchema,
  type AgUiEvent,
} from "@langfuse/shared/in-app-agent";
import {
  createConversationMessageAccumulator,
  getOwnedConversationOrThrow,
} from "@langfuse/shared/in-app-agent/server/persistence";
import { reconcileConversationRuns } from "@langfuse/shared/in-app-agent/server/runLifecycle";
import { isInAppAgentInstanceEnabled } from "@langfuse/shared/in-app-agent/server/modelProvider";
import { env } from "@/src/env.mjs";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server";
import type { PostAgentRunBody } from "@/src/features/public-api/types/agent";
import { assertInAppAgentModelConfigured } from "./availability";
import {
  cancelBackgroundRun,
  enqueueInAppAgentRun,
  startBackgroundRun,
} from "./backgroundRunService";

const API_CONVERSATION_PREFIX = "aconv_api_";
const SubmittedMessage = z.object({
  input: z.object({
    messages: z.array(
      z.object({ role: z.literal("user"), content: z.string() }),
    ),
  }),
});

async function resolvePublicAgentAccess(scope: ApiAccessScope) {
  const projectId = env.LANGFUSE_IN_APP_AGENT_API_PROJECT_ID;
  const userId = env.LANGFUSE_IN_APP_AGENT_API_USER_ID;
  if (!projectId || !userId || scope.projectId !== projectId) {
    throw new LangfuseNotFoundError(
      "Agent API is not enabled for this project",
    );
  }
  if (!isInAppAgentInstanceEnabled()) {
    throw new BaseError(
      "PreconditionFailedError",
      412,
      "In-app agent is not enabled on this instance.",
      true,
    );
  }
  if (
    !hasEntitlementBasedOnPlan({
      plan: scope.plan,
      entitlement: "in-app-agent",
    })
  ) {
    throw new ForbiddenError(
      "This project does not have access to the in-app agent",
    );
  }

  const [project, user, membership] = await Promise.all([
    prisma.project.findFirst({
      where: { id: projectId, orgId: scope.orgId, deletedAt: null },
      select: {
        organization: {
          select: { aiFeaturesEnabled: true, aiTelemetryEnabled: true },
        },
      },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { admin: true, v4BetaEnabled: true },
    }),
    prisma.organizationMembership.findUnique({
      where: { orgId_userId: { orgId: scope.orgId, userId } },
      select: {
        role: true,
        ProjectMemberships: {
          where: { projectId, userId },
          select: { role: true },
        },
      },
    }),
  ]);
  if (!project?.organization.aiFeaturesEnabled) {
    throw new ForbiddenError(
      "In-app agent is not enabled for this organization",
    );
  }
  const role = membership?.ProjectMemberships[0]?.role ?? membership?.role;
  if (!user || user.admin || role !== "VIEWER") {
    throw new ForbiddenError(
      "Agent API requires a configured user with VIEWER access to this project",
    );
  }
  return { projectId, userId, user, organization: project.organization };
}

export async function startPublicAgentRun(params: {
  scope: ApiAccessScope;
  input: z.infer<typeof PostAgentRunBody>;
}) {
  const access = await resolvePublicAgentAccess(params.scope);
  if (
    params.input.conversationId !== undefined &&
    !params.input.conversationId.startsWith(API_CONVERSATION_PREFIX)
  ) {
    throw new LangfuseNotFoundError("Agent conversation not found");
  }
  const digest = createHash("sha256")
    .update(
      JSON.stringify([
        access.projectId,
        access.userId,
        params.input.idempotencyKey,
      ]),
    )
    .digest("hex");
  const runId = `arun_api_${digest}`;
  const conversationId =
    params.input.conversationId ?? `${API_CONVERSATION_PREFIX}${digest}`;
  const submission = {
    ...access,
    runId,
    conversationId,
    message: params.input.message,
  };

  const replay = await replaySubmission(submission);
  if (replay) {
    return replay;
  }

  const model = assertInAppAgentModelConfigured();
  if (params.input.conversationId) {
    await getOwnedConversationOrThrow({ prisma, ...access, conversationId });
  } else {
    // A deterministic first conversation makes concurrent retries converge before
    // startBackgroundRun takes the existing conversation's execution lock.
    await prisma.inAppAgentConversation.createMany({
      data: {
        id: conversationId,
        projectId: access.projectId,
        createdByUserId: access.userId,
      },
      skipDuplicates: true,
    });
  }

  try {
    return await startBackgroundRun({
      prisma,
      projectId: access.projectId,
      orgId: params.scope.orgId,
      plan: params.scope.plan,
      userId: access.userId,
      conversationId,
      runId,
      message: params.input.message,
      context: [],
      isV4Enabled: access.user.v4BetaEnabled,
      model: model.modelId,
      aiTelemetryEnabled: access.organization.aiTelemetryEnabled,
    });
  } catch (error) {
    if (
      error instanceof LangfuseConflictError ||
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002")
    ) {
      const concurrentReplay = await replaySubmission(submission);
      if (concurrentReplay) {
        return concurrentReplay;
      }
    }
    throw error;
  }
}

async function replaySubmission(params: {
  projectId: string;
  userId: string;
  runId: string;
  conversationId: string;
  message: string;
}) {
  const run = await prisma.inAppAgentRun.findFirst({
    where: apiRunWhere(params),
    select: {
      id: true,
      conversationId: true,
      status: true,
      events: {
        where: { type: EventType.RUN_STARTED },
        select: { event: true },
        take: 1,
      },
    },
  });
  if (!run) {
    return null;
  }
  const submitted = SubmittedMessage.safeParse(run.events[0]?.event);
  if (
    run.conversationId !== params.conversationId ||
    !submitted.success ||
    submitted.data.input.messages[0]?.content !== params.message
  ) {
    throw new LangfuseConflictError(
      "Idempotency key was already used for a different message or conversation",
    );
  }
  if (run.status === InAppAgentRunStatus.QUEUED) {
    // Repair a lost response or process exit between the database commit and
    // delivery. Queue job IDs and the worker's claim both deduplicate this run.
    await enqueueInAppAgentRun({
      prisma,
      projectId: params.projectId,
      runId: run.id,
    });
  }
  return { runId: run.id, conversationId: run.conversationId };
}

function apiRunWhere(params: {
  projectId: string;
  userId: string;
  runId: string;
}) {
  return {
    id: params.runId,
    projectId: params.projectId,
    triggeredByUserId: params.userId,
    conversation: {
      id: { startsWith: API_CONVERSATION_PREFIX },
      createdByUserId: params.userId,
      deletedAt: null,
    },
  };
}

export async function getPublicAgentRun(params: {
  scope: ApiAccessScope;
  runId: string;
}) {
  const access = await resolvePublicAgentAccess(params.scope);
  const where = apiRunWhere({ ...access, runId: params.runId });
  const ownedRun = await prisma.inAppAgentRun.findFirst({
    where,
    select: { conversationId: true },
  });
  if (!ownedRun) {
    throw new LangfuseNotFoundError("Agent run not found");
  }
  await reconcileConversationRuns({
    prisma,
    projectId: access.projectId,
    conversationId: ownedRun.conversationId,
  });

  // Read status and its event tail in one snapshot so a terminal response always
  // includes the text committed with it, even while another turn is starting.
  const run = await prisma.inAppAgentRun.findFirst({
    where,
    relationLoadStrategy: "join",
    select: {
      id: true,
      conversationId: true,
      status: true,
      errorCode: true,
      cancelRequestedAt: true,
      events: { orderBy: { sequenceNumber: "asc" }, select: { event: true } },
    },
  });
  if (!run) {
    throw new LangfuseNotFoundError("Agent run not found");
  }
  const accumulator = createConversationMessageAccumulator([]);
  for (const row of run.events) {
    accumulator.processEvent(row.event as unknown as AgUiEvent, run.id);
  }
  const text = accumulator
    .getMessages()
    .flatMap((message) =>
      message.role === "assistant" && message.content ? [message.content] : [],
    )
    .join("\n\n");

  return {
    runId: run.id,
    conversationId: run.conversationId,
    status: InAppAgentRunStatusSchema.parse(run.status),
    text: text || null,
    errorCode: run.errorCode,
    cancelRequested: Boolean(run.cancelRequestedAt),
  };
}

export async function cancelPublicAgentRun(params: {
  scope: ApiAccessScope;
  runId: string;
}) {
  const access = await resolvePublicAgentAccess(params.scope);
  const run = await prisma.inAppAgentRun.findFirst({
    where: apiRunWhere({ ...access, runId: params.runId }),
    select: { id: true, conversationId: true },
  });
  if (!run) {
    throw new LangfuseNotFoundError("Agent run not found");
  }
  await cancelBackgroundRun({
    prisma,
    ...access,
    runId: run.id,
    conversationId: run.conversationId,
  });
  return { runId: run.id, conversationId: run.conversationId };
}
