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
  status: "ACTIVE",
  updatedAt: new Date("2026-10-08T00:00:00Z"),
  createdAt: new Date("2026-10-01T00:00:00Z"),
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

  it("stores the sampling rate on the rule", async () => {
    const rule = await saveTopicRule({
      projectId,
      name: "Topics",
      filter: [],
      facetIds: ["intent"],
      sampling: 0.25,
    });

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sampling: 0.25,
          projectId,
        }),
      }),
    );
    expect(rule).toMatchObject({
      sampling: 0.25,
      facetIds: ["intent"],
    });
  });

  it("creates another rule without an id and updates a rule by id", async () => {
    mocks.findRules.mockResolvedValue([{ id: "rule-a", name: "Topics" }]);
    const input = {
      projectId,
      filter: [],
      facetIds: ["intent"],
      sampling: 0.5,
    };

    await saveTopicRule(input);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "All traces", status: "ACTIVE" }),
      }),
    );
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.findRules.mock.invocationCallOrder[0],
    );

    await saveTopicRule({ ...input, id: "rule-a" });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "rule-a" }),
        data: expect.objectContaining({
          name: "Topics",
          sampling: 0.5,
        }),
      }),
    );
    expect(mocks.update.mock.calls[0][0].data).not.toHaveProperty("status");
  });

  it("rejects another project's rule id and a sixth rule", async () => {
    mocks.findRules.mockResolvedValue([{ id: "rule-a", name: "Topics" }]);
    await expect(
      saveTopicRule({
        id: "rule-b",
        projectId,
        filter: [],
        facetIds: ["intent"],
      }),
    ).rejects.toThrow("Topic rule not found in this project.");

    mocks.findRules.mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => ({
        id: `rule-${index}`,
        name: `Rule ${index}`,
      })),
    );
    await expect(
      saveTopicRule({ projectId, filter: [], facetIds: ["intent"] }),
    ).rejects.toThrow("at most 5 Topics rules");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
