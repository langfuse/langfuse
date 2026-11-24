import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findRules: vi.fn(),
  cache: new Map<string, string>(),
}));

vi.mock("../../db", () => ({
  JobConfigState: { ACTIVE: "ACTIVE" },
  prisma: { evaluationRule: { findMany: mocks.findRules } },
}));
vi.mock("../redis/redis", () => ({
  redis: {
    get: async (key: string) => mocks.cache.get(key) ?? null,
    set: async (key: string, value: string) => {
      mocks.cache.set(key, value);
      return "OK";
    },
    del: async (key: string) => mocks.cache.delete(key),
  },
}));
vi.mock("./traceEvalsConfig", () => ({
  isTraceEvalsProjectEnabled: (projectId: string) => projectId !== "unlisted",
}));

import {
  getTraceEvalsProcessingSampling,
  invalidateTraceEvalsProcessingActive,
} from "./traceEvalsProcessingGate";

describe("getTraceEvalsProcessingSampling", () => {
  beforeEach(() => {
    mocks.cache.clear();
    mocks.findRules.mockReset();
  });

  it("returns the largest active rule sampling rate, queried for unblocked trace evaluators", async () => {
    mocks.findRules.mockResolvedValue([
      { sampling: 0.2 },
      { sampling: "0.75" },
      { sampling: 0.5 },
    ]);

    expect(await getTraceEvalsProcessingSampling("project-a")).toBe(0.75);

    const { where } = mocks.findRules.mock.calls[0][0];
    expect(where).toMatchObject({
      projectId: "project-a",
      status: "ACTIVE",
      assignments: { some: { evaluator: { blockedAt: null } } },
    });
  });

  it("caches zero until a rule change invalidates it, and skips unlisted projects", async () => {
    mocks.findRules.mockResolvedValue([]);
    expect(await getTraceEvalsProcessingSampling("project-a")).toBe(0);
    expect(await getTraceEvalsProcessingSampling("project-a")).toBe(0);
    expect(mocks.findRules).toHaveBeenCalledTimes(1);

    mocks.findRules.mockResolvedValue([{ sampling: 1 }]);
    await invalidateTraceEvalsProcessingActive("project-a");
    expect(await getTraceEvalsProcessingSampling("project-a")).toBe(1);

    expect(await getTraceEvalsProcessingSampling("unlisted")).toBe(0);
    expect(mocks.findRules).toHaveBeenCalledTimes(2);
  });

  it("propagates a failed lookup and falls back to the allowlist answer from cache", async () => {
    mocks.findRules.mockRejectedValue(new Error("postgres down"));
    await expect(getTraceEvalsProcessingSampling("project-a")).rejects.toThrow(
      "postgres down",
    );

    expect(await getTraceEvalsProcessingSampling("project-a")).toBe(1);
    expect(mocks.findRules).toHaveBeenCalledTimes(1);
  });
});
