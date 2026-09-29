import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiKeyFindUnique: vi.fn(),
  auditLogCreate: vi.fn(),
  loggerInfo: vi.fn(),
}));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    apiKey: { findUnique: mocks.apiKeyFindUnique },
    auditLog: { create: mocks.auditLogCreate },
  },
  AuditLogRecordType: { USER: "USER", API_KEY: "API_KEY" },
}));

vi.mock("@langfuse/shared/src/server", () => ({
  logger: { info: mocks.loggerInfo },
}));

import { auditLog } from "@/src/features/audit-logs/auditLog";

describe("auditLog actor logging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auditLogCreate.mockResolvedValue({});
  });

  it("logs the user id and resource id for session-based audit logs", async () => {
    await auditLog({
      resourceType: "trace",
      resourceId: "trace-1",
      action: "delete",
      session: {
        user: { id: "user-1" },
        orgId: "org-1",
        projectId: "project-1",
      },
    });

    expect(mocks.loggerInfo).toHaveBeenCalledTimes(1);
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      "Audit log: trace.delete trace-1 by USER user-1",
      expect.objectContaining({
        auditLog: true,
        resourceType: "trace",
        resourceId: "trace-1",
        action: "delete",
        actorType: "USER",
        userId: "user-1",
        orgId: "org-1",
        projectId: "project-1",
      }),
    );
  });

  it("logs the user id for explicit userId audit logs", async () => {
    await auditLog({
      resourceType: "project",
      resourceId: "project-1",
      action: "update",
      userId: "user-2",
      orgId: "org-1",
    });

    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      "Audit log: project.update project-1 by USER user-2",
      expect.objectContaining({ actorType: "USER", userId: "user-2" }),
    );
  });

  it("logs the public key and api key id for API key audit logs", async () => {
    mocks.apiKeyFindUnique.mockResolvedValue({
      isInAppAgentKey: false,
      createdByUserId: null,
      publicKey: "pk-lf-test",
    });

    await auditLog({
      resourceType: "trace",
      resourceId: "trace-2",
      action: "delete",
      apiKeyId: "api-key-1",
      orgId: "org-1",
      projectId: "project-1",
    });

    expect(mocks.apiKeyFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ publicKey: true }),
      }),
    );
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      "Audit log: trace.delete trace-2 by API_KEY pk-lf-test",
      expect.objectContaining({
        actorType: "API_KEY",
        apiKeyId: "api-key-1",
        publicKey: "pk-lf-test",
        userId: undefined,
      }),
    );
  });

  it("logs the creator user id for in-app agent API keys", async () => {
    mocks.apiKeyFindUnique.mockResolvedValue({
      isInAppAgentKey: true,
      createdByUserId: "user-3",
      publicKey: "pk-lf-agent",
    });

    await auditLog({
      resourceType: "job",
      resourceId: "job-1",
      action: "create",
      apiKeyId: "api-key-2",
      orgId: "org-1",
    });

    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      "Audit log: job.create job-1 by API_KEY pk-lf-agent",
      expect.objectContaining({
        actorType: "API_KEY",
        apiKeyId: "api-key-2",
        userId: "user-3",
      }),
    );
  });

  it("falls back to the api key id when the key no longer exists", async () => {
    mocks.apiKeyFindUnique.mockResolvedValue(null);

    await auditLog({
      resourceType: "trace",
      resourceId: "trace-3",
      action: "delete",
      apiKeyId: "api-key-deleted",
      orgId: "org-1",
    });

    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      "Audit log: trace.delete trace-3 by API_KEY api-key-deleted",
      expect.objectContaining({
        apiKeyId: "api-key-deleted",
        publicKey: undefined,
      }),
    );
  });

  it("does not log when writing the audit log record fails", async () => {
    mocks.auditLogCreate.mockRejectedValue(new Error("db down"));

    await expect(
      auditLog({
        resourceType: "trace",
        resourceId: "trace-4",
        action: "delete",
        userId: "user-1",
        orgId: "org-1",
      }),
    ).rejects.toThrow("db down");

    expect(mocks.loggerInfo).not.toHaveBeenCalled();
  });
});
