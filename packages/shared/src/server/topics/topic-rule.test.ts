import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lock: vi.fn(),
  facetCount: vi.fn(),
  findRules: vi.fn(),
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
        $executeRaw: mocks.lock,
        evaluator: { count: mocks.facetCount },
        evaluationRule: {
          findMany: mocks.findRules,
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
    mocks.findRules.mockResolvedValue([]);
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

  it("rejects a save without an id once the project has a rule", async () => {
    mocks.findRules.mockResolvedValue([{ id: "rule-a", name: "Topics" }]);
    const input = {
      projectId,
      filter: [],
      facetIds: ["intent"],
      sampling: 0.5,
      idleTimeMs: 60_000,
    };

    // The rule is looked up under the project lock, so a racing first save
    // sees the rule the other one created and is rejected.
    await expect(saveTopicRule(input)).rejects.toThrow(
      "This project already has a Topics rule.",
    );
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.findRules.mock.invocationCallOrder[0],
    );
    expect(mocks.update).not.toHaveBeenCalled();

    await saveTopicRule({ ...input, id: "rule-a" });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "rule-a" }),
        data: expect.objectContaining({
          name: "Topics",
          sampling: 0.5,
          idleTime: 60_000,
        }),
      }),
    );
  });

  it("rejects another project's rule id and projects with several rules", async () => {
    mocks.findRules.mockResolvedValue([{ id: "rule-a", name: "Topics" }]);
    await expect(
      saveTopicRule({
        id: "rule-b",
        projectId,
        filter: [],
        facetIds: ["intent"],
      }),
    ).rejects.toThrow("Topic rule not found in this project.");

    mocks.findRules.mockResolvedValue([
      { id: "rule-a", name: "Topics" },
      { id: "rule-b", name: "Old" },
    ]);
    await expect(
      saveTopicRule({ projectId, filter: [], facetIds: ["intent"] }),
    ).rejects.toThrow("This project has more than one Topics rule.");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
