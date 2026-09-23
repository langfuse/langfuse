import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTopicFacetVersion,
  ensureDefaultTopicFacets,
  getPublishedTopicRun,
  listTopicRuns,
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
  runUpdate: vi.fn(),
  facetFindUnique: vi.fn(),
  facetFindMany: vi.fn(),
  facetCreate: vi.fn(),
  topicFind: vi.fn(),
  topicWrite: vi.fn(),
}));
vi.mock("./clickhouse", () => ({
  getTopicDefinitions: mocks.topicFind,
  writeTopicDefinitions: mocks.topicWrite,
}));
vi.mock("../../db", () => {
  const db = {
    $queryRaw: mocks.lock,
    topicClusteringRun: {
      findFirst: mocks.runFind,
      findMany: mocks.runFindMany,
      update: mocks.runUpdate,
    },
    facet: {
      findUnique: mocks.facetFindUnique,
      findMany: mocks.facetFindMany,
      create: mocks.facetCreate,
    },
    facetVersion: { findFirst: mocks.findFirst, create: mocks.create },
  };
  return {
    Prisma: {},
    prisma: {
      ...db,
      $transaction: (callback: (tx: typeof db) => Promise<unknown>) =>
        callback(db),
    },
  };
});

describe("Topics default facets", () => {
  it("creates missing defaults without replacing existing facet prompts on repeated initialization", async () => {
    const names = new Set(["Intent", "Issues"]);
    mocks.facetFindUnique.mockImplementation(async ({ where }) =>
      names.has(where.projectId_name.name)
        ? { id: where.projectId_name.name }
        : null,
    );
    mocks.facetFindMany.mockResolvedValue([]);
    mocks.facetCreate.mockImplementation(async ({ data }) => {
      names.add(data.name);
      return { ...data, id: "new-facet" };
    });
    mocks.create.mockImplementation(async ({ data }) => ({
      ...data,
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
  });
});

describe("Topics facet prompt versions", () => {
  beforeEach(() => {
    mocks.lock.mockResolvedValue([{ id: "facet-a" }]);
    mocks.findFirst.mockResolvedValue({
      projectId: "project-a",
      facetId: "facet-a",
      version: 2,
      prompt: "Describe the task.",
      createdAt: new Date("2026-09-16T00:00:00Z"),
    });
    mocks.create.mockImplementation(async ({ data }) => ({
      ...data,
      createdAt: new Date("2026-09-17T00:00:00Z"),
    }));
  });

  it("keeps the same version when saving an unchanged prompt", async () => {
    const version = await createTopicFacetVersion({
      projectId: "project-a",
      facetId: "facet-a",
      prompt: " Describe the task. ",
    });
    expect(version).toMatchObject({
      projectId: "project-a",
      facetId: "facet-a",
      version: 2,
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates an immutable version only for a changed prompt", async () => {
    const version = await createTopicFacetVersion({
      projectId: "project-a",
      facetId: "facet-a",
      prompt: "Describe evidenced failures.",
    });
    expect(version.version).toBe(3);
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

const runRow = (overrides: Record<string, unknown> = {}) => ({
  id: "run-a",
  projectId: "project-a",
  facetId: "facet-a",
  facetVersion: 1,
  status: "pending",
  config: {},
  error: null,
  topicVersionIds: [] as string[],
  createdAt: new Date("2026-09-16T00:00:00Z"),
  startedAt: null as Date | null,
  finishedAt: null as Date | null,
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.topicFind.mockResolvedValue([]);
});

describe("Topics clustering attempts", () => {
  it("round-trips the first start time without resetting it on resume", async () => {
    let stored = runRow();
    mocks.runFind.mockImplementation(async () => stored);
    mocks.runUpdate.mockImplementation(async ({ data }) => {
      stored = { ...stored, ...data };
      return stored;
    });
    const pending = (await getTopicRun("project-a", "run-a"))!;
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
    const cleared = await saveTopicRun({ ...resumed, startedAt: null });
    expect(cleared.startedAt).toBe(firstStart);
  });
});

describe("Topics serving maps", () => {
  it("pins only the serving map when prompt version and embedding space match", async () => {
    mocks.runFindMany.mockResolvedValue([
      {
        id: "intent-map",
        facetId: "intent",
        facetVersion: 2,
        config: { embeddingModel: "text-embedding-3-small", dimensions: 256 },
      },
      {
        id: "outcome-map",
        facetId: "outcome",
        facetVersion: 1,
        config: { embeddingModel: "text-embedding-3-small", dimensions: 512 },
      },
    ]);
    expect(
      await getTopicProcessingMapIds(
        "project-a",
        [
          { facetId: "intent", version: 1 },
          { facetId: "intent", version: 2 },
          { facetId: "outcome", version: 1 },
        ],
        { embeddingModel: "text-embedding-3-small", embeddingDimensions: 256 },
      ),
    ).toEqual([
      { facetId: "intent", facetVersion: 1, runId: null },
      { facetId: "intent", facetVersion: 2, runId: "intent-map" },
      { facetId: "outcome", facetVersion: 1, runId: null },
    ]);
    expect(mocks.runFindMany).toHaveBeenCalledWith({
      where: {
        projectId: "project-a",
        facetId: { in: ["intent", "outcome"] },
        status: "completed",
      },
      orderBy: [
        { facetVersion: "desc" },
        { createdAt: "desc" },
        { id: "desc" },
      ],
      distinct: ["facetId"],
      select: { id: true, facetId: true, facetVersion: true, config: true },
    });
  });

  it("loads a project's map definitions without reading its cohort", async () => {
    const row = runRow({ status: "completed", topicVersionIds: ["topic-a"] });
    mocks.runFind.mockImplementation(async ({ where }) =>
      where.projectId === row.projectId && where.id === row.id ? row : null,
    );
    const topic = {
      topicVersionId: "topic-a",
      projectId: row.projectId,
      centroid: [1, 0],
      metadata: {},
    };
    mocks.topicFind.mockResolvedValue([topic]);
    const map = await getTopicRun(row.projectId, row.id);
    expect(map).toMatchObject({
      id: row.id,
      projectId: row.projectId,
      facetId: row.facetId,
      facetVersion: 1,
      topics: [topic],
    });
    expect(await getTopicRun("other-project", row.id)).toBeNull();
  });

  it("selects completed maps by facet version then creation time and ID, excluding skipped runs", async () => {
    mocks.runFind.mockResolvedValue(null);
    expect(await getPublishedTopicRun("project-a", "facet-a")).toBeNull();
    expect(mocks.runFind).toHaveBeenCalledWith({
      where: {
        projectId: "project-a",
        facetId: "facet-a",
        status: "completed",
      },
      orderBy: [
        { facetVersion: "desc" },
        { createdAt: "desc" },
        { id: "desc" },
      ],
    });
  });

  it("allows a completed empty map", async () => {
    const row = runRow();
    mocks.runFind.mockResolvedValue(row);
    mocks.runUpdate.mockImplementation(async ({ data }) => ({
      ...row,
      ...data,
    }));
    const run = (await getTopicRun("project-a", "run-a"))!;
    const completed = await saveTopicRun({
      ...run,
      status: "completed",
      finishedAt: "2026-09-16T00:01:00.000Z",
    });
    expect(completed).toMatchObject({ status: "completed", topics: [] });
  });

  it.each(["completed", "skipped"])(
    "preserves a %s run when stale work saves another state",
    async (status) => {
      const row = runRow({
        status,
        finishedAt: new Date("2026-09-16T00:01:00.000Z"),
      });
      mocks.runFind.mockResolvedValue(row);
      const terminal = (await getTopicRun("project-a", "run-a"))!;
      expect(
        await saveTopicRun({
          ...terminal,
          status: "failed",
          error: "Stale attempt",
          finishedAt: null,
        }),
      ).toEqual(terminal);
      expect(mocks.runUpdate).not.toHaveBeenCalled();
      expect(mocks.topicWrite).not.toHaveBeenCalled();
    },
  );

  it("preserves a run completed by another worker while acquiring its write lock", async () => {
    const row = runRow();
    mocks.runFind.mockResolvedValueOnce(row);
    const pending = (await getTopicRun("project-a", "run-a"))!;
    mocks.runFind
      .mockResolvedValueOnce(row)
      .mockResolvedValue({ ...row, status: "completed" });
    const saved = await saveTopicRun({
      ...pending,
      status: "failed",
      error: "Stale attempt",
    });
    expect(saved.status).toBe("completed");
    expect(saved.error).toBeNull();
    expect(mocks.runUpdate).not.toHaveBeenCalled();
  });
});

describe("Topics immutable definitions and run membership", () => {
  const topic = {
    topicVersionId: "topic-a",
    topicId: "stable-a",
    projectId: "project-a",
    createdByRunId: "run-a",
    createdAt: "2026-09-16T00:00:00.000Z",
    tags: [],
    name: "Billing",
    description: "Invoice requests",
    centroid: [1, 0],
    radius: 0.1,
    representativeSummaryIds: [],
    metadata: {},
  };

  it("reuses a definition across runs and preserves the historical set when removing current membership", async () => {
    const rows = new Map([
      [
        "run-a",
        runRow({ id: "run-a", topicVersionIds: [topic.topicVersionId] }),
      ],
      ["run-b", runRow({ id: "run-b" })],
    ]);
    mocks.runFind.mockImplementation(async ({ where }) => rows.get(where.id));
    mocks.runFindMany.mockImplementation(async () => [...rows.values()]);
    mocks.topicFind.mockImplementation(async (_project, ids: string[]) =>
      ids.includes(topic.topicVersionId) ? [topic] : [],
    );
    mocks.runUpdate.mockImplementation(async ({ where, data }) => {
      const updated = { ...rows.get(where.id), ...data };
      rows.set(updated.id, updated);
      return updated;
    });
    const run = (await getTopicRun("project-a", "run-b"))!;
    const saved = await saveTopicRun({ ...run, topics: [topic] });
    expect(saved.topics).toEqual([topic]);
    expect(saved.topics[0].createdByRunId).toBe("run-a");
    expect(mocks.topicWrite).not.toHaveBeenCalled();
    mocks.topicFind.mockClear();
    expect((await listTopicRuns("project-a")).map((row) => row.topics)).toEqual(
      [[topic], [topic]],
    );
    expect(mocks.topicFind).toHaveBeenCalledTimes(1);

    await saveTopicRun({ ...saved, topics: [] });
    expect((await getTopicRun("project-a", "run-b"))!.topics).toEqual([]);
    expect((await getTopicRun("project-a", "run-a"))!.topics).toEqual([topic]);
    expect(mocks.topicWrite).not.toHaveBeenCalled();
  });

  it("inserts and verifies a new definition before publishing membership", async () => {
    const row = runRow({ id: "run-b" });
    const created = { ...topic, createdByRunId: row.id };
    mocks.runFind.mockResolvedValue(row);
    let definitionInserted = false;
    mocks.topicWrite.mockImplementation(async () => {
      definitionInserted = true;
    });
    mocks.topicFind.mockImplementation(async (_project, ids: string[]) =>
      definitionInserted && ids.includes(created.topicVersionId)
        ? [created]
        : [],
    );
    mocks.runUpdate.mockImplementation(async ({ data }) => ({
      ...row,
      ...data,
    }));
    const run = (await getTopicRun("project-a", row.id))!;
    const saved = await saveTopicRun({
      ...run,
      topics: [created],
      status: "completed",
    });
    expect(saved.topics).toEqual([created]);
    expect(mocks.topicWrite).toHaveBeenCalledWith([created]);
    expect(mocks.runUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          topicVersionIds: [created.topicVersionId],
        }),
      }),
    );
    expect(mocks.topicWrite.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.lock.mock.invocationCallOrder[0],
    );
    expect(mocks.topicFind.mock.invocationCallOrder[2]).toBeLessThan(
      mocks.runUpdate.mock.invocationCallOrder[0],
    );
  });

  it.each([
    "missing",
    "changed",
    "wrong-project",
    "insert-failed",
    "readback-missing",
  ])("does not publish a run when its definition is %s", async (failure) => {
    const row = runRow({ id: "run-b" });
    mocks.runFind.mockResolvedValue(row);
    mocks.topicFind.mockResolvedValue(failure === "changed" ? [topic] : []);
    mocks.topicWrite.mockImplementation(async () => {
      if (failure === "insert-failed") throw new Error("Insert failed");
    });
    const run = (await getTopicRun("project-a", row.id))!;
    const candidate = {
      ...topic,
      name: failure === "changed" ? "Changed" : topic.name,
      projectId:
        failure === "wrong-project" ? "other-project" : topic.projectId,
      createdByRunId:
        failure.startsWith("insert") || failure.startsWith("readback")
          ? row.id
          : topic.createdByRunId,
    };
    await expect(
      saveTopicRun({
        ...run,
        topics: [candidate],
        status: "completed",
      }),
    ).rejects.toThrow();
    expect(mocks.runUpdate).not.toHaveBeenCalled();
  });

  it("fails hydration instead of exposing only the definitions that remain", async () => {
    mocks.runFind.mockResolvedValue(
      runRow({
        id: "run-b",
        topicVersionIds: [topic.topicVersionId, "missing"],
      }),
    );
    mocks.topicFind.mockResolvedValue([topic]);
    await expect(getTopicRun("project-a", "run-b")).rejects.toThrow(
      "missing definition",
    );
  });
});
