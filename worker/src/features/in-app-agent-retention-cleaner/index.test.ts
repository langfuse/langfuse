import { beforeEach, describe, expect, it, vi } from "vitest";
import { InAppAgentRetentionCleaner } from "./index";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  findRuns: vi.fn(),
  updateRuns: vi.fn(),
  deleteKey: vi.fn(),
  licensed: vi.fn(),
  extend: vi.fn(),
  gauge: vi.fn(),
}));

vi.mock("@langfuse/shared/src/db", async () => {
  const { Prisma } = await import("@prisma/client");
  return {
    Prisma,
    prisma: {
      $queryRaw: mocks.query,
      $executeRaw: mocks.execute,
      inAppAgentRun: {
        findMany: mocks.findRuns,
        updateMany: mocks.updateRuns,
      },
    },
  };
});
vi.mock("@langfuse/shared/src/server", () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn() },
  redis: null,
  recordIncrement: vi.fn(),
  recordGauge: mocks.gauge,
  traceException: vi.fn(),
  getCurrentSpan: vi.fn(),
}));
vi.mock("@langfuse/shared/src/server/ee/licenseCheck", () => ({
  isEnterpriseLicenseAvailable: mocks.licensed,
}));
vi.mock("@langfuse/shared/src/server/auth/apiKeys", () => ({
  deleteInAppAgentMcpApiKeyFromDb: mocks.deleteKey,
}));
vi.mock("../../utils/RedisLock", () => ({
  RedisLock: class {
    key = "test-lock";
    extend = mocks.extend;
    async withLock<T>(operation: () => Promise<T>) {
      return operation();
    }
  },
}));

describe("InAppAgentRetentionCleaner", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.licensed.mockReturnValue(true);
    mocks.extend.mockResolvedValue(true);
    mocks.query.mockResolvedValue([
      { id: "conversation", projectId: "project" },
    ]);
    mocks.findRuns.mockResolvedValue([
      {
        id: "run",
        projectId: "project",
        conversationId: "conversation",
        mcpApiKeyId: "key",
      },
    ]);
    mocks.execute.mockResolvedValue(1);
    mocks.updateRuns.mockResolvedValue({ count: 1 });
    mocks.deleteKey.mockResolvedValue(undefined);
  });

  it("does not inspect or delete data without a license", async () => {
    mocks.licensed.mockReturnValue(false);
    expect(await new InAppAgentRetentionCleaner().processBatch()).toBe(600_000);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.deleteKey).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("revokes keys before clearing pointers and deleting conversations", async () => {
    expect(await new InAppAgentRetentionCleaner().processBatch()).toBe(0);
    expect(mocks.deleteKey).toHaveBeenCalledWith({
      prisma: expect.objectContaining({ $queryRaw: mocks.query }),
      id: "key",
      projectId: "project",
      redis: null,
    });
    expect(mocks.updateRuns).toHaveBeenCalledWith({
      where: { id: "run", projectId: "project", mcpApiKeyId: "key" },
      data: { mcpApiKeyId: null },
    });
    expect(mocks.deleteKey.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.updateRuns.mock.invocationCallOrder[0]!,
    );
    expect(mocks.updateRuns.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.execute.mock.invocationCallOrder[0]!,
    );
  });

  it("keeps key pointers and conversations retryable when revocation fails", async () => {
    mocks.deleteKey.mockRejectedValue(new Error("Redis unavailable"));
    mocks.execute.mockResolvedValue(0);
    mocks.query
      .mockResolvedValueOnce([{ id: "conversation", projectId: "project" }])
      .mockResolvedValueOnce([{ overdueSeconds: 864_000 }]);
    const cleaner = new InAppAgentRetentionCleaner();
    expect(await cleaner.processBatch()).toBe(600_000);
    expect(mocks.gauge).toHaveBeenCalledWith(
      "langfuse.in_app_agent_retention_cleaner.max_conversation_retention_lag_seconds",
      864_000,
      { unit: "seconds" },
    );
    expect(mocks.updateRuns).not.toHaveBeenCalled();
    expect(mocks.execute).toHaveBeenCalledOnce();

    mocks.query.mockResolvedValueOnce([
      { id: "conversation", projectId: "project" },
    ]);
    mocks.deleteKey.mockResolvedValue(undefined);
    mocks.execute.mockResolvedValue(1);
    expect(await cleaner.processBatch()).toBe(0);
    expect(mocks.updateRuns).toHaveBeenCalledOnce();
  });

  it("continues revocation and deletion for another project after a key fails", async () => {
    mocks.query.mockResolvedValue([
      { id: "failed-conversation", projectId: "failed-project" },
      { id: "healthy-conversation", projectId: "healthy-project" },
    ]);
    mocks.findRuns.mockResolvedValue([
      {
        id: "failed-run",
        conversationId: "failed-conversation",
        projectId: "failed-project",
        mcpApiKeyId: "failed-key",
      },
      {
        id: "healthy-run",
        conversationId: "healthy-conversation",
        projectId: "healthy-project",
        mcpApiKeyId: "healthy-key",
      },
    ]);
    mocks.deleteKey.mockRejectedValueOnce(new Error("Revocation failed"));

    expect(await new InAppAgentRetentionCleaner().processBatch()).toBe(0);

    expect(mocks.deleteKey).toHaveBeenCalledTimes(2);
    expect(mocks.updateRuns).toHaveBeenCalledExactlyOnceWith({
      where: {
        id: "healthy-run",
        projectId: "healthy-project",
        mcpApiKeyId: "healthy-key",
      },
      data: { mcpApiKeyId: null },
    });
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it.each([0, 864_000])(
    "reports maximum retention overdue seconds %s at the end of a sweep",
    async (overdueSeconds) => {
      mocks.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ overdueSeconds }]);

      expect(await new InAppAgentRetentionCleaner().processBatch()).toBe(
        600_000,
      );
      expect(mocks.gauge).toHaveBeenCalledExactlyOnceWith(
        "langfuse.in_app_agent_retention_cleaner.max_conversation_retention_lag_seconds",
        overdueSeconds,
        { unit: "seconds" },
      );
      expect(mocks.execute).not.toHaveBeenCalled();
    },
  );

  it("does not collect retention overdue seconds for each active batch", async () => {
    await new InAppAgentRetentionCleaner().processBatch();
    expect(mocks.query).toHaveBeenCalledOnce();
    expect(mocks.gauge).not.toHaveBeenCalled();
  });

  it("continues cleanup when the key was already removed", async () => {
    mocks.deleteKey.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Missing key", {
        code: "P2025",
        clientVersion: "test",
      }),
    );
    await new InAppAgentRetentionCleaner().processBatch();
    expect(mocks.updateRuns).toHaveBeenCalledOnce();
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("stops destructive work when the lease is lost", async () => {
    mocks.extend.mockResolvedValue(false);
    await new InAppAgentRetentionCleaner().processBatch();
    expect(mocks.deleteKey).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("rechecks the lease before deletion even after key cleanup made progress", async () => {
    mocks.extend.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await new InAppAgentRetentionCleaner().processBatch();
    expect(mocks.updateRuns).toHaveBeenCalledOnce();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
