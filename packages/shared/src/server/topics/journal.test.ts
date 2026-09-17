import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { TopicExecutionStore } from "./journal";
import { type TopicExecutionInput } from "../../topics";

const state = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  objects: new Map<string, string>(),
  revision: 0,
  writes: vi.fn(),
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
      state.objects.set(key, JSON.stringify(value));
    },
    download: async (key: string) => {
      if (!state.objects.has(key)) throw new Error("Object unavailable");
      return state.objects.get(key)!;
    },
  }),
}));
vi.mock("../../db", () => {
  const matches = (row: Record<string, unknown>, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => row[key] === value);
  const topicClusteringRun = {
    findMany: async ({ where, distinct }: {
      where: Record<string, unknown>;
      distinct?: string[];
    }) => {
      const rows = [...state.rows.values()].filter((row) => matches(row, where));
      return distinct
        ? rows.filter((row, index) => rows.findIndex((other) => other.executionId === row.executionId) === index)
        : rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    },
    createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
      data.forEach((row) => state.rows.set(String(row.id), {
        config: {}, metrics: {}, manifestPath: "", artifactPath: "", publishedAt: null,
        createdAt: new Date(), runSequence: BigInt(state.rows.size + 1), ...row,
      }));
      return { count: data.length };
    },
    update: async ({ where, data }: {
      where: { projectId_id: { projectId: string; id: string } };
      data: Record<string, unknown>;
    }) => {
      const row = state.rows.get(where.projectId_id.id)!;
      if (row.projectId !== where.projectId_id.projectId) throw new Error("Scope mismatch");
      state.writes(data);
      const updated = { ...row, ...data };
      state.rows.set(String(row.id), updated);
      return updated;
    },
  };
  let pending = Promise.resolve<unknown>(undefined);
  const transaction = {
    topicClusteringRun,
    $queryRaw: async (query: TemplateStringsArray) =>
      query.join("").includes("nextval") ? [{ revision: BigInt(++state.revision) }] : [],
  };
  return { prisma: {
    topicClusteringRun,
    $transaction: (fn: (tx: typeof transaction) => Promise<unknown>) => {
      const next = pending.then(() => fn(transaction));
      pending = next.catch(() => undefined);
      return next;
    },
  } };
});

const input: TopicExecutionInput = {
  projectId: "project-a", requestId: "request-1", operation: "discover",
  facetVersionIds: ["facet-v1", "facet-v2"], traceIds: ["trace-a", "trace-b"],
  exploratory: false, forceRefresh: false,
  embeddingConfig: { embeddingModel: "text-embedding-3-small", embeddingDimensions: 768 },
};
beforeEach(() => {
  state.rows.clear(); state.objects.clear(); state.revision = 0; state.writes.mockClear();
});

describe("durable Topics execution storage", () => {
  it("creates one run per facet and keeps uncapped input IDs in chunked object storage", async () => {
    const traceIds = Array.from({ length: 2001 }, (_, index) => `request:${index}/opaque`);
    const store = new TopicExecutionStore();
    const execution = await store.create({ ...input, traceIds });
    expect(state.rows.size).toBe(2);
    for (const facetId of input.facetVersionIds) {
      const id = createHash("sha256").update(JSON.stringify([execution.id, facetId, "run"])).digest("hex").slice(0, 48);
      expect(state.rows.get(id)).toMatchObject({ executionId: execution.id, facetVersionId: facetId, status: "pending" });
    }
    const database = JSON.stringify([...state.rows.values()], (_, value) => typeof value === "bigint" ? String(value) : value);
    expect(database).not.toContain("request:0/opaque");
    expect(database).toContain('"selectedTraceCount":2001');
    expect([...state.objects.values()].filter((value) => value.includes("request:")).map((value) => JSON.parse(value).value.length)).toEqual([1000, 1000, 1]);
    expect((await new TopicExecutionStore().read(input.projectId, execution.id))?.input).toMatchObject({ traceIds });
  });

  it("accepts a concurrent duplicate once and rejects a changed request", async () => {
    const store = new TopicExecutionStore();
    const [a, b] = await Promise.all([store.create(input), store.create(input)]);
    expect(a.revision).toBe(b.revision);
    expect(state.rows.size).toBe(2);
    expect(await store.list(input.projectId)).toHaveLength(1);
    await expect(store.create({ ...input, traceIds: ["other"] })).rejects.toThrow("different Topics request");
    expect(await store.read("project-b", a.id)).toBeNull();
    expect(await store.list("project-b")).toEqual([]);
  });

  it("restores progress after restart without storing summary references or errors in Postgres", async () => {
    const store = new TopicExecutionStore();
    const execution = await store.create(input);
    execution.status = "running";
    execution.phase = "embedding";
    execution.facets[0].summaryIds = ["paid-summary-id"];
    execution.traceErrors = [{ traceId: "failed-trace", error: "Read failed" }];
    await store.write(execution);
    const restored = await new TopicExecutionStore().read(input.projectId, execution.id);
    expect(restored).toMatchObject({ status: "running", phase: "embedding", traceErrors: execution.traceErrors });
    expect(restored?.facets[0].summaryIds).toEqual(["paid-summary-id"]);
    const database = JSON.stringify([...state.rows.values()], (_, value) => typeof value === "bigint" ? String(value) : value);
    expect(database).not.toContain("paid-summary-id");
    expect(database).not.toContain("failed-trace");
    await expect(store.write({ ...execution, revision: "999" })).rejects.toThrow("revision cannot change");
  });

  it("keeps accepted numeric results immutable and preserves them during progress updates", async () => {
    const store = new TopicExecutionStore();
    const execution = await store.create(input);
    const value = { coordinates: [[1, 2]], labels: [0] };
    await store.writeArtifact(input.projectId, execution.id, "numeric-fit", value);
    await store.write(execution);
    expect(await new TopicExecutionStore().readArtifact(input.projectId, execution.id, "numeric-fit")).toEqual(value);
    await store.writeArtifact(input.projectId, execution.id, "numeric-fit", value);
    await expect(store.writeArtifact(input.projectId, execution.id, "numeric-fit", { labels: [1] })).rejects.toThrow("cannot be replaced");
    expect(await store.readArtifact("project-b", execution.id, "numeric-fit")).toBeNull();
    await expect(store.writeArtifact(input.projectId, execution.id, "../execution", {})).rejects.toThrow();
  });

  it("preserves a published map when writing execution progress", async () => {
    const store = new TopicExecutionStore();
    const execution = await store.create(input);
    const row = [...state.rows.values()][0];
    state.rows.set(String(row.id), { ...row, status: "completed", phase: "published", publishedAt: new Date() });
    await store.write({ ...execution, status: "running", phase: "processing" });
    expect(state.rows.get(String(row.id))).toMatchObject({ status: "completed", phase: "published" });
  });
});
