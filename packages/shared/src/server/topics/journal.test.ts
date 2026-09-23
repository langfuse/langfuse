import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTopicExecution,
  readTopicExecutionForRequest,
  readTopicExecutionSummary,
  listTopicExecutions,
  writeTopicExecution,
} from "./journal";
import { type TopicExecutionInput } from "../../topics";

const state = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  batches: new Map<string, Record<string, unknown>>(),
  writes: vi.fn(),
}));
vi.mock("./postgres", () => ({
  getTopicProcessingMapIds: async (
    _projectId: string,
    facets: { facetId: string; version: number }[],
  ) =>
    facets.map(({ facetId, version }) => ({
      facetId,
      facetVersion: version,
      runId: null,
    })),
}));
vi.mock("../../db", () => {
  const matches = (
    row: Record<string, unknown>,
    where: Record<string, unknown>,
  ) => Object.entries(where).every(([key, value]) => row[key] === value);
  const topicClusteringRun = {
    createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
      data.forEach((row) => state.rows.set(String(row.id), row));
      return { count: data.length };
    },
  };
  const batchAction = {
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      [...state.batches.values()].find((row) => matches(row, where)) ?? null,
    findMany: async ({ where }: { where: Record<string, unknown> }) =>
      [...state.batches.values()].filter((row) => matches(row, where)),
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row = {
        createdAt: new Date(),
        updatedAt: new Date(),
        finishedAt: null,
        log: null,
        ...data,
      };
      state.batches.set(String(data.id), row);
      return row;
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
      const updated = { ...row, ...data, updatedAt: new Date() };
      state.batches.set(where.id, updated);
      return updated;
    },
  };
  let pending = Promise.resolve<unknown>(undefined);
  const transaction = {
    topicClusteringRun,
    batchAction,
    $executeRaw: async () => 1,
    $queryRaw: async () => [],
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
  facets: [
    { facetId: "facet", version: 1 },
    { facetId: "facet", version: 2 },
  ],
  traceIds: ["trace-a", "trace-b"],
  reuseExistingSummaries: false,
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
  facets: input.facets,
  embeddingConfig: input.embeddingConfig,
  exploratory: false,
};
beforeEach(() => {
  state.rows.clear();
  state.batches.clear();
  state.writes.mockClear();
});

