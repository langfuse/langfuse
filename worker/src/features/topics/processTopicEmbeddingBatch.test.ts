import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnrecoverableError } from "bullmq";
import type {
  TopicEmbeddingConfig,
  TopicSummary,
} from "@langfuse/shared/topics";
import type { TopicEmbeddingBatch } from "@langfuse/shared/topics/server";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  staged: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  embed: vi.fn(),
}));
vi.mock("@langfuse/shared/topics/server", () => ({
  readTopicSummaries: mocks.read,
  writeTopicSummaries: mocks.write,
  readStagedTopicSummary: mocks.staged,
  updateStagedTopicSummary: mocks.update,
  deleteStagedTopicSummary: mocks.remove,
  TOPIC_EMBEDDING_EXPIRED_ERROR:
    "Topics summaries expired before embedding completed. Start a new execution to regenerate them.",
}));
vi.mock("@langfuse/shared/src/server", () => ({
  recordIncrement: vi.fn(),
  recordDistribution: vi.fn(),
}));
vi.mock("./models", () => ({ embedTopicSummary: mocks.embed }));

import { processTopicEmbeddingBatch } from "./processTopicEmbeddingBatch";
import { TopicsProviderUnavailable } from "./provider-error";

const embeddingConfig: TopicEmbeddingConfig = {
  embeddingModel: "text-embedding-3-small",
  embeddingDimensions: 16,
};
const summary = (id = "summary"): TopicSummary => ({
  id,
  projectId: "project",
  executionId: "execution",
  facetId: "facet",
  facetVersionId: "facet-version",
  facetVersion: 1,
  traceId: `trace-${id}`,
  unitType: "trace",
  triggerType: "manual_poc",
  traceTimestamp: "2026-09-18T00:00:00.000Z",
  processedAt: "2026-09-18T00:00:00.000Z",
  revision: "1",
  resultVersion: 1,
  state: "summarized",
  summary: `A summary of ${id}.`,
  embedding: [],
  inputHash: "input",
  snapshotHash: "snapshot",
  invocationHash: "invocation",
  summaryModel: "gpt-4.1-nano",
  embeddingModel: embeddingConfig.embeddingModel,
  inputTokens: 20,
  outputTokens: 10,
  embeddingTokens: 0,
  summaryCostUsd: 0.0001,
  embeddingCostUsd: 0,
  metadata: {},
});
const batch = (...rows: TopicSummary[]): TopicEmbeddingBatch => ({
  projectId: "project",
  executionId: "execution",
  batchId: "batch",
  summaries: rows.map((row) => ({
    summaryId: row.id,
    facetVersionId: row.facetVersionId,
    traceId: row.traceId,
  })),
});
let staged: Map<string, TopicSummary>;
beforeEach(() => {
  vi.resetAllMocks();
  staged = new Map();
  mocks.read.mockResolvedValue([]);
  mocks.write.mockResolvedValue(undefined);
  mocks.staged.mockImplementation(async (_batch, ref) => {
    const row = staged.get(ref.summaryId);
    return row ? { summary: row, embeddingConfig } : null;
  });
  mocks.update.mockImplementation(async (_batch, ref, row) => {
    if (staged.has(ref.summaryId)) staged.set(ref.summaryId, row);
  });
  mocks.remove.mockImplementation(async (_batch, ref) => {
    staged.delete(ref.summaryId);
  });
  mocks.embed.mockResolvedValue({
    embedding: Array(16).fill(0.25),
    inputTokens: 8,
    costUsd: 0.000001,
  });
});

