import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTopicExecution,
  readTopicExecutionSummary,
  listTopicExecutions,
  writeTopicExecution,
} from "./execution-store";
import { type TopicExecutionInput } from "../../topics";

const state = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  batches: new Map<string, Record<string, unknown>>(),
  findBatch: vi.fn(),
  writes: vi.fn(),
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
      if (state.batches.has(String(data.id)))
        throw new Error("Duplicate execution");
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
  const transaction = {
    topicClusteringRun,
    batchAction,
    evaluatorVersion: {
      count: async ({ where }: { where: { OR: unknown[] } }) => where.OR.length,
    },
    $executeRaw: async () => 1,
    $queryRaw: async () => [],
  };
  return {
    prisma: {
      topicClusteringRun,
      batchAction: {
        ...batchAction,
        findFirst: state.findBatch.mockImplementation(batchAction.findFirst),
      },
      $transaction: (fn: (tx: typeof transaction) => Promise<unknown>) =>
        fn(transaction),
    },
  };
});

const input: TopicExecutionInput = {
  projectId: "project-a",
  requestId: "update-1",
  operation: "update",
  timeRange: {
    from: new Date("2026-09-01T00:00:00.000Z"),
    to: new Date("2026-10-01T00:00:00.000Z"),
  },
  facets: [
    { facetId: "facet", version: 1 },
    { facetId: "facet", version: 2 },
  ],
  embeddingConfig: {
    embeddingModel: "eu.cohere.embed-v4:0",
    embeddingDimensions: 1024,
  },
  exploratory: false,
};
beforeEach(() => {
  state.rows.clear();
  state.batches.clear();
  state.findBatch.mockClear();
  state.writes.mockClear();
});

describe("Topics execution store application contract", () => {
  it("rechecks an existing request after an optimistic read misses it and preserves project scope", async () => {
    const request = input;
    {
      const a = await createTopicExecution(request, "request-hash", "user-a");
      state.findBatch.mockResolvedValueOnce(null);
      const b = await createTopicExecution(request, "request-hash", "user-a");
      expect(a.id).toBe(b.id);
      expect(state.batches.size).toBe(1);
      expect([...state.rows.values()]).toEqual(
        request.facets.map(({ facetId, version }) => ({
          id: a.facets.find(
            (facet) =>
              facet.facetId === facetId && facet.facetVersion === version,
          )!.runId,
          projectId: request.projectId,
          facetId,
          facetVersion: version,
          status: "pending",
          batchActionId: a.id,
          config: {
            timeRange: {
              from: request.timeRange.from.toISOString(),
              to: request.timeRange.to.toISOString(),
            },
          },
        })),
      );
      expect(await listTopicExecutions(input.projectId)).toHaveLength(1);
      const summary = (await readTopicExecutionSummary(input.projectId, a.id))!;
      expect(summary.input).toMatchObject({ timeRange: request.timeRange });
      expect([...state.batches.values()][0]).toMatchObject({
        config: {
          inputSettings: {
            timeRange: {
              from: request.timeRange.from.toISOString(),
              to: request.timeRange.to.toISOString(),
            },
          },
        },
      });
      expect(await readTopicExecutionSummary("project-b", a.id)).toBeNull();
      expect(await listTopicExecutions("project-b")).toEqual([]);
      await expect(
        writeTopicExecution({ ...summary, projectId: "project-b" }),
      ).rejects.toThrow("does not exist");
    }
  });

  it("rejects different settings for a request ID found during the transaction recheck", async () => {
    await createTopicExecution(input, "request-hash", "user-a");
    state.findBatch.mockResolvedValueOnce(null);
    await expect(
      createTopicExecution(
        { ...input, exploratory: true },
        "request-hash",
        "user-a",
      ),
    ).rejects.toThrow("different Topics request");
    expect(state.batches.size).toBe(1);
    expect(state.batches.values().next().value).toMatchObject({
      totalCount: 2,
    });
  });

  it("rejects changes to the execution facets", async () => {
    const created = await createTopicExecution(input, undefined, "user-a");
    const progress = (await readTopicExecutionSummary(
      input.projectId,
      created.id,
    ))!;
    const newer = {
      ...progress,
      status: "running" as const,
      phase: "selecting",
      facets: progress.facets.map((facet) => ({
        ...facet,
        counts: { ...facet.counts, complete: 2 },
      })),
    };
    await expect(
      writeTopicExecution({ ...newer, facets: newer.facets.slice(0, 1) }),
    ).rejects.toThrow("facets cannot change");
    await expect(
      writeTopicExecution({
        ...newer,
        facets: [newer.facets[0], newer.facets[0]],
      }),
    ).rejects.toThrow("facets cannot change");
  });

  it("writes update progress without modifying completed or pending clustering runs", async () => {
    const created = await createTopicExecution(input, undefined, "user-a");
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

  it("requires the requesting user", async () => {
    await expect(createTopicExecution(input)).rejects.toThrow(
      "A user is required",
    );
    expect(state.batches.size).toBe(0);
    expect(state.rows.size).toBe(0);
  });
});
