import { createHash, timingSafeEqual } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import {
  BaseError,
  CloudConfigSchema,
  ForbiddenError,
  LangfuseNotFoundError,
  ServiceUnavailableError,
  UnauthorizedError,
} from "@langfuse/shared";
import { prisma, Role } from "@langfuse/shared/src/db";
import {
  type ApiAccessScope,
  addUserToSpan,
} from "@langfuse/shared/src/server";
import type { AgUiEvent } from "@langfuse/shared/in-app-agent";
import { isInAppAgentInstanceEnabled } from "@langfuse/shared/in-app-agent/server/modelProvider";
import {
  getOrganizationPlanServerSide,
  hasEntitlementBasedOnPlan,
} from "@/src/features/entitlements/server";
import { env } from "@/src/env.mjs";
import { createInAppAgentConversationId } from "../ids";
import { InAppAgentTurnInputSchema } from "../schema";
import { assertInAppAgentModelConfigured } from "./availability";
import {
  startBackgroundRun,
  serializeConversationLatestRun,
} from "./backgroundRunService";
import { getConversationSnapshotFromEvents } from "./conversationSnapshot";
import { assertInAppAgentRateLimit } from "./rateLimit";

const CredentialsSchema = z
  .array(
    z.object({
      id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
      tokenSha256: z.string().regex(/^[a-f0-9]{64}$/),
      projectId: z.string().min(1),
      userId: z.string().min(1),
    }),
  )
  .refine(
    (credentials) =>
      new Set(credentials.map(({ id }) => id)).size === credentials.length &&
      new Set(credentials.map(({ tokenSha256 }) => tokenSha256)).size ===
        credentials.length,
  );

const StartInput = InAppAgentTurnInputSchema.extend({
  projectId: z.string().min(1),
  userId: z.string().min(1),
}).strict();

