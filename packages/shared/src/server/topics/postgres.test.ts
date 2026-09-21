import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTopicFacetVersion,
  ensureDefaultTopicFacets,
  createTopicRun,
  getPublishedTopicRun,
  getPublishedTopicRunForExecution,
  getTopicDefinitions,
  getTopicRun,
  getTopicProcessingMapIds,
  saveTopicRun,
} from "./postgres";

const mocks = vi.hoisted(() => ({
  lock: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  runFind: vi.fn(),
  runFindMany: vi.fn(),
  runCreate: vi.fn(),
  runUpdate: vi.fn(),
  runUpdateMany: vi.fn(),
  upsertTopic: vi.fn(),
  readRunSummaryIds: vi.fn(async () => [] as string[]),
  facetFind: vi.fn(),
  facetFindUnique: vi.fn(),
  facetFindMany: vi.fn(),
  facetCreate: vi.fn(),
  facetUpdate: vi.fn(),
  topicFind: vi.fn(),
  versionFindMany: vi.fn(),
}));
vi.mock("../../db", () => ({
  Prisma: {},
  prisma: {
    topicClusteringRun: {
      findFirst: mocks.runFind,
      findMany: mocks.runFindMany,
      create: mocks.runCreate,
      update: mocks.runUpdate,
    },
    topicFacet: {
      findFirst: mocks.facetFind,
      findUnique: mocks.facetFindUnique,
      findMany: mocks.facetFindMany,
    },
    topic: { findMany: mocks.topicFind },
    topicFacetVersion: { findMany: mocks.versionFindMany },
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
          create: mocks.facetCreate,
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
vi.mock("./clickhouse", () => ({
  readTopicRunSummaryIds: mocks.readRunSummaryIds,
}));

describe("Topics default facets", () => {
  it("creates missing defaults without replacing existing facet prompts on repeated initialization", async () => {
    vi.resetAllMocks();
    const names = new Set(["Intent", "Issues"]);
    mocks.facetFindUnique.mockImplementation(async ({ where }) =>
      names.has(where.projectId_name.name)
        ? { id: where.projectId_name.name }
        : null,
    );
    mocks.facetFindMany.mockResolvedValue([]);
    mocks.facetCreate.mockImplementation(async ({ data }) => {
      names.add(data.name);
      return { ...data, id: "new-facet", publishedRunId: null };
    });
    mocks.create.mockImplementation(async ({ data }) => ({
      ...data,
      id: "new-version",
      createdAt: new Date(),
    }));

    await ensureDefaultTopicFacets("project-a");
    await ensureDefaultTopicFacets("project-a");

    expect(mocks.facetCreate).toHaveBeenCalledTimes(1);
    expect(mocks.facetCreate).toHaveBeenCalledWith({
      data: {
        projectId: "project-a",
        name: "Outcome",
        description: expect.any(String),
      },
    });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-a",
        facetId: "new-facet",
        version: 1,
        prompt: expect.any(String),
      },
    });
    expect(mocks.facetUpdate).not.toHaveBeenCalled();
  });
});

describe("Topics facet prompt versions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.lock.mockResolvedValue([{ id: "facet-a" }]);
    mocks.findFirst.mockResolvedValue({
      id: "facet-v2",
      projectId: "project-a",
      facetId: "facet-a",
      version: 2,
      prompt: "Describe the task.",
      createdAt: new Date("2026-09-16T00:00:00Z"),
    });
    mocks.create.mockImplementation(async ({ data }) => ({
      ...data,
      id: "facet-v3",
      createdAt: new Date("2026-09-17T00:00:00Z"),
    }));
  });

  it("keeps the same version when saving an unchanged prompt", async () => {
    const version = await createTopicFacetVersion({
      projectId: "project-a",
      facetId: "facet-a",
      prompt: " Describe the task. ",
    });
    expect(version.id).toBe("facet-v2");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates an immutable version only for a changed prompt", async () => {
    const version = await createTopicFacetVersion({
      projectId: "project-a",
      facetId: "facet-a",
      prompt: "Describe evidenced failures.",
    });
    expect(version).toMatchObject({
      version: 3,
      prompt: "Describe evidenced failures.",
    });
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-a",
        facetId: "facet-a",
        version: 3,
        prompt: "Describe evidenced failures.",
      },
    });
  });
});

