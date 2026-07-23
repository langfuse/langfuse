import { beforeEach, describe, expect, it, vi } from "vitest";
import { type Role } from "@langfuse/shared/src/db";

const { auditLogMock, redisSetMock, loggerMock } = vi.hoisted(() => ({
  auditLogMock: vi.fn(),
  redisSetMock: vi.fn(),
  loggerMock: { warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/src/features/audit-logs/auditLog", () => ({
  auditLog: (...args: unknown[]) => auditLogMock(...args),
}));

// Fully replace the heavy server module: the `server-unit` project resolver
// cannot `importActual` this aliased package, so we stub only what this test
// (redis.set, logger) and the global teardown (redis.status/disconnect,
// logger.debug, ClickHouseClientManager) touch.
vi.mock("@langfuse/shared/src/server", () => ({
  logger: loggerMock,
  redis: {
    set: (...args: unknown[]) => redisSetMock(...args),
    status: "end",
    disconnect: vi.fn(),
  },
  ClickHouseClientManager: {
    getInstance: () => ({
      closeAllConnections: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

import { recordTraceViewAudit } from "@/src/features/audit-logs/recordTraceViewAudit";

describe("recordTraceViewAudit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: dedup key did not exist yet → first view → write.
    redisSetMock.mockResolvedValue("OK");
  });

  it("builds session-variant auditLog args for UI views", async () => {
    await recordTraceViewAudit({
      session: {
        user: { id: "u1" },
        orgId: "o1",
        orgRole: "OWNER" as Role,
        projectId: "p1",
        projectRole: "MEMBER" as Role,
      },
      resourceId: "t1",
    });

    expect(auditLogMock).toHaveBeenCalledWith({
      session: {
        user: { id: "u1" },
        orgId: "o1",
        orgRole: "OWNER",
        projectId: "p1",
        projectRole: "MEMBER",
      },
      resourceId: "t1",
      resourceType: "trace",
      action: "read",
    });
  });

  it("builds apiKeyId-variant auditLog args for SDK reads", async () => {
    await recordTraceViewAudit({
      apiKeyId: "k1",
      orgId: "o1",
      projectId: "p1",
      resourceId: "t1",
    });

    expect(auditLogMock).toHaveBeenCalledWith({
      apiKeyId: "k1",
      orgId: "o1",
      projectId: "p1",
      resourceId: "t1",
      resourceType: "trace",
      action: "read",
    });
  });

  it("dedups on a per-user key with NX + 15 min TTL for UI views", async () => {
    await recordTraceViewAudit({
      session: { user: { id: "u1" }, orgId: "o1" },
      resourceId: "t1",
    });

    expect(redisSetMock).toHaveBeenCalledWith(
      "auditview:user:u1:t1",
      "1",
      "EX",
      900,
      "NX",
    );
  });

  it("dedups on a per-api-key key for SDK reads", async () => {
    await recordTraceViewAudit({
      apiKeyId: "k1",
      orgId: "o1",
      projectId: "p1",
      resourceId: "t1",
    });

    expect(redisSetMock).toHaveBeenCalledWith(
      "auditview:api:k1:t1",
      "1",
      "EX",
      900,
      "NX",
    );
  });

  it("skips the write when the dedup key already exists in the window", async () => {
    redisSetMock.mockResolvedValue(null); // NX failed → already audited

    await recordTraceViewAudit({
      apiKeyId: "k1",
      orgId: "o1",
      projectId: "p1",
      resourceId: "t1",
    });

    expect(auditLogMock).not.toHaveBeenCalled();
  });

  it("fails open: still writes when the dedup check throws", async () => {
    redisSetMock.mockRejectedValue(new Error("redis unavailable"));

    await recordTraceViewAudit({
      apiKeyId: "k1",
      orgId: "o1",
      projectId: "p1",
      resourceId: "t1",
    });

    expect(auditLogMock).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn).toHaveBeenCalled();
  });

  it("never propagates a write failure to the caller", async () => {
    auditLogMock.mockRejectedValue(new Error("postgres unavailable"));

    await expect(
      recordTraceViewAudit({
        apiKeyId: "k1",
        orgId: "o1",
        projectId: "p1",
        resourceId: "t1",
      }),
    ).resolves.toBeUndefined();

    expect(loggerMock.error).toHaveBeenCalled();
  });
});