/** These credentials authorize only this endpoint, independently of project API keys. */
async function authorizeWebhook(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (!env.LANGFUSE_IN_APP_AGENT_WEBHOOKS) {
    throw new LangfuseNotFoundError("Agent webhook is not configured");
  }

  let credentials: z.infer<typeof CredentialsSchema>;
  try {
    credentials = CredentialsSchema.parse(
      JSON.parse(env.LANGFUSE_IN_APP_AGENT_WEBHOOKS),
    );
  } catch {
    // Never propagate parser errors containing credential configuration.
    throw new ServiceUnavailableError("Invalid agent webhook configuration");
  }

  const token = /^Bearer ([a-zA-Z0-9_-]{1,64})\.([a-f0-9]{64})$/i.exec(
    req.headers.authorization ?? "",
  );
  const credential = credentials.find(({ id }) => id === token?.[1]);
  if (
    !token ||
    !credential ||
    !timingSafeEqual(
      createHash("sha256").update(token[2]).digest(),
      Buffer.from(credential.tokenSha256, "hex"),
    )
  ) {
    throw new UnauthorizedError("Invalid agent webhook credential");
  }

  const project = await prisma.project.findFirst({
    where: { id: credential.projectId, deletedAt: null },
    select: {
      orgId: true,
      organization: {
        select: {
          cloudConfig: true,
          aiFeaturesEnabled: true,
          aiTelemetryEnabled: true,
        },
      },
    },
  });
  const membership =
    project &&
    (await prisma.organizationMembership.findUnique({
      where: {
        orgId_userId: { orgId: project.orgId, userId: credential.userId },
      },
      select: {
        role: true,
        user: { select: { v4BetaEnabled: true } },
        ProjectMemberships: {
          where: { projectId: credential.projectId, userId: credential.userId },
          select: { role: true },
        },
      },
    }));
  if (
    !project ||
    !membership ||
    (membership.ProjectMemberships[0]?.role ?? membership.role) === Role.NONE
  ) {
    throw new ForbiddenError(
      "Webhook user is not a member of the target project",
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
  const cloudConfig = CloudConfigSchema.safeParse(
    project.organization.cloudConfig,
  ).data;
  const plan = getOrganizationPlanServerSide(cloudConfig);
  if (
    !project.organization.aiFeaturesEnabled ||
    !hasEntitlementBasedOnPlan({ plan, entitlement: "in-app-agent" })
  ) {
    throw new ForbiddenError(
      "In-app agent is not available for the target project",
    );
  }

  const scope: ApiAccessScope = {
    orgId: project.orgId,
    projectId: credential.projectId,
    plan,
    accessLevel: "project",
    apiKeyId: "in-app-agent-webhook",
    publicKey: "in-app-agent-webhook",
    isIngestionSuspended: false,
    rateLimitOverrides: cloudConfig?.rateLimitOverrides ?? [],
  };
  addUserToSpan({ userId: credential.userId });
  return { credential, scope, project, user: membership.user };
}

export async function startWebhookRun(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { credential, scope, project, user } = await authorizeWebhook(req, res);
  const input = StartInput.parse(req.body);
  if (
    input.projectId !== credential.projectId ||
    input.userId !== credential.userId
  ) {
    throw new ForbiddenError(
      "Request does not match the webhook project and user",
    );
  }
  const model = assertInAppAgentModelConfigured();
  await assertInAppAgentRateLimit(scope, "in-app-agent-run");
  const result = await startBackgroundRun({
    prisma,
    projectId: credential.projectId,
    orgId: project.orgId,
    plan: scope.plan,
    userId: credential.userId,
    conversationId: createInAppAgentConversationId(),
    message: input.message,
    context: input.context,
    isV4Enabled:
      env.LANGFUSE_MIGRATION_V4_WRITE_MODE === "events_only" ||
      (env.LANGFUSE_MIGRATION_V4_WRITE_MODE === "dual" &&
        (Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) ||
          env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true") &&
        user.v4BetaEnabled),
    model: model.modelId,
    aiTelemetryEnabled: project.organization.aiTelemetryEnabled,
    webhookCredentialId: credential.id,
  });
  res.status(202).json(result);
}

export async function getWebhookRun(req: NextApiRequest, res: NextApiResponse) {
  const { credential, scope } = await authorizeWebhook(req, res);
  const { runId } = z
    .object({ runId: z.string().min(1) })
    .strict()
    .parse(req.query);
  await assertInAppAgentRateLimit(scope, "public-api");
  // A single join keeps terminal status and the final event prefix consistent.
  // Scope to the submitted run: later UI turns in this conversation stay private.
  const run = await prisma.inAppAgentRun.findFirst({
    relationLoadStrategy: "join",
    where: {
      id: runId,
      projectId: credential.projectId,
      triggeredByUserId: credential.userId,
      request: { path: ["webhookCredentialId"], equals: credential.id },
      conversation: { createdByUserId: credential.userId, deletedAt: null },
    },
    select: {
      id: true,
      conversationId: true,
      status: true,
      errorCode: true,
      cancelRequestedAt: true,
      createdAt: true,
      claimedAt: true,
      heartbeatAt: true,
      finishedAt: true,
      events: {
        where: { projectId: credential.projectId },
        orderBy: { sequenceNumber: "asc" },
        select: {
          event: true,
          runId: true,
          createdAt: true,
          sequenceNumber: true,
        },
      },
    },
  });
  if (!run) {
    throw new LangfuseNotFoundError("Agent run not found");
  }
  const summary = serializeConversationLatestRun(run);
  if (!summary) {
    throw new ServiceUnavailableError("Agent run status is unavailable");
  }
  const { messages } = getConversationSnapshotFromEvents(
    run.events.map((event) => ({
      ...event,
      event: event.event as unknown as AgUiEvent,
    })),
  );
  res.status(200).json({
    conversationId: run.conversationId,
    runId: run.id,
    status: summary.status,
    errorCode: summary.errorCode,
    messages,
  });
}
