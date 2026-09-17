import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TopicExecutionStore } from "./journal";
import {
  topicExecutionInputSchema,
  type TopicExecutionInput,
} from "../../topics";

vi.mock("../../db", () => ({ prisma: {} }));

let root: string;
let store: TopicExecutionStore;
const input: TopicExecutionInput = {
  projectId: "project-a",
  requestId: "request-1",
  operation: "discover",
  facetVersionIds: ["facet-v1"],
  traceIds: ["trace-a", "trace-b"],
  exploratory: false,
  embeddingConfig: {
    embeddingModel: "text-embedding-3-small",
    embeddingDimensions: 768,
  },
  forceRefresh: false,
};
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "topics-journal-"));
  let sequence = 0;
  store = new TopicExecutionStore(root, async () => String(++sequence));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("local Topics execution journal", () => {
  it("accepts uncapped cohorts and independent embedding settings on refresh", async () => {
    const traceIds = Array.from(
      { length: 1001 },
      (_, index) => `trace-${index}`,
    );
    const execution = await store.create(
      topicExecutionInputSchema.parse({
        ...input,
        operation: "refresh",
        traceIds,
        embeddingConfig: { embeddingDimensions: 256 },
        forceRefresh: true,
      }),
    );
    expect(execution.input).toMatchObject({
      operation: "refresh",
      traceIds,
      embeddingConfig: {
        embeddingModel: "text-embedding-3-small",
        embeddingDimensions: 256,
      },
      forceRefresh: true,
    });
    expect(
      topicExecutionInputSchema.parse({
        ...input,
        traceIds,
        embeddingConfig: undefined,
        forceRefresh: undefined,
      }),
    ).toMatchObject({
      embeddingConfig: { embeddingDimensions: 768 },
      forceRefresh: false,
    });
    expect(
      topicExecutionInputSchema.parse({
        projectId: input.projectId,
        requestId: "recluster-large",
        facetVersionIds: input.facetVersionIds,
        operation: "recluster",
        sourceExecutionIds: Array.from(
          { length: 21 },
          (_, index) => `source-${index}`,
        ),
      }).operation,
    ).toBe("recluster");
  });

  it("treats external trace IDs as opaque values rather than artifact paths", async () => {
    const traceIds = [
      "request:2026/09.16",
      "../another-project/trace",
      "x".repeat(1000),
    ];
    const execution = await store.create({ ...input, traceIds });
    expect(
      (await store.read(input.projectId, execution.id))?.input,
    ).toMatchObject({
      traceIds,
    });
    expect(await store.list("another-project")).toEqual([]);
    expect(
      topicExecutionInputSchema.safeParse({
        ...input,
        traceIds: ["x".repeat(1001)],
      }).success,
    ).toBe(false);
  });

  it("accepts all selected facets when a project has more than three", async () => {
    const facetVersionIds = ["facet-v1", "facet-v2", "facet-v3", "facet-v4"];
    const execution = await store.create({ ...input, facetVersionIds });
    expect(execution.input.facetVersionIds).toEqual(facetVersionIds);
  });

  it("accepts concurrent retries once and rejects changed requests with the same key", async () => {
    const [a, b] = await Promise.all([
      store.create(input),
      store.create(input),
    ]);
    expect(a.id).toBe(b.id);
    expect(a.revision).toBe(b.revision);
    expect(await store.list(input.projectId)).toHaveLength(1);
    await expect(
      store.create({ ...input, traceIds: ["another-trace"] }),
    ).rejects.toThrow("different Topics request");
  });

  it("reopens accepted outputs after restart without allowing replacements", async () => {
    const execution = await store.create(input);
    const summary = { summary: "An invoice request", sourceHash: "abc" };
    await store.writeArtifact(
      input.projectId,
      execution.id,
      "summary-trace-a",
      summary,
    );
    const restarted = new TopicExecutionStore(root, async () => "999");
    expect(
      await restarted.readArtifact(
        input.projectId,
        execution.id,
        "summary-trace-a",
      ),
    ).toEqual(summary);
    await expect(
      restarted.writeArtifact(
        input.projectId,
        execution.id,
        "summary-trace-a",
        summary,
      ),
    ).resolves.toBeUndefined();
    await expect(
      restarted.writeArtifact(
        input.projectId,
        execution.id,
        "summary-trace-a",
        { summary: "different" },
      ),
    ).rejects.toThrow("cannot be replaced");
    expect((await restarted.create(input)).revision).toBe(execution.revision);
  });

  it("persists progress while preserving pinned request and revision", async () => {
    const execution = await store.create(input);
    await store.write({
      ...execution,
      status: "running",
      phase: "embedding",
    });
    expect(await store.read(input.projectId, execution.id)).toMatchObject({
      status: "running",
      phase: "embedding",
    });
    await expect(
      store.write({ ...execution, revision: "999" }),
    ).rejects.toThrow("revision cannot change");
  });

  it("isolates projects and rejects artifact path traversal", async () => {
    const execution = await store.create(input);
    expect(await store.read("project-b", execution.id)).toBeNull();
    await expect(
      store.readArtifact(input.projectId, execution.id, "../execution"),
    ).rejects.toThrow();
    await expect(
      store.writeArtifact(input.projectId, execution.id, "execution", {}),
    ).rejects.toThrow("not an immutable artifact");
  });

  it("rejects assign without every target map and recluster with trace inputs", () => {
    expect(
      topicExecutionInputSchema.safeParse({
        ...input,
        operation: "assign",
        targetRunIds: {},
      }).success,
    ).toBe(false);
    expect(
      topicExecutionInputSchema.safeParse({
        ...input,
        operation: "recluster",
        sourceExecutionIds: ["execution-a"],
      }).success,
    ).toBe(false);
    expect(
      topicExecutionInputSchema.safeParse({
        ...input,
        operation: "assign",
        targetRunIds: { "facet-v1": "run-a" },
      }).success,
    ).toBe(true);
  });
});
