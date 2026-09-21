import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { TopicExecutionStore } from "./journal";
import { type TopicExecutionInput } from "../../topics";

const state = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  batches: new Map<string, Record<string, unknown>>(),
  objects: new Map<string, string>(),
  revision: 0,
  writes: vi.fn(),
  uploads: vi.fn(),
  downloads: vi.fn(),
}));
vi.mock("../../env", () => ({
  env: {
    LANGFUSE_S3_EVENT_UPLOAD_BUCKET: "events",
    LANGFUSE_S3_EVENT_UPLOAD_PREFIX: "ingestion/",
  },
}));
vi.mock("../s3", () => ({
  getS3EventStorageClient: () => ({
    uploadJson: async (key: string, value: unknown) => {
      state.uploads(key);
      state.objects.set(key, JSON.stringify(value));
    },
    download: async (key: string) => {
      state.downloads(key);
      if (!state.objects.has(key)) throw new Error("Object unavailable");
      return state.objects.get(key)!;
    },
  }),
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
          manifestPath: "",
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
  state.objects.clear();
  state.revision = 0;
  state.writes.mockClear();
  state.uploads.mockClear();
  state.downloads.mockClear();
});

describe("durable Topics execution storage", () => {
  it("tracks a manual request with one batch row and keeps uncapped input IDs in object storage", async () => {
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
          filter: [
            {
              type: "datetime",
              column: "startTime",
              operator: ">=",
              value: new Date("2026-09-01"),
            },
          ],
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
    expect(execution.input).toMatchObject({ ruleId: "rule-a" });
    expect(
      execution.input.operation === "process" && execution.input.traceSelection,
    ).toMatchObject({
      from: new Date("2026-09-01"),
      to: new Date("2026-09-02"),
      filter: [{ value: new Date("2026-09-01") }],
      excludedTraceIds: ["excluded"],
    });
    expect(execution.input).toMatchObject({
      processingConfig: input.processingConfig,
    });
    expect(state.rows.size).toBe(0);
    expect(state.batches.size).toBe(1);
    expect(state.batches.get(execution.id)).toMatchObject({
      projectId: input.projectId,
      userId: "user-a",
      status: "QUEUED",
      totalCount: 2001,
    });
    const database = JSON.stringify([...state.batches.values()], (_, value) =>
      typeof value === "bigint" ? String(value) : value,
    );
    expect(database).not.toContain("request:0/opaque");
    expect(database).not.toContain("excluded");
    expect(execution.facets.map((facet) => facet.counts.requested)).toEqual([
      2001, 2001,
    ]);
    expect(
      [...state.objects.values()]
        .filter((value) => value.includes("request:"))
        .map((value) => JSON.parse(value).value.length),
    ).toEqual([1000, 1000, 1]);
    expect(
      (await new TopicExecutionStore().read(input.projectId, execution.id))
        ?.input,
    ).toMatchObject({ traceIds });
  });

  it("creates one actual clustering run per facet for an update", async () => {
    const execution = await new TopicExecutionStore().create(updateInput);
    expect(state.batches.size).toBe(0);
    expect(state.rows.size).toBe(2);
    for (const facetId of input.facetVersionIds) {
      const id = createHash("sha256")
        .update(JSON.stringify([execution.id, facetId, "run"]))
        .digest("hex")
        .slice(0, 48);
      expect(state.rows.get(id)).toMatchObject({
        executionId: execution.id,
        facetVersionId: facetId,
        status: "pending",
      });
    }
  });

  it("hydrates update progress from its accepted run cohort", async () => {
    const store = new TopicExecutionStore();
    const execution = await store.create(updateInput);
    const row = [...state.rows.values()].find(
      (row) => row.facetVersionId === execution.facets[0].facetVersionId,
    )!;
    const summaryIds = ["summary-b", "summary-a"];
    await store.writeArtifact(
      input.projectId,
      execution.id,
      "cohort-selected",
      {
        summaryIds,
      },
    );
    row.manifestPath = "cohort-selected";
    execution.facets[0].runId = String(row.id);
    await store.write(execution);

    const restored = await store.read(input.projectId, execution.id);
    expect(restored?.facets[0].summaryIds).toEqual(summaryIds);
    expect(
      [...state.objects.values()].filter((body) => body.includes("summary-b")),
    ).toHaveLength(1);
  });

  it("accepts a concurrent duplicate once and rejects a changed request", async () => {
    const store = new TopicExecutionStore();
    const [a, b] = await Promise.all([
      store.create(input, undefined, "user-a"),
      store.create(input, undefined, "user-a"),
    ]);
    expect(a.revision).toBe(b.revision);
    expect(state.batches.size).toBe(1);
    expect(state.rows.size).toBe(0);
    expect(await store.list(input.projectId)).toHaveLength(1);
    await expect(
      store.create({ ...input, traceIds: ["other"] }, undefined, "user-a"),
    ).rejects.toThrow("different Topics request");
    expect(await store.read("project-b", a.id)).toBeNull();
    expect(await store.list("project-b")).toEqual([]);
  });

  it("reuses the first frozen cohort when a filtered request is retried after new traces arrive", async () => {
    const store = new TopicExecutionStore();
    const requestHash = "original-filter-request-hash";
    const first = await store.create(input, requestHash, "user-a");
    const later = await store.create(
      { ...input, traceIds: ["new-trace"] },
      requestHash,
      "user-a",
    );
    expect(later.input).toEqual(first.input);
    expect(
      await store.readForRequest(input.projectId, input.requestId, requestHash),
    ).toEqual(first);
    await expect(
      store.readForRequest(
        input.projectId,
        input.requestId,
        "different-filter",
      ),
    ).rejects.toThrow("different Topics request");
  });

  it("restores progress after restart without storing summary references or errors in Postgres", async () => {
    const store = new TopicExecutionStore();
    const execution = await store.create(input, undefined, "user-a");
    execution.status = "running";
    execution.phase = "embedding";
    execution.facets[0].summaryIds = ["paid-summary-id"];
    execution.traceErrors = [{ traceId: "failed-trace", error: "Read failed" }];
    await store.write(execution);
    const restored = await new TopicExecutionStore().read(
      input.projectId,
      execution.id,
    );
    expect(restored).toMatchObject({
      status: "running",
      phase: "embedding",
      traceErrors: execution.traceErrors,
    });
    expect(restored?.facets[0].summaryIds).toEqual(["paid-summary-id"]);
    const database = JSON.stringify(
      [...state.batches.values(), ...state.rows.values()],
      (_, value) => (typeof value === "bigint" ? String(value) : value),
    );
    expect(database).not.toContain("paid-summary-id");
    expect(database).not.toContain("failed-trace");
    await expect(
      store.write({ ...execution, revision: "999" }),
    ).rejects.toThrow("revision cannot change");
  });

  it("keeps accepted numeric results immutable and preserves them during progress updates", async () => {
    const store = new TopicExecutionStore();
    const execution = await store.create(input, undefined, "user-a");
    const value = { coordinates: [[1, 2]], labels: [0] };
    await store.writeArtifact(
      input.projectId,
      execution.id,
      "numeric-fit",
      value,
    );
    await store.write(execution);
    expect(
      await new TopicExecutionStore().readArtifact(
        input.projectId,
        execution.id,
        "numeric-fit",
      ),
    ).toEqual(value);
    await store.writeArtifact(
      input.projectId,
      execution.id,
      "numeric-fit",
      value,
    );
    await expect(
      store.writeArtifact(input.projectId, execution.id, "numeric-fit", {
        labels: [1],
      }),
    ).rejects.toThrow("cannot be replaced");
    expect(
      await store.readArtifact("project-b", execution.id, "numeric-fit"),
    ).toBeNull();
    await expect(
      store.writeArtifact(input.projectId, execution.id, "../execution", {}),
    ).rejects.toThrow();
  });

  it("preserves a published map when writing execution progress", async () => {
    const store = new TopicExecutionStore();
    const execution = await store.create(updateInput);
    const row = [...state.rows.values()][0];
    state.rows.set(String(row.id), {
      ...row,
      status: "completed",
      phase: "published",
      publishedAt: new Date(),
    });
    await store.write({ ...execution, status: "running", phase: "processing" });
    expect(state.rows.get(String(row.id))).toMatchObject({
      status: "completed",
      phase: "published",
    });
  });

  it("preserves a completed facet and its finish time when another facet fails", async () => {
    const store = new TopicExecutionStore();
    const execution = await store.create(updateInput);
    execution.status = "running";
    execution.facets[0].outcome = "no_applicable_summaries";
    await store.write(execution);
    const completed = [...state.rows.values()].find(
      (row) => row.facetVersionId === input.facetVersionIds[0],
    )!;
    execution.status = "failed";
    execution.phase = "failed";
    execution.error = "Provider unavailable";
    await store.write(execution);
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

  it("reads progress and history without loading input or result manifests", async () => {
    const store = new TopicExecutionStore();
    const execution = await store.create(input, undefined, "user-a");
    execution.facets[0].summaryIds = ["summary-a"];
    execution.facets[0].counts.complete = 1;
    await store.write(execution);
    await store.create(updateInput);
    state.downloads.mockClear();
    const summary = await store.readSummary(input.projectId, execution.id);
    expect(summary?.input).not.toHaveProperty("traceIds");
    expect(summary?.facets[0]).not.toHaveProperty("summaryIds");
    expect(summary?.facets[0].counts.complete).toBe(1);
    expect(await store.list(input.projectId)).toHaveLength(2);
    expect(state.downloads).not.toHaveBeenCalled();
  });

  it("uploads only changed progress chunks across successive batches", async () => {
    const store = new TopicExecutionStore();
    const execution = await store.create(input, undefined, "user-a");
    execution.facets[0].summaryIds = Array.from(
      { length: 2000 },
      (_, index) => `summary-${index}`,
    );
    await store.write(execution);
    state.uploads.mockClear();
    await store.write({ ...execution, phase: "naming" });
    expect(state.uploads).not.toHaveBeenCalled();
    execution.facets[0].summaryIds.push("summary-2000");
    await store.write(execution);
    expect(state.uploads).toHaveBeenCalledTimes(2);
    expect(
      (await store.read(input.projectId, execution.id))?.facets[0].summaryIds,
    ).toHaveLength(2001);
  });
});
