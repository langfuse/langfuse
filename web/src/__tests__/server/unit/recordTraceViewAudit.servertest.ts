import { beforeEach, describe, expect, it, vi } from "vitest";
import { type Role } from "@langfuse/shared/src/db";

const { auditLogMock, redisSetMock, redisDelMock, loggerMock } = vi.hoisted(
  () => ({
    auditLogMock: vi.fn(),
    redisSetMock: vi.fn(),
    redisDelMock: vi.fn(),
    loggerMock: { warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  }),
);

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
    del: (...args: unknown[]) => redisDelMock(...args),
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
    // Default: dedup key did not exist yet → first view → write succeeds.
    // (clearAllMocks resets call history but not implementations, so reset the
    // resolved/rejected value each test explicitly.)
    redisSetMock.mockResolvedValue("OK");
    redisDelMock.mockResolvedValue(1);
    auditLogMock.mockResolvedValue(undefined);
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

  it("dedups on a per-user, per-project key with NX + 15 min TTL for UI views", async () => {
    await recordTraceViewAudit({
      session: { user: { id: "u1" }, orgId: "o1", projectId: "p1" },
      resourceId: "t1",
    });

    // projectId is part of the key: trace ids are unique per project, so the
    // same id viewed in a second project must not collapse into this window.
    expect(redisSetMock).toHaveBeenCalledWith(
      "auditview:user:u1:p1:t1",
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

  it("clears the dedup key when the write fails so the next view can retry", async () => {
    auditLogMock.mockRejectedValue(new Error("postgres unavailable"));

    await recordTraceViewAudit({
      session: { user: { id: "u1" }, orgId: "o1", projectId: "p1" },
      resourceId: "t1",
    });

    // Durability outranks dedup: a dropped write must not leave a key that
    // blocks re-auditing for the full window.
    expect(redisDelMock).toHaveBeenCalledWith("auditview:user:u1:p1:t1");
    expect(loggerMock.error).toHaveBeenCalled();
  });

  it("does not clear the dedup key when the write succeeds", async () => {
    await recordTraceViewAudit({
      session: { user: { id: "u1" }, orgId: "o1", projectId: "p1" },
      resourceId: "t1",
    });

    expect(auditLogMock).toHaveBeenCalledTimes(1);
    expect(redisDelMock).not.toHaveBeenCalled();
  });
});