describe("Topics clustering attempts", () => {
  it("creates fresh attempts and derives only published cohorts from assignments", async () => {
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
      topics: [],
      createdAt: new Date(),
      startedAt: null,
      finishedAt: null,
      publishedAt: null,
      executionMetadata: {},
    };
    mocks.runFind.mockResolvedValue(null);
    mocks.runCreate.mockImplementation(async ({ data }) => ({
      ...row,
      ...data,
    }));
    mocks.readRunSummaryIds.mockResolvedValue(["summary-a"]);
    const run = await createTopicRun({
      id: row.id,
      projectId: row.projectId,
      executionId: row.executionId,
      facetVersionId: row.facetVersionId,
      config: { executionId: row.executionId, dimensions: 256 },
    });
    expect(run.summaryIds).toEqual([]);
    expect(mocks.readRunSummaryIds).not.toHaveBeenCalled();
    expect(mocks.runCreate).toHaveBeenCalledWith({
      data: {
        id: row.id,
        projectId: row.projectId,
        executionId: row.executionId,
        facetVersionId: row.facetVersionId,
        config: { executionId: row.executionId, dimensions: 256 },
      },
      include: { topics: true },
    });
    mocks.runFind.mockResolvedValue({
      ...row,
      status: "completed",
      publishedAt: new Date(),
    });
    const published = await getPublishedTopicRunForExecution(
      row.projectId,
      row.executionId,
      row.facetVersionId,
    );
    expect(published?.summaryIds).toEqual(["summary-a"]);
    expect(mocks.readRunSummaryIds).toHaveBeenCalledWith(
      row.projectId,
      row.id,
      row.executionId,
    );
    expect(mocks.runFind).toHaveBeenLastCalledWith({
      where: {
        projectId: row.projectId,
        executionId: row.executionId,
        facetVersionId: row.facetVersionId,
        status: "completed",
        publishedAt: { not: null },
      },
      orderBy: { runSequence: "desc" },
      include: { topics: true },
    });
    await expect(
      createTopicRun({
        id: row.id,
        projectId: row.projectId,
        executionId: row.executionId,
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

  it("pins only maps compatible with the selected prompt version and embedding space", async () => {
    mocks.versionFindMany.mockResolvedValue([
      { id: "intent-v1", facet: { publishedRunId: "intent-map" } },
      { id: "intent-v2", facet: { publishedRunId: "intent-map" } },
      { id: "outcome-v1", facet: { publishedRunId: "outcome-map" } },
    ]);
    mocks.runFindMany.mockResolvedValue([
      {
        id: "intent-map",
        facetVersionId: "intent-v1",
        config: { embeddingModel: "text-embedding-3-small", dimensions: 256 },
      },
      {
        id: "outcome-map",
        facetVersionId: "outcome-v1",
        config: { embeddingModel: "text-embedding-3-small", dimensions: 512 },
      },
    ]);
    expect(
      await getTopicProcessingMapIds(
        "project-a",
        ["intent-v1", "intent-v2", "outcome-v1"],
        { embeddingModel: "text-embedding-3-small", embeddingDimensions: 256 },
      ),
    ).toEqual({
      "intent-v1": "intent-map",
      "intent-v2": null,
      "outcome-v1": null,
    });
    expect(mocks.runFindMany).toHaveBeenCalledWith({
      where: {
        projectId: "project-a",
        id: { in: ["intent-map", "outcome-map"] },
        status: "completed",
        publishedAt: { not: null },
      },
      select: { id: true, facetVersionId: true, config: true },
    });
    expect(mocks.readRunSummaryIds).not.toHaveBeenCalled();
  });

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
