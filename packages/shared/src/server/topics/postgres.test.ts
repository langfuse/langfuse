import { beforeEach, describe, expect, it, vi } from "vitest";
import { topicProcessingConfigSchema } from "../../topics";
import { createTopicFacetVersion, getTopicRun, saveTopicRun } from "./postgres";

const mocks = vi.hoisted(() => ({
  lock: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  runFind: vi.fn(),
  runUpdate: vi.fn(),
  runUpdateMany: vi.fn(),
  deleteTopics: vi.fn(),
}));
vi.mock("../../db", () => ({
  Prisma: {},
  prisma: {
    topicClusteringRun: { findFirst: mocks.runFind },
    $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        $queryRaw: mocks.lock,
        topicClusteringRun: {
          findFirst: mocks.runFind,
          update: mocks.runUpdate,
          updateMany: mocks.runUpdateMany,
        },
        topic: { deleteMany: mocks.deleteTopics },
        topicFacetVersion: {
          findFirst: mocks.findFirst,
          create: mocks.create,
        },
      }),
  },
}));
vi.mock("./journal", () => ({ readTopicArtifact: async () => null }));

describe("Topics facet version configuration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.lock.mockResolvedValue([{ id: "facet-a" }]);
    mocks.findFirst.mockResolvedValue({
      version: 2,
      processingConfig: topicProcessingConfigSchema.parse({
        projection: "issues",
        embeddingDimensions: 256,
      }),
    });
    mocks.create.mockImplementation(async ({ data }) => ({
      ...data,
      id: "facet-v3",
      createdAt: new Date("2026-09-16T00:00:00Z"),
    }));
  });

  it("preserves the previous projection and embedding contract when only the prompt changes", async () => {
    const version = await createTopicFacetVersion({
      projectId: "project-a",
      facetId: "facet-a",
      prompt: "Describe evidenced failures.",
    });
    expect(version.version).toBe(3);
    expect(version.processingConfig).toMatchObject({
      projection: "issues",
      embeddingDimensions: 256,
    });
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { projectId: "project-a", facetId: "facet-a" },
      orderBy: { version: "desc" },
    });
  });

  it("changes only supplied processing settings in a new facet version", async () => {
    mocks.findFirst.mockResolvedValue({
      version: 2,
      processingConfig: topicProcessingConfigSchema.parse({
        projection: "issues",
        embeddingDimensions: 256,
        maxInputTokens: 3000,
        maxOutputTokens: 128,
      }),
    });
    const version = await createTopicFacetVersion({
      projectId: "project-a",
      facetId: "facet-a",
      prompt: "Describe evidenced failures.",
      processingConfig: { embeddingDimensions: 512 },
    });
    expect(version.processingConfig).toMatchObject({
      projection: "issues",
      embeddingDimensions: 512,
      maxInputTokens: 3000,
      maxOutputTokens: 128,
    });
  });
});

describe("Topics run start checkpoint", () => {
  it("round-trips the first start time without resetting it on resume", async () => {
    vi.resetAllMocks();
    let stored = {
      id: "run-a",
      projectId: "project-a",
      facetVersionId: "facet-v1",
      runSequence: 1n,
      status: "pending",
      phase: "snapshot",
      config: {},
      metrics: {},
      error: null,
      artifactPath: "",
      manifestPath: "",
      topics: [],
      createdAt: new Date("2026-09-16T00:00:00Z"),
      startedAt: null as Date | null,
      finishedAt: null,
      publishedAt: null,
    };
    mocks.runFind.mockImplementation(async () => stored);
    mocks.runUpdateMany.mockImplementation(async ({ where, data }) => {
      if (
        stored.projectId === where.projectId &&
        stored.id === where.id &&
        stored.startedAt === where.startedAt
      ) {
        stored = { ...stored, ...data };
        return { count: 1 };
      }
      return { count: 0 };
    });
    mocks.runUpdate.mockImplementation(async ({ data }) => {
      stored = { ...stored, ...data };
      return stored;
    });
    const pending = (await getTopicRun("project-a", "run-a"))!;
    expect(pending.startedAt).toBeNull();
    const firstStart = "2026-09-16T00:01:00.000Z";
    const running = await saveTopicRun({
      ...pending,
      status: "running",
      startedAt: firstStart,
    });
    expect(running.startedAt).toBe(firstStart);
    const resumed = await saveTopicRun({
      ...running,
      startedAt: "2026-09-16T00:02:00.000Z",
    });
    expect(resumed.startedAt).toBe(firstStart);
    const cleared = await saveTopicRun({
      ...resumed,
      startedAt: null,
    });
    expect(cleared.startedAt).toBe(firstStart);
    expect(mocks.runUpdateMany).toHaveBeenCalledWith({
      where: { projectId: "project-a", id: "run-a", startedAt: null },
      data: { startedAt: new Date(firstStart) },
    });
  });
});