describe("Topics embedding handoff", () => {
  it("writes combined results once and waits for storage before releasing staged data", async () => {
    const applicable = summary();
    const nonApplicable: TopicSummary = {
      ...summary("empty"),
      state: "not_applicable",
      resultVersion: 2,
      summary: "",
    };
    for (const row of [applicable, nonApplicable]) staged.set(row.id, row);
    let acknowledge!: () => void;
    mocks.write.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          acknowledge = resolve;
        }),
    );
    const processing = processTopicEmbeddingBatch(
      batch(applicable, nonApplicable),
    );
    await vi.waitFor(() => expect(mocks.write).toHaveBeenCalledOnce());
    expect(mocks.write.mock.calls[0][0]).toMatchObject([
      {
        id: applicable.id,
        state: "complete",
        embeddingTokens: 8,
        resultVersion: 2,
      },
      { id: nonApplicable.id, state: "not_applicable", embedding: [] },
    ]);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.embed).toHaveBeenCalledOnce();
    acknowledge();
    await processing;
    expect(staged.size).toBe(0);
  });

  it("reuses an embedding after a failed ClickHouse write", async () => {
    const row = summary();
    staged.set(row.id, row);
    mocks.write.mockRejectedValueOnce(new Error("ClickHouse unavailable"));
    await expect(processTopicEmbeddingBatch(batch(row))).rejects.toThrow(
      "ClickHouse unavailable",
    );
    expect(staged.get(row.id)?.state).toBe("complete");
    expect(mocks.remove).not.toHaveBeenCalled();
    await processTopicEmbeddingBatch(batch(row));
    expect(mocks.embed).toHaveBeenCalledOnce();
    expect(mocks.write).toHaveBeenCalledTimes(2);
    expect(staged.size).toBe(0);
  });

  it("reports expired payloads as unrecoverable instead of regenerating summaries", async () => {
    await expect(processTopicEmbeddingBatch(batch(summary()))).rejects.toThrow(
      UnrecoverableError,
    );
    await expect(processTopicEmbeddingBatch(batch(summary()))).rejects.toThrow(
      "Start a new execution",
    );
    expect(mocks.embed).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("accepts already durable results even after Redis expires", async () => {
    const row: TopicSummary = {
      ...summary(),
      executionId: "earlier-execution",
      state: "complete",
      resultVersion: 2,
      embedding: Array(16).fill(0.25),
    };
    mocks.read.mockResolvedValue([row]);
    await processTopicEmbeddingBatch(batch(row));
    expect(mocks.staged).not.toHaveBeenCalled();
    expect(mocks.embed).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("persists completed rows before retrying a later provider failure", async () => {
    const rows = [summary("first"), summary("second")];
    for (const row of rows) staged.set(row.id, row);
    mocks.embed.mockResolvedValueOnce({
      embedding: Array(16).fill(0.25),
      inputTokens: 8,
      costUsd: 0.000001,
    });
    const failure = new TopicsProviderUnavailable(
      "Topics provider call failed (HTTP 429).",
      "rate_limit",
    );
    mocks.embed.mockRejectedValueOnce(failure);
    await expect(processTopicEmbeddingBatch(batch(...rows))).rejects.toBe(
      failure,
    );
    expect(mocks.write.mock.calls[0][0]).toMatchObject([
      { id: "first", state: "complete" },
    ]);
    expect(staged.has("first")).toBe(false);
    expect(staged.get("second")?.state).toBe("summarized");
  });

  it("does not retry provider authentication failures", async () => {
    const row = summary();
    staged.set(row.id, row);
    mocks.embed.mockRejectedValue(
      new TopicsProviderUnavailable(
        "Check worker credentials.",
        "authentication",
      ),
    );
    await expect(processTopicEmbeddingBatch(batch(row))).rejects.toThrow(
      UnrecoverableError,
    );
    expect(mocks.write).not.toHaveBeenCalled();
    expect(staged.get(row.id)?.state).toBe("summarized");
  });

  it("rejects a staged summary belonging to another project", async () => {
    const row = summary();
    staged.set(row.id, { ...row, projectId: "different-project" });
    await expect(processTopicEmbeddingBatch(batch(row))).rejects.toThrow(
      "identity mismatch",
    );
    expect(mocks.embed).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("persists an in-memory embedding when its Redis payload expires during the call", async () => {
    const row = summary();
    staged.set(row.id, row);
    mocks.embed.mockImplementation(async () => {
      staged.delete(row.id);
      return {
        embedding: Array(16).fill(0.25),
        inputTokens: 8,
        costUsd: 0.000001,
      };
    });
    await processTopicEmbeddingBatch(batch(row));
    expect(mocks.write.mock.calls[0][0]).toMatchObject([
      { id: row.id, state: "complete" },
    ]);
    expect(staged.size).toBe(0);
  });
});
