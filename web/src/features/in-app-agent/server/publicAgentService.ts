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
import { sendAdminAccessWebhook } from "@/src/server/adminAccessWebhook";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server";
import type { PostAgentRunBody } from "@/src/features/public-api/types/agent";
import { assertInAppAgentModelConfigured } from "./availability";
import { resolveAgentUserConnection } from "./userConnectionService";
import {
  cancelBackgroundRun,
  enqueueInAppAgentRun,
  startBackgroundRun,
} from "./backgroundRunService";

const API_CONVERSATION_PREFIX = "aconv_api_";
function connectionConversationPrefix(connectionId: string) {
  return `${API_CONVERSATION_PREFIX}${createHash("sha256").update(connectionId).digest("hex")}_`;
}
type ExternalAgentInput = Pick<
  z.infer<typeof PostAgentRunBody>,
  "message" | "conversationId" | "idempotencyKey"
>;

type ExternalAgentAccess = {
  projectId: string;
  userId: string;
  user: { v4BetaEnabled: boolean };
  organization: { aiTelemetryEnabled: boolean };
};
const SubmittedMessage = z.object({
  input: z.object({
    messages: z.array(
      z.object({ role: z.literal("user"), content: z.string() }),
    ),
  }),
});

async function resolvePublicAgentAccess(
  scope: ApiAccessScope,
  connectionId: string,
) {
  const projectId = env.LANGFUSE_IN_APP_AGENT_API_PROJECT_ID;
  if (!projectId || scope.projectId !== projectId) {
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

  const { userId } = await resolveAgentUserConnection({ scope, connectionId });

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
      select: { admin: true, email: true, v4BetaEnabled: true },
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
  if (!user || (!user.admin && (!role || role === "NONE"))) {
    throw new ForbiddenError(
      "The linked user does not have access to this project",
    );
  }
  if (user.admin) {
    await sendAdminAccessWebhook({
      email: user.email,
      projectId,
      orgId: scope.orgId,
    });
  }
  return {
    projectId,
    userId,
    connectionId,
    user,
    organization: project.organization,
  };
}

export async function startPublicAgentRun(params: {
  scope: ApiAccessScope;
  input: z.infer<typeof PostAgentRunBody>;
}) {
  const access = await resolvePublicAgentAccess(
    params.scope,
    params.input.connectionId,
  );
  const digest = createHash("sha256")
    .update(
      JSON.stringify([
        access.projectId,
        access.userId,
        access.connectionId,
        params.input.idempotencyKey,
      ]),
    )
    .digest("hex");
  const conversationPrefix = connectionConversationPrefix(access.connectionId);
  return startAgentRun({
    ...params,
    access,
    conversationPrefix,
    runId: `arun_api_${digest}`,
    conversationId:
      params.input.conversationId ?? `${conversationPrefix}${digest}`,
  });
}

export async function startExternalAgentRun(params: {
  scope: ApiAccessScope;
  access: ExternalAgentAccess;
  namespace: string;
  input: ExternalAgentInput;
}) {
  const { access } = params;
  const digest = createHash("sha256")
    .update(
      JSON.stringify([
        access.projectId,
        access.userId,
        params.input.idempotencyKey,
      ]),
    )
    .digest("hex");
  const conversationPrefix = `aconv_${params.namespace}_`;
  return startAgentRun({
    ...params,
    conversationPrefix,
    runId: `arun_${params.namespace}_${digest}`,
    conversationId:
      params.input.conversationId ?? `${conversationPrefix}${digest}`,
  });
}

async function startAgentRun(params: {
  scope: ApiAccessScope;
  access: ExternalAgentAccess;
  input: ExternalAgentInput;
  conversationPrefix: string;
  runId: string;
  conversationId: string;
}) {
  const { access, conversationPrefix, runId, conversationId } = params;
  if (!conversationId.startsWith(conversationPrefix)) {
    throw new LangfuseNotFoundError("Agent conversation not found");
  }
  const submission = {
    ...access,
    conversationPrefix,
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
  conversationPrefix: string;
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
  conversationPrefix: string;
  projectId: string;
  userId: string;
  runId: string;
}) {
  return {
    id: params.runId,
    projectId: params.projectId,
    triggeredByUserId: params.userId,
    conversation: {
      id: { startsWith: params.conversationPrefix },
      createdByUserId: params.userId,
      deletedAt: null,
    },
  };
}

export async function getPublicAgentRun(params: {
  scope: ApiAccessScope;
  runId: string;
  connectionId: string;
}) {
  const access = await resolvePublicAgentAccess(
    params.scope,
    params.connectionId,
  );
  return getExternalAgentRun({
    access,
    runId: params.runId,
    conversationPrefix: connectionConversationPrefix(access.connectionId),
  });
}

export async function getExternalAgentRun(params: {
  access: ExternalAgentAccess;
  runId: string;
  conversationPrefix: string;
}) {
  const { access } = params;
  const where = apiRunWhere({
    ...access,
    runId: params.runId,
    conversationPrefix: params.conversationPrefix,
  });
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
  connectionId: string;
}) {
  const access = await resolvePublicAgentAccess(
    params.scope,
    params.connectionId,
  );
  return cancelExternalAgentRun({
    access,
    runId: params.runId,
    conversationPrefix: connectionConversationPrefix(access.connectionId),
  });
}

export async function cancelExternalAgentRun(params: {
  access: ExternalAgentAccess;
  runId: string;
  conversationPrefix: string;
}) {
  const { access } = params;
  const run = await prisma.inAppAgentRun.findFirst({
    where: apiRunWhere({
      ...access,
      runId: params.runId,
      conversationPrefix: params.conversationPrefix,
    }),
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
