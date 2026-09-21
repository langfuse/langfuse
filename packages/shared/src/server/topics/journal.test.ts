import { beforeEach, describe, expect, it, vi } from "vitest";
import { TopicExecutionStore } from "./journal";
import { type TopicExecutionInput } from "../../topics";

const state = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  batches: new Map<string, Record<string, unknown>>(),
  revision: 0,
  writes: vi.fn(),
}));
vi.mock("./postgres", () => ({
  getTopicProcessingMapIds: async (
    _projectId: string,
    facetVersionIds: string[],
  ) => Object.fromEntries(facetVersionIds.map((id) => [id, null])),
}));
vi.mock("../../db", () => {
  const matches = (
    row: Record<string, unknown>,
    where: Record<string, unknown>,
  ) =>
    Object.entries(where).every(([key, value]) =>
      typeof value === "object" && value !== null && "in" in value
        ? (value.in as unknown[]).includes(row[key])
        : row[key] === value,
    );
  const topicClusteringRun = {
    findMany: async ({
      where,
      distinct,
    }: {
      where: Record<string, unknown>;
      distinct?: string[];
    }) => {
      const rows = [...state.rows.values()].filter((row) =>
        matches(row, where),
      );
      return distinct
        ? rows.filter(
            (row, index) =>
              rows.findIndex(
                (other) => other.executionId === row.executionId,
              ) === index,
          )
        : rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    },
    createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
      data.forEach((row) =>
        state.rows.set(String(row.id), {
          config: {},
          metrics: {},
          publishedAt: null,
          createdAt: new Date(),
          runSequence: BigInt(state.rows.size + 1),
          ...row,
        }),
      );
      return { count: data.length };
    },
    update: async ({
      where,
      data,
    }: {
      where: { projectId_id: { projectId: string; id: string } };
      data: Record<string, unknown>;
    }) => {
      const row = state.rows.get(where.projectId_id.id)!;
      if (row.projectId !== where.projectId_id.projectId)
        throw new Error("Scope mismatch");
      state.writes(data);
      const updated = { ...row, ...data };
      state.rows.set(String(row.id), updated);
      return updated;
    },
  };
  const batchAction = {
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      [...state.batches.values()].find((row) => matches(row, where)) ?? null,
    findMany: async ({ where }: { where: Record<string, unknown> }) =>
      [...state.batches.values()].filter((row) => matches(row, where)),
    create: async ({ data }: { data: Record<string, unknown> }) => {
      state.batches.set(String(data.id), data);
      return data;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string; projectId: string };
      data: Record<string, unknown>;
    }) => {
      const row = state.batches.get(where.id)!;
      if (row.projectId !== where.projectId) throw new Error("Scope mismatch");
      state.writes(data);
      const updated = { ...row, ...data };
      state.batches.set(where.id, updated);
      return updated;
    },
  };
  let pending = Promise.resolve<unknown>(undefined);
  const transaction = {
    topicClusteringRun,
    batchAction,
    $executeRaw: async () => 1,
    $queryRaw: async (query: TemplateStringsArray) =>
      query.join("").includes("nextval")
        ? [{ revision: BigInt(++state.revision) }]
        : [],
  };
  return {
    prisma: {
      topicClusteringRun,
      batchAction,
      $transaction: (fn: (tx: typeof transaction) => Promise<unknown>) => {
        const next = pending.then(() => fn(transaction));
        pending = next.catch(() => undefined);
        return next;
      },
    },
  };
});

const input: Extract<TopicExecutionInput, { operation: "process" }> = {
  projectId: "project-a",
  requestId: "request-1",
  operation: "process",
  facetVersionIds: ["facet-v1", "facet-v2"],
  traceIds: ["trace-a", "trace-b"],
  processingConfig: {
    summaryModel: "gpt-4.1-nano",
    maxInputTokens: 8000,
    maxOutputTokens: 512,
  },
  embeddingConfig: {
    embeddingModel: "text-embedding-3-small",
    embeddingDimensions: 768,
  },
};
const updateInput: TopicExecutionInput = {
  projectId: input.projectId,
  requestId: "update-1",
  operation: "update",
  facetVersionIds: input.facetVersionIds,
  embeddingConfig: input.embeddingConfig,
  exploratory: false,
};
beforeEach(() => {
  state.rows.clear();
  state.batches.clear();
  state.revision = 0;
  state.writes.mockClear();
});

