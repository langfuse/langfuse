import { createHash, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@langfuse/shared/src/db";
import {
  createOrgProjectAndApiKey,
  type ApiAccessScope,
} from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import {
  confirmAgentUserConnection,
  getOrCreateAgentUserConnection,
  inspectAgentUserConnection,
  resolveAgentUserConnection,
} from "@/src/features/in-app-agent/server/userConnectionService";

const originalProjectId = env.LANGFUSE_IN_APP_AGENT_API_PROJECT_ID;
afterEach(() =>
  Object.assign(env, {
    LANGFUSE_IN_APP_AGENT_API_PROJECT_ID: originalProjectId,
  }),
);

async function fixture() {
  const project = await createOrgProjectAndApiKey();
  const user = await prisma.user.create({
    data: { email: `${randomUUID()}@example.com` },
  });
  const membership = await prisma.organizationMembership.create({
    data: { orgId: project.orgId, userId: user.id, role: "OWNER" },
  });
  const apiKey = await prisma.apiKey.findUniqueOrThrow({
    where: { publicKey: project.publicKey },
  });
  const scope: ApiAccessScope = {
    projectId: project.projectId,
    orgId: project.orgId,
    apiKeyId: apiKey.id,
    publicKey: project.publicKey,
    accessLevel: "project",
    plan: "cloud:team",
    rateLimitOverrides: [],
    isIngestionSuspended: false,
  };
  Object.assign(env, {
    LANGFUSE_IN_APP_AGENT_API_PROJECT_ID: project.projectId,
  });
  const input = {
    provider: "slack" as const,
    workspaceId: "TWORKSPACE",
    externalUserId: "UUSER",
  };
  const connection = await getOrCreateAgentUserConnection({ scope, input });
  const token = new URL(connection.linkUrl!).searchParams.get("token")!;
  return { ...project, user, membership, scope, input, connection, token };
}

describe("agent user connections", () => {
  it("requires account confirmation, stores only a token digest, and resolves the consenting user", async () => {
    const f = await fixture();
    await expect(
      resolveAgentUserConnection({
        scope: f.scope,
        connectionId: f.connection.connectionId,
      }),
    ).rejects.toThrow("Link your Langfuse account");
    const pending = await prisma.userConnection.findUniqueOrThrow({
      where: { id: f.connection.connectionId },
    });
    expect(pending.linkTokenHash).toBe(
      createHash("sha256").update(f.token).digest("hex"),
    );
    expect(pending.linkTokenHash).not.toBe(f.token);
    expect(await inspectAgentUserConnection(f.token)).toMatchObject({
      projectId: f.projectId,
      workspaceId: "TWORKSPACE",
      externalUserId: "UUSER",
    });
    await expect(
      confirmAgentUserConnection({ token: f.token, userId: f.user.id }),
    ).resolves.toEqual({ userId: f.user.id });
    await expect(
      resolveAgentUserConnection({
        scope: f.scope,
        connectionId: f.connection.connectionId,
      }),
    ).resolves.toEqual({ userId: f.user.id });
    await expect(
      getOrCreateAgentUserConnection({ scope: f.scope, input: f.input }),
    ).resolves.toEqual({
      connectionId: f.connection.connectionId,
      userId: f.user.id,
      linkUrl: null,
    });
    expect(
      await prisma.auditLog.count({
        where: {
          resourceId: f.connection.connectionId,
          resourceType: "userConnection",
          userId: f.user.id,
        },
      }),
    ).toBe(1);
  });

  it("rejects expired and already consumed connection links", async () => {
    const f = await fixture();
    await prisma.userConnection.update({
      where: { id: f.connection.connectionId },
      data: { linkExpiresAt: new Date(0) },
    });
    await expect(inspectAgentUserConnection(f.token)).rejects.toThrow(
      "invalid or expired",
    );
    await expect(
      confirmAgentUserConnection({ token: f.token, userId: f.user.id }),
    ).rejects.toThrow("invalid or expired");
    const renewed = await getOrCreateAgentUserConnection({
      scope: f.scope,
      input: f.input,
    });
    const token = new URL(renewed.linkUrl!).searchParams.get("token")!;
    await confirmAgentUserConnection({ token, userId: f.user.id });
    await expect(
      confirmAgentUserConnection({ token, userId: f.user.id }),
    ).rejects.toThrow("invalid or expired");
    const linked = await prisma.userConnection.findUniqueOrThrow({
      where: { id: f.connection.connectionId },
    });
    expect(linked.linkTokenHash).toBeNull();
    expect(linked.linkExpiresAt).toBeNull();
  });

  it("allows only one user to consume a connection link concurrently", async () => {
    const f = await fixture();
    const otherUser = await prisma.user.create({
      data: { email: `${randomUUID()}@example.com` },
    });
    await prisma.organizationMembership.create({
      data: { orgId: f.orgId, userId: otherUser.id, role: "VIEWER" },
    });
    const results = await Promise.allSettled([
      confirmAgentUserConnection({ token: f.token, userId: f.user.id }),
      confirmAgentUserConnection({ token: f.token, userId: otherUser.id }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect(
      await prisma.auditLog.count({
        where: {
          resourceId: f.connection.connectionId,
          resourceType: "userConnection",
        },
      }),
    ).toBe(1);
  });

  it("rejects users outside the project and project role overrides that deny access", async () => {
    const f = await fixture();
    const outsider = await prisma.user.create({
      data: { email: `${randomUUID()}@example.com` },
    });
    await expect(
      confirmAgentUserConnection({ token: f.token, userId: outsider.id }),
    ).rejects.toThrow("do not have access");
    await prisma.projectMembership.create({
      data: {
        projectId: f.projectId,
        userId: f.user.id,
        orgMembershipId: f.membership.id,
        role: "NONE",
      },
    });
    await expect(
      confirmAgentUserConnection({ token: f.token, userId: f.user.id }),
    ).rejects.toThrow("do not have access");
    expect(
      (
        await prisma.userConnection.findUniqueOrThrow({
          where: { id: f.connection.connectionId },
        })
      ).userId,
    ).toBeNull();
  });

  it("binds each connection to its project and consenting bridge API key", async () => {
    const f = await fixture();
    await confirmAgentUserConnection({ token: f.token, userId: f.user.id });
    const other = await createOrgProjectAndApiKey();
    await expect(
      resolveAgentUserConnection({
        scope: { ...f.scope, projectId: other.projectId },
        connectionId: f.connection.connectionId,
      }),
    ).rejects.toThrow("not enabled");
    const otherKey = await prisma.apiKey.create({
      data: {
        projectId: f.projectId,
        publicKey: randomUUID(),
        hashedSecretKey: randomUUID(),
        displaySecretKey: "test",
        scope: "PROJECT",
      },
    });
    await expect(
      resolveAgentUserConnection({
        scope: { ...f.scope, apiKeyId: otherKey.id },
        connectionId: f.connection.connectionId,
      }),
    ).rejects.toThrow("Link your Langfuse account");
    const independent = await getOrCreateAgentUserConnection({
      scope: { ...f.scope, apiKeyId: otherKey.id },
      input: f.input,
    });
    expect(independent.userId).toBeNull();
    expect(independent.connectionId).not.toBe(f.connection.connectionId);
  });

  it("rejects consent after its bridge API key expires or is deleted", async () => {
    const f = await fixture();
    await prisma.apiKey.update({
      where: { id: f.scope.apiKeyId },
      data: { expiresAt: new Date(0) },
    });
    await expect(
      confirmAgentUserConnection({ token: f.token, userId: f.user.id }),
    ).rejects.toThrow("invalid or expired");
    await prisma.apiKey.delete({ where: { id: f.scope.apiKeyId } });
    expect(
      await prisma.userConnection.count({
        where: { id: f.connection.connectionId },
      }),
    ).toBe(0);
  });
});