describe("compact Topics execution storage", () => {
  it("returns uncapped trace input to the caller but persists only settings and aggregate progress", async () => {
    const traceIds = Array.from(
      { length: 2001 },
      (_, index) => `request:${index}/opaque`,
    );
    const execution = await createTopicExecution(
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
    const progress = (await readTopicExecutionSummary(
      input.projectId,
      execution.id,
    ))!;
    expect(progress.facets.map((facet) => facet.counts.requested)).toEqual([
      2001, 2001,
    ]);
    const noisyProgress = {
      ...progress,
      status: "running" as const,
      traceErrors: [{ traceId: "failed-trace", error: "Read failed" }],
      facets: progress.facets.map((facet) => ({
        ...facet,
        counts: { ...facet.counts, complete: 1 },
      })),
    };
    await writeTopicExecution(noisyProgress, 1);
    const restored = await readTopicExecutionSummary(
      input.projectId,
      execution.id,
    );
    expect(restored).toMatchObject({ status: "running" });
    expect(restored?.facets[0].counts.complete).toBe(1);
    const database = JSON.stringify([...state.batches.values()]);
    for (const value of [
      "traceIds",
      "traceSelection",
      "traceErrors",
      "request:0/opaque",
      "excluded",
      "failed-trace",
    ])
      expect(database).not.toContain(value);
  });

  it.each([input, updateInput])(
    "admits concurrent $operation requests once and scopes their journal to the project",
    async (request) => {
      const [a, b] = await Promise.all([
        createTopicExecution(request, "request-hash", "user-a"),
        createTopicExecution(request, "request-hash", "user-a"),
      ]);
      expect(a.id).toBe(b.id);
      expect(state.batches.size).toBe(1);
      expect([...state.rows.values()]).toEqual(
        request.operation === "update"
          ? request.facets.map(({ facetId, version }) => ({
              id: a.facets.find(
                (facet) =>
                  facet.facetId === facetId && facet.facetVersion === version,
              )!.runId,
              projectId: request.projectId,
              facetId,
              facetVersion: version,
              status: "pending",
            }))
          : [],
      );
      expect(await listTopicExecutions(input.projectId)).toHaveLength(1);
      const summary = (await readTopicExecutionSummary(input.projectId, a.id))!;
      expect(
        await readTopicExecutionForRequest(
          input.projectId,
          request.requestId,
          "request-hash",
        ),
      ).toEqual(summary);
      expect(summary.input).not.toHaveProperty("traceIds");
      await expect(
        readTopicExecutionForRequest(
          input.projectId,
          request.requestId,
          "changed-hash",
        ),
      ).rejects.toThrow("different Topics request");
      expect(await readTopicExecutionSummary("project-b", a.id)).toBeNull();
      expect(
        await readTopicExecutionForRequest(
          "project-b",
          request.requestId,
          "request-hash",
        ),
      ).toBeNull();
      expect(await listTopicExecutions("project-b")).toEqual([]);
      await expect(
        writeTopicExecution({ ...summary, projectId: "project-b" }),
      ).rejects.toThrow("does not exist");
    },
  );

  it("rejects a different resolved cohort racing under the same original request", async () => {
    const results = await Promise.allSettled([
      createTopicExecution(input, "request-hash", "user-a"),
      createTopicExecution(
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
    const created = await createTopicExecution(input, undefined, "user-a");
    const progress = (await readTopicExecutionSummary(
      input.projectId,
      created.id,
    ))!;
    const newer = {
      ...progress,
      status: "running" as const,
      phase: "embedding",
      facets: progress.facets.map((facet) => ({
        ...facet,
        counts: { ...facet.counts, complete: 2 },
      })),
    };
    await writeTopicExecution(newer, 2);
    state.writes.mockClear();
    await writeTopicExecution(progress, 1);
    await writeTopicExecution(progress, 2);
    expect(state.writes).not.toHaveBeenCalled();
    expect(
      await readTopicExecutionSummary(input.projectId, created.id),
    ).toMatchObject({
      status: "running",
      phase: "embedding",
      facets: newer.facets,
    });
    await expect(
      writeTopicExecution(
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
      writeTopicExecution({ ...newer, facets: newer.facets.slice(0, 1) }, 3),
    ).rejects.toThrow("facets cannot change");
    await expect(
      writeTopicExecution(
        { ...newer, facets: [newer.facets[0], newer.facets[0]] },
        3,
      ),
    ).rejects.toThrow("facets cannot change");
  });

  it("writes update progress without modifying completed or pending clustering runs", async () => {
    const created = await createTopicExecution(
      updateInput,
      undefined,
      "user-a",
    );
    const progress = (await readTopicExecutionSummary(
      input.projectId,
      created.id,
    ))!;
    const first = state.rows.get(progress.facets[0].runId!)!;
    state.rows.set(String(first.id), {
      ...first,
      status: "completed",
      finishedAt: new Date(),
    });
    const rowsBefore = structuredClone([...state.rows.values()]);
    progress.facets[0].outcome = "published";
    progress.facets[1].outcome = "failed";
    progress.facets[1].error = "Provider unavailable";
    await writeTopicExecution({
      ...progress,
      status: "failed",
      phase: "failed",
      error: "Provider unavailable",
    });
    expect([...state.rows.values()]).toEqual(rowsBefore);
    expect(state.batches.get(created.id)).toMatchObject({
      status: "FAILED",
      processedCount: 2,
      failedCount: 1,
      log: "Provider unavailable",
    });
    expect(
      await readTopicExecutionSummary(input.projectId, created.id),
    ).toMatchObject({
      status: "failed",
      facets: progress.facets,
    });
  });

  it.each([input, updateInput])(
    "requires the requesting user for $operation",
    async (request) => {
      await expect(createTopicExecution(request)).rejects.toThrow(
        "A user is required",
      );
      expect(state.batches.size).toBe(0);
      expect(state.rows.size).toBe(0);
    },
  );
});