describe("compact Topics execution storage", () => {
  it("returns uncapped trace input to the caller but persists only settings and aggregate progress", async () => {
    const traceIds = Array.from(
      { length: 2001 },
      (_, index) => `request:${index}/opaque`,
    );
    const store = new TopicExecutionStore();
    const execution = await store.create(
      {
        ...input,
        traceIds,
        ruleId: "rule-a",
        traceSelection: {
          filter: [],
          from: new Date("2026-09-01"),
          to: new Date("2026-09-02"),
          limit: null,
          sampling: "random",
          seed: "seed",
          excludedTraceIds: ["excluded"],
        },
      },
      undefined,
      "user-a",
    );
    expect(execution.input).toMatchObject({
      traceIds,
      ruleId: "rule-a",
      processingConfig: input.processingConfig,
      traceSelection: { excludedTraceIds: ["excluded"] },
    });
    expect(state.rows.size).toBe(0);
    expect(state.batches.size).toBe(1);
    expect(state.batches.get(execution.id)).toMatchObject({
      projectId: input.projectId,
      userId: "user-a",
      status: "QUEUED",
      totalCount: 2001,
    });
    const progress = (await store.readSummary(input.projectId, execution.id))!;
    expect(progress.facets.map((facet) => facet.counts.requested)).toEqual([
      2001, 2001,
    ]);
    const noisyProgress = {
      ...progress,
      status: "running" as const,
      traceErrors: [{ traceId: "failed-trace", error: "Read failed" }],
      facets: progress.facets.map((facet) => ({
        ...facet,
        summaryIds: ["paid-summary-id"],
        counts: { ...facet.counts, complete: 1 },
      })),
    };
    await store.write(noisyProgress, 1);
    const restored = await store.readSummary(input.projectId, execution.id);
    expect(restored).toMatchObject({ status: "running" });
    expect(restored?.facets[0].counts.complete).toBe(1);
    const database = JSON.stringify([...state.batches.values()]);
    for (const value of [
      "traceIds",
      "traceSelection",
      "summaryIds",
      "traceErrors",
      "request:0/opaque",
      "excluded",
      "paid-summary-id",
      "failed-trace",
    ])
      expect(database).not.toContain(value);
  });

  it("creates one clustering control row per selected facet", async () => {
    const store = new TopicExecutionStore();
    const execution = await store.create(updateInput);
    expect(state.batches.size).toBe(0);
    expect(state.rows.size).toBe(2);
    expect([...state.rows.values()]).toEqual(
      expect.arrayContaining(
        input.facetVersionIds.map((facetVersionId) =>
          expect.objectContaining({
            executionId: execution.id,
            facetVersionId,
            status: "pending",
          }),
        ),
      ),
    );
    expect(
      (await store.readSummary(input.projectId, execution.id))?.input,
    ).toEqual(updateInput);
  });

  it("accepts concurrent identical requests once and scopes reads and writes to the project", async () => {
    const store = new TopicExecutionStore();
    const [a, b] = await Promise.all([
      store.create(input, "request-hash", "user-a"),
      store.create(input, "request-hash", "user-a"),
    ]);
    expect(a.revision).toBe(b.revision);
    expect(state.batches.size).toBe(1);
    expect(await store.list(input.projectId)).toHaveLength(1);
    const summary = (await store.readSummary(input.projectId, a.id))!;
    expect(
      await store.readForRequest(
        input.projectId,
        input.requestId,
        "request-hash",
      ),
    ).toEqual(summary);
    expect(summary.input).not.toHaveProperty("traceIds");
    await expect(
      store.readForRequest(input.projectId, input.requestId, "changed-hash"),
    ).rejects.toThrow("different Topics request");
    await expect(
      store.create(
        { ...input, traceIds: ["new-trace"] },
        "request-hash",
        "user-a",
      ),
    ).rejects.toThrow("different Topics request");
    expect(await store.readSummary("project-b", a.id)).toBeNull();
    expect(
      await store.readForRequest("project-b", input.requestId, "request-hash"),
    ).toBeNull();
    expect(await store.list("project-b")).toEqual([]);
    await expect(
      store.write({ ...summary, projectId: "project-b" }),
    ).rejects.toThrow("does not exist");
  });

  it("rejects a different resolved cohort racing under the same original request", async () => {
    const store = new TopicExecutionStore();
    const results = await Promise.allSettled([
      store.create(input, "request-hash", "user-a"),
      store.create(
        { ...input, traceIds: ["new-trace"] },
        "request-hash",
        "user-a",
      ),
    ]);
    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect(state.batches.size).toBe(1);
    expect(state.batches.values().next().value).toMatchObject({
      totalCount: 2,
    });
  });

  it("ignores stale aggregate snapshots and rejects mutated execution settings", async () => {
    const store = new TopicExecutionStore();
    const created = await store.create(input, undefined, "user-a");
    const progress = (await store.readSummary(input.projectId, created.id))!;
    const newer = {
      ...progress,
      status: "running" as const,
      phase: "embedding",
      facets: progress.facets.map((facet) => ({
        ...facet,
        counts: { ...facet.counts, complete: 2 },
      })),
    };
    await store.write(newer, 2);
    state.writes.mockClear();
    await store.write(progress, 1);
    await store.write(progress, 2);
    expect(state.writes).not.toHaveBeenCalled();
    expect(await store.readSummary(input.projectId, created.id)).toMatchObject({
      status: "running",
      phase: "embedding",
      facets: newer.facets,
    });
    await expect(store.write({ ...newer, revision: "999" }, 3)).rejects.toThrow(
      "revision cannot change",
    );
    await expect(
      store.write(
        {
          ...newer,
          input: {
            ...newer.input,
            embeddingConfig: {
              ...newer.input.embeddingConfig,
              embeddingDimensions: 512,
            },
          },
        },
        3,
      ),
    ).rejects.toThrow("settings cannot change");
    await expect(
      store.write({ ...newer, facets: newer.facets.slice(0, 1) }, 3),
    ).rejects.toThrow("facets cannot change");
  });

  it("preserves a published map when writing execution progress", async () => {
    const store = new TopicExecutionStore();
    const created = await store.create(updateInput);
    const progress = (await store.readSummary(input.projectId, created.id))!;
    const row = [...state.rows.values()][0];
    state.rows.set(String(row.id), {
      ...row,
      status: "completed",
      phase: "published",
      publishedAt: new Date(),
    });
    await store.write({ ...progress, status: "running", phase: "processing" });
    expect(state.rows.get(String(row.id))).toMatchObject({
      status: "completed",
      phase: "published",
    });
  });

  it("preserves a completed facet and its finish time when another facet fails", async () => {
    const store = new TopicExecutionStore();
    const created = await store.create(updateInput);
    const progress = (await store.readSummary(input.projectId, created.id))!;
    progress.status = "running";
    progress.facets[0].outcome = "no_applicable_summaries";
    await store.write(progress);
    const completed = [...state.rows.values()].find(
      (row) => row.facetVersionId === input.facetVersionIds[0],
    )!;
    progress.status = "failed";
    progress.phase = "failed";
    progress.error = "Provider unavailable";
    await store.write(progress);
    expect(state.rows.get(String(completed.id))).toMatchObject({
      status: "completed",
      phase: "no_applicable_summaries",
      finishedAt: completed.finishedAt,
      error: null,
    });
    expect(
      [...state.rows.values()].find(
        (row) => row.facetVersionId === input.facetVersionIds[1],
      ),
    ).toMatchObject({
      status: "failed",
      phase: "failed",
      error: "Provider unavailable",
    });
  });

  it("ignores numerical attempt rows without execution metadata in progress and history", async () => {
    const store = new TopicExecutionStore();
    const created = await store.create(updateInput);
    const row = [...state.rows.values()][0];
    state.rows.set("attempt", { ...row, id: "attempt", executionMetadata: {} });
    state.rows.set("other-attempt", {
      ...row,
      id: "other-attempt",
      executionId: "attempt-only",
      executionMetadata: {},
    });
    const progress = await store.readSummary(input.projectId, created.id);
    expect(progress?.facets.map((facet) => facet.facetVersionId)).toEqual(
      input.facetVersionIds,
    );
    expect(await store.readSummary(input.projectId, "attempt-only")).toBeNull();
    expect(await store.list(input.projectId)).toEqual([progress]);
  });
});
