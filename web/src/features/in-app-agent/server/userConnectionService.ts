import { createHash, randomBytes } from "node:crypto";
import { ForbiddenError, LangfuseNotFoundError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import type { ApiAccessScope } from "@langfuse/shared/src/server";
import type { z } from "zod";
import { env } from "@/src/env.mjs";
import { auditLog } from "@/src/features/audit-logs/server";
import type { PostAgentConnectionBody } from "@/src/features/public-api/types/agent-connections";
import { getProductBaseUrl } from "@/src/utils/base-url";

const LINK_LIFETIME_MS = 10 * 60 * 1000;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function assertProjectEnabled(
  projectId: string | null,
): asserts projectId is string {
  if (!projectId || projectId !== env.LANGFUSE_IN_APP_AGENT_API_PROJECT_ID) {
    throw new LangfuseNotFoundError(
      "Agent API is not enabled for this project",
    );
  }
}

export async function resolveAgentUserConnection(params: {
  scope: ApiAccessScope;
  connectionId: string;
}) {
  assertProjectEnabled(params.scope.projectId);
  // Consent delegates this identity only to the bridge's authenticated API key.
  const connection = await prisma.userConnection.findFirst({
    where: {
      id: params.connectionId,
      projectId: params.scope.projectId,
      apiKeyId: params.scope.apiKeyId,
      provider: "slack",
      userId: { not: null },
    },
    select: { userId: true },
  });
  if (!connection?.userId) {
    throw new ForbiddenError(
      "Link your Langfuse account before chatting with the agent",
    );
  }
  return { userId: connection.userId };
}

export async function getOrCreateAgentUserConnection(params: {
  scope: ApiAccessScope;
  input: z.infer<typeof PostAgentConnectionBody>;
}) {
  assertProjectEnabled(params.scope.projectId);
  const identity = {
    projectId: params.scope.projectId,
    apiKeyId: params.scope.apiKeyId,
    ...params.input,
  };
  const connection = await prisma.userConnection.upsert({
    where: { projectId_apiKeyId_provider_workspaceId_externalUserId: identity },
    create: identity,
    update: {},
    select: { id: true, userId: true },
  });
  if (connection.userId) {
    return {
      connectionId: connection.id,
      userId: connection.userId,
      linkUrl: null,
    };
  }

  const token = randomBytes(32).toString("hex");
  const pending = await prisma.userConnection.updateMany({
    where: { id: connection.id, ...identity, userId: null },
    data: {
      linkTokenHash: hashToken(token),
      linkExpiresAt: new Date(Date.now() + LINK_LIFETIME_MS),
    },
  });
  if (pending.count !== 1) {
    const linked = await resolveAgentUserConnection({
      scope: params.scope,
      connectionId: connection.id,
    });
    return {
      connectionId: connection.id,
      userId: linked.userId,
      linkUrl: null,
    };
  }
  const linkUrl = new URL("agent/connect", getProductBaseUrl());
  linkUrl.searchParams.set("token", token);
  return {
    connectionId: connection.id,
    userId: null,
    linkUrl: linkUrl.toString(),
  };
}

async function getPendingConnection(token: string) {
  const connection = await prisma.userConnection.findFirst({
    where: {
      projectId: env.LANGFUSE_IN_APP_AGENT_API_PROJECT_ID ?? "",
      linkTokenHash: hashToken(token),
      linkExpiresAt: { gt: new Date() },
      userId: null,
      project: { deletedAt: null },
      apiKey: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    },
    select: {
      id: true,
      projectId: true,
      workspaceId: true,
      externalUserId: true,
      project: { select: { name: true, orgId: true } },
      apiKey: { select: { note: true } },
    },
  });
  if (!connection) {
    throw new LangfuseNotFoundError(
      "This connection link is invalid or expired. Ask the agent for a new link.",
    );
  }
  return connection;
}

export async function inspectAgentUserConnection(token: string) {
  const connection = await getPendingConnection(token);
  return {
    projectId: connection.projectId,
    projectName: connection.project.name,
    workspaceId: connection.workspaceId,
    externalUserId: connection.externalUserId,
    apiKeyName: connection.apiKey.note,
  };
}

export async function confirmAgentUserConnection(params: {
  token: string;
  userId: string;
}) {
  const connection = await getPendingConnection(params.token);
  await prisma.$transaction(async (tx) => {
    const [user, membership] = await Promise.all([
      tx.user.findUnique({
        where: { id: params.userId },
        select: { admin: true },
      }),
      tx.organizationMembership.findUnique({
        where: {
          orgId_userId: {
            orgId: connection.project.orgId,
            userId: params.userId,
          },
        },
        select: {
          role: true,
          ProjectMemberships: {
            where: { projectId: connection.projectId, userId: params.userId },
            select: { role: true },
          },
        },
      }),
    ]);
    const role = membership?.ProjectMemberships[0]?.role ?? membership?.role;
    if (!user || (!user.admin && (!role || role === "NONE"))) {
      throw new ForbiddenError(
        "You do not have access to this Langfuse project",
      );
    }
    const linked = await tx.userConnection.updateMany({
      where: {
        id: connection.id,
        projectId: connection.projectId,
        userId: null,
        linkTokenHash: hashToken(params.token),
        linkExpiresAt: { gt: new Date() },
      },
      data: { userId: params.userId, linkTokenHash: null, linkExpiresAt: null },
    });
    if (linked.count !== 1) {
      throw new ForbiddenError(
        "This connection link has expired or already been used",
      );
    }
    await auditLog(
      {
        userId: params.userId,
        orgId: connection.project.orgId,
        projectId: connection.projectId,
        resourceType: "userConnection",
        resourceId: connection.id,
        action: "create",
        after: {
          provider: "slack",
          workspaceId: connection.workspaceId,
          externalUserId: connection.externalUserId,
        },
      },
      tx,
    );
  });
  return { userId: params.userId };
}
