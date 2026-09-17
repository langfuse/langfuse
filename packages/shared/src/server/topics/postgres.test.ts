import { beforeEach, describe, expect, it, vi } from "vitest";
import { topicProcessingConfigSchema } from "../../topics";
import {
  createTopicFacetVersion,
  createTopicRun,
  getPublishedTopicRun,
  getTopicDefinitions,
  getTopicRun,
  saveTopicRun,
} from "./postgres";

const mocks = vi.hoisted(() => ({
  lock: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  runFind: vi.fn(),
  runUpdate: vi.fn(),
  runUpdateMany: vi.fn(),
  upsertTopic: vi.fn(),
  writeArtifact: vi.fn(),
  facetFind: vi.fn(),
  facetUpdate: vi.fn(),
  topicFind: vi.fn(),
}));
vi.mock("../../db", () => ({
  Prisma: {},
  prisma: {
    topicClusteringRun: { findFirst: mocks.runFind, update: mocks.runUpdate },
    topicFacet: { findFirst: mocks.facetFind },
    topic: { findMany: mocks.topicFind },
    $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        $queryRaw: mocks.lock,
        topicClusteringRun: {
          findFirst: mocks.runFind,
          update: mocks.runUpdate,
          updateMany: mocks.runUpdateMany,
        },
        topic: { upsert: mocks.upsertTopic },
        topicFacet: {
          findFirstOrThrow: mocks.facetFind,
          update: mocks.facetUpdate,
        },
        topicFacetVersion: {
          findFirst: mocks.findFirst,
          create: mocks.create,
        },
      }),
  },
}));
vi.mock("./journal", () => ({
  readTopicArtifact: async () => null,
  writeTopicArtifact: mocks.writeArtifact,
}));

describe("Topics facet version configuration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.lock.mockResolvedValue([{ id: "facet-a" }]);
    mocks.findFirst.mockResolvedValue({
      version: 2,
      processingConfig: topicProcessingConfigSchema.parse({
        projection: "issues",
        maxInputTokens: 3000,
      }),
    });
    mocks.create.mockImplementation(async ({ data }) => ({
      ...data,
      id: "facet-v3",
      createdAt: new Date("2026-09-16T00:00:00Z"),
    }));
  });

  it("preserves the previous summary settings when only the prompt changes", async () => {
    const version = await createTopicFacetVersion({
      projectId: "project-a",
      facetId: "facet-a",
      prompt: "Describe evidenced failures.",
    });
    expect(version.version).toBe(3);
    expect(version.processingConfig).toMatchObject({
      projection: "issues",
      maxInputTokens: 3000,
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
        maxInputTokens: 3000,
        maxOutputTokens: 128,
      }),
    });
    const version = await createTopicFacetVersion({
      projectId: "project-a",
      facetId: "facet-a",
      prompt: "Describe evidenced failures.",
      processingConfig: { maxInputTokens: 4000 },
    });
    expect(version.processingConfig).toMatchObject({
      projection: "issues",
      maxInputTokens: 4000,
      maxOutputTokens: 128,
    });
  });
});

describe("Topics run start checkpoint", () => {
  it("configures the trigger-created run without replacing execution metadata", async () => {
    vi.resetAllMocks();
    const row = {
      id: "run-a",
      projectId: "project-a",
      executionId: "execution-a",
      facetVersionId: "facet-v1",
      runSequence: 1n,
      status: "pending",
      phase: "queued",
      config: {},
      metrics: {},
      error: null,
      artifactPath: "",
      manifestPath: "",
      topics: [],
      createdAt: new Date(),
      startedAt: null,
      finishedAt: null,
      publishedAt: null,
      executionMetadata: { durable: "request" },
    };
    mocks.runFind.mockResolvedValue(row);
    mocks.runUpdate.mockImplementation(async ({ data }) => ({
      ...row,
      ...data,
    }));
    await createTopicRun({
      id: row.id,
      projectId: row.projectId,
      facetVersionId: row.facetVersionId,
      config: { executionId: row.executionId, dimensions: 256 },
      summaryIds: ["summary-a"],
    });
    expect(mocks.writeArtifact).toHaveBeenCalledWith(
      "project-a",
      "execution-a",
      "manifest-run-a",
      { summaryIds: ["summary-a"] },
    );
    expect(mocks.runUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          config: { executionId: "execution-a", dimensions: 256 },
          manifestPath: "manifest-run-a",
          artifactPath: "",
        },
      }),
    );
    await expect(
      createTopicRun({
        id: row.id,
        projectId: row.projectId,
        facetVersionId: "another-facet",
      }),
    ).rejects.toThrow("facet version");
  });

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

