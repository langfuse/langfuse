import { randomUUID } from "crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { prisma, AuditLogRecordType } from "@langfuse/shared/src/db";
import { createAndAddApiKeysToDb } from "@langfuse/shared/src/server/auth/apiKeys";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";

describe("in-app agent audit logging", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores the creator on in-app-agent MCP keys", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@test.com`,
        name: "In-app Agent User",
      },
    });

    const mcpApiKey = await createAndAddApiKeysToDb({
      prisma,
      entityId: projectId,
      scope: "PROJECT",
      note: "In-app agent MCP session",
      isInAppAgentKey: true,
      createdByUserId: user.id,
    });

    const persistedApiKey = await prisma.apiKey.findUniqueOrThrow({
      where: { id: mcpApiKey.id },
      select: {
        createdByUserId: true,
        isInAppAgentKey: true,
      },
    });

    expect(persistedApiKey).toEqual({
      createdByUserId: user.id,
      isInAppAgentKey: true,
    });
  });

  it("stores the creator user id on audit logs written by in-app agent API keys", async () => {
    const { orgId, projectId } = await createOrgProjectAndApiKey();
    const user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@test.com`,
        name: "Audit User",
      },
    });

    const mcpApiKey = await createAndAddApiKeysToDb({
      prisma,
      entityId: projectId,
      scope: "PROJECT",
      note: "In-app agent MCP session",
      isInAppAgentKey: true,
      createdByUserId: user.id,
    });

    const resourceId = randomUUID();
    await auditLog({
      action: "create",
      resourceType: "job",
      resourceId,
      orgId,
      projectId,
      apiKeyId: mcpApiKey.id,
    });

    const persistedAuditLog = await prisma.auditLog.findFirstOrThrow({
      where: {
        apiKeyId: mcpApiKey.id,
        resourceId,
      },
      select: {
        type: true,
        apiKeyId: true,
        userId: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    expect(persistedAuditLog).toEqual({
      type: AuditLogRecordType.API_KEY,
      apiKeyId: mcpApiKey.id,
      userId: user.id,
    });
  });

  it("writes API-key audit logs without an interactive Prisma transaction", async () => {
    const { orgId, projectId, publicKey } = await createOrgProjectAndApiKey();
    const apiKey = await prisma.apiKey.findUniqueOrThrow({
      where: { publicKey },
      select: { id: true },
    });

    const resourceId = randomUUID();
    const transactionSpy = vi.spyOn(prisma, "$transaction");

    await auditLog({
      action: "create",
      resourceType: "annotationQueueItem",
      resourceId,
      orgId,
      projectId,
      apiKeyId: apiKey.id,
    });

    expect(transactionSpy).not.toHaveBeenCalled();

    const persistedAuditLog = await prisma.auditLog.findFirstOrThrow({
      where: {
        apiKeyId: apiKey.id,
        resourceId,
      },
      select: {
        type: true,
        apiKeyId: true,
        userId: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    expect(persistedAuditLog).toEqual({
      type: AuditLogRecordType.API_KEY,
      apiKeyId: apiKey.id,
      userId: null,
    });
  });
});
