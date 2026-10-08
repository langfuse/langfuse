import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  facetCount: vi.fn(),
  ruleCount: vi.fn(),
  findRule: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock("./clickhouse", () => ({
  getTopicDefinitions: vi.fn(),
  writeTopicDefinitions: vi.fn(),
}));
vi.mock("../../db", () => ({
  Prisma: {},
  prisma: {
    $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        evaluator: { count: mocks.facetCount },
        evaluationRule: {
          count: mocks.ruleCount,
          findFirst: mocks.findRule,
          create: mocks.create,
          update: mocks.update,
        },
      }),
  },
}));

import { saveTopicRule } from "./postgres";

const projectId = "project-a";
const savedRow = {
  id: "rule-a",
  projectId,
  name: "Topics",
  filter: [],
  sampling: 0.25,
  idleTime: 120_000,
  updatedAt: new Date("2026-10-08T00:00:00Z"),
  assignments: [{ evaluatorId: "intent" }],
};

describe("saveTopicRule", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.facetCount.mockResolvedValue(1);
    mocks.ruleCount.mockResolvedValue(0);
    mocks.create.mockResolvedValue(savedRow);
    mocks.update.mockResolvedValue(savedRow);
  });

  it("stores the sampling rate and idle time on the single rule", async () => {
    const rule = await saveTopicRule({
      projectId,
      name: "Topics",
      filter: [],
      facetIds: ["intent"],
      sampling: 0.25,
      idleTimeMs: 120_000,
    });

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sampling: 0.25,
          idleTime: 120_000,
          projectId,
        }),
      }),
    );
    expect(rule).toMatchObject({
      sampling: 0.25,
      idleTimeMs: 120_000,
      facetIds: ["intent"],
    });
  });

  it("rejects a second Topics rule in the same project", async () => {
    mocks.ruleCount.mockResolvedValue(1);

    await expect(
      saveTopicRule({
        projectId,
        name: "Another",
        filter: [],
        facetIds: ["intent"],
      }),
    ).rejects.toThrow(/already has a Topics rule/);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("updates the existing rule with a new sampling rate and idle time", async () => {
    mocks.findRule.mockResolvedValue({ id: "rule-a" });

    await saveTopicRule({
      id: "rule-a",
      projectId,
      name: "Topics",
      filter: [],
      facetIds: ["intent"],
      sampling: 0.5,
      idleTimeMs: 60_000,
    });

    expect(mocks.ruleCount).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sampling: 0.5, idleTime: 60_000 }),
      }),
    );
  });
});