describe("Topics published results", () => {
  beforeEach(() => vi.resetAllMocks());

  it("keeps accepted labels and only upserts the next completed topic", async () => {
    const topic = {
      topicVersionId: "topic-a",
      topicId: "topic-a",
      projectId: "project-a",
      runId: "run-a",
      name: "Billing",
      description: "Invoice requests",
      centroid: [1, 0],
      radius: 0.1,
      representativeSummaryIds: ["summary-a"],
      metadata: { namingModel: "model" },
    };
    const row = {
      id: "run-a",
      projectId: "project-a",
      executionId: "execution-a",
      facetVersionId: "facet-v1",
      runSequence: 1n,
      status: "running",
      phase: "naming",
      config: {},
      metrics: {},
      error: null,
      artifactPath: "",
      manifestPath: "",
      topics: [topic],
      createdAt: new Date(),
      startedAt: new Date(),
      finishedAt: null,
      publishedAt: null,
    };
    mocks.runFind.mockResolvedValue(row);
    mocks.runUpdate.mockResolvedValue(row);
    const run = (await getTopicRun(row.projectId, row.id))!;
    const next = {
      ...topic,
      topicVersionId: "topic-b",
      topicId: "topic-b",
      name: "Travel",
    };
    await saveTopicRun({ ...run, topics: [topic, next] });
    expect(mocks.upsertTopic).toHaveBeenCalledTimes(1);
    expect(mocks.upsertTopic).toHaveBeenCalledWith({
      where: {
        topicVersionId: "topic-b",
        projectId: "project-a",
        runId: "run-a",
      },
      create: next,
      update: next,
    });
    mocks.upsertTopic.mockClear();
    mocks.runFind.mockResolvedValue({
      ...row,
      publishedAt: new Date(),
      status: "completed",
    });
    await saveTopicRun({ ...run, topics: [next] });
    expect(mocks.upsertTopic).not.toHaveBeenCalled();
  });

  it("resolves only the selected project's published facet map and exact topic versions", async () => {
    mocks.facetFind.mockResolvedValue({ publishedRunId: "run-a" });
    mocks.runFind.mockResolvedValue(null);
    await getPublishedTopicRun("project-a", "facet-a");
    expect(mocks.facetFind).toHaveBeenCalledWith({
      where: { projectId: "project-a", id: "facet-a" },
      select: { publishedRunId: true },
    });
    expect(mocks.runFind).toHaveBeenCalledWith({
      where: {
        projectId: "project-a",
        id: "run-a",
        status: "completed",
        publishedAt: { not: null },
        facetVersion: { facetId: "facet-a" },
      },
      include: { topics: true },
    });
    mocks.topicFind.mockResolvedValue([]);
    const ids = Array.from({ length: 1001 }, (_, index) => `topic-${index}`);
    await getTopicDefinitions("project-a", [...ids, ids[0]!]);
    expect(
      mocks.topicFind.mock.calls.flatMap(
        ([query]) => query.where.topicVersionId.in,
      ),
    ).toEqual(ids);
    expect(
      mocks.topicFind.mock.calls.every(
        ([query]) => query.where.projectId === "project-a",
      ),
    ).toBe(true);
  });

  it("publishes a completed empty map while rejecting incomplete publication", async () => {
    const stored = {
      id: "run-a",
      projectId: "project-a",
      facetVersionId: "facet-v1",
      facetVersion: { facetId: "facet-a", version: 1 },
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
      startedAt: null,
      finishedAt: null,
      publishedAt: null,
    };
    mocks.runFind.mockResolvedValue(stored);
    mocks.runUpdate.mockImplementation(async ({ data }) => ({
      ...stored,
      ...data,
    }));
    mocks.facetFind.mockResolvedValue({ id: "facet-a", publishedRunId: null });
    const pending = (await getTopicRun("project-a", "run-a"))!;
    const publishedAt = "2026-09-16T00:01:00.000Z";
    await expect(saveTopicRun({ ...pending, publishedAt })).rejects.toThrow(
      "Only a completed map can be published",
    );
    const published = await saveTopicRun({
      ...pending,
      status: "completed",
      phase: "published",
      publishedAt,
    });
    expect(published.topics).toEqual([]);
    expect(published.publishedAt).toBe(publishedAt);
    expect(mocks.facetUpdate).toHaveBeenCalledWith({
      where: { projectId_id: { projectId: "project-a", id: "facet-a" } },
      data: { publishedRunId: "run-a" },
    });
  });
});
