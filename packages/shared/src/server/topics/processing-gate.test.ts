import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  invalidateTopicsProcessingActive,
  isTopicsProcessingActive,
} from "./processing-gate";

const mocks = vi.hoisted(() => ({
  allowlisted: vi.fn(),
  configFind: vi.fn(),
  ruleFind: vi.fn(),
  redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
}));
vi.mock("./config", () => ({ isTopicsProjectEnabled: mocks.allowlisted }));
vi.mock("../redis/redis", () => ({ redis: mocks.redis }));
vi.mock("../../db", () => ({
  JobConfigState: { ACTIVE: "ACTIVE" },
  prisma: {
    topicConfig: { findFirst: mocks.configFind },
    evaluationRule: { findFirst: mocks.ruleFind },
  },
}));

const key = "langfuse:topics:processing-active:project-a";

describe("isTopicsProcessingActive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.allowlisted.mockReturnValue(true);
    mocks.redis.get.mockResolvedValue(null);
    mocks.configFind.mockResolvedValue({ id: "config-a" });
    mocks.ruleFind.mockResolvedValue({ id: "rule-a" });
  });

  it("skips Redis and Postgres for projects outside the allowlist", async () => {
    mocks.allowlisted.mockReturnValue(false);

    await expect(isTopicsProcessingActive("project-a")).resolves.toBe(false);
    expect(mocks.redis.get).not.toHaveBeenCalled();
    expect(mocks.configFind).not.toHaveBeenCalled();
  });

  it.each([
    ["1", true],
    ["0", false],
  ])("returns the cached answer %s without Postgres", async (cached, want) => {
    mocks.redis.get.mockResolvedValue(cached);

    await expect(isTopicsProcessingActive("project-a")).resolves.toBe(want);
    expect(mocks.configFind).not.toHaveBeenCalled();
    expect(mocks.ruleFind).not.toHaveBeenCalled();
  });

  it("requires an enabled, fully configured Topics config and an active facet rule", async () => {
    await expect(isTopicsProcessingActive("project-a")).resolves.toBe(true);

    expect(mocks.configFind.mock.calls[0][0].where).toMatchObject({
      projectId: "project-a",
      enabled: true,
      summaryModel: { not: null },
      embeddingLlmApiKeyId: { not: null },
      clusteringModel: { not: null },
    });
    expect(mocks.ruleFind.mock.calls[0][0].where.AND[1]).toEqual({
      status: "ACTIVE",
      assignments: {
        some: { evaluator: { type: "FACET", blockedAt: null } },
      },
    });
    expect(mocks.redis.set).toHaveBeenCalledWith(key, "1", "EX", 300);
  });

  it.each([
    ["Topics is disabled or a model is missing", "config"],
    ["no active facet rule exists", "rule"],
  ])("caches a negative answer when %s", async (_case, missing) => {
    (missing === "config"
      ? mocks.configFind
      : mocks.ruleFind
    ).mockResolvedValue(null);

    await expect(isTopicsProcessingActive("project-a")).resolves.toBe(false);
    expect(mocks.redis.set).toHaveBeenCalledWith(key, "0", "EX", 300);
  });

  it("propagates a Postgres error and caches the allowlist answer briefly", async () => {
    mocks.ruleFind.mockRejectedValue(new Error("postgres down"));

    await expect(isTopicsProcessingActive("project-a")).rejects.toThrow(
      "postgres down",
    );
    expect(mocks.redis.set).toHaveBeenCalledWith(key, "1", "EX", 30);
  });

  it("stops waiting on a hung Postgres lookup after the deadline", async () => {
    vi.useFakeTimers();
    try {
      mocks.configFind.mockReturnValue(new Promise(() => {}));
      const lookup = isTopicsProcessingActive("project-a");
      const assertion = expect(lookup).rejects.toThrow("timed out");

      await vi.advanceTimersByTimeAsync(2_000);
      await assertion;
      expect(mocks.redis.set).toHaveBeenCalledWith(key, "1", "EX", 30);
    } finally {
      vi.useRealTimers();
    }
  });

  it("invalidation deletes the cached answer", async () => {
    await invalidateTopicsProcessingActive("project-a");

    expect(mocks.redis.del).toHaveBeenCalledWith(key);
  });
});
