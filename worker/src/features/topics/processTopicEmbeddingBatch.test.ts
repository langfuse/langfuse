import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UnrecoverableError } from "bullmq";
import type {
  TopicEmbeddingConfig,
  TopicSummary,
} from "@langfuse/shared/topics";
import type { TopicEmbeddingBatch } from "@langfuse/shared/topics/server";

const mocks = vi.hoisted(() => ({
  write: vi.fn(),
  staged: vi.fn(),
  update: vi.fn(),
  embed: vi.fn(),
}));
vi.mock("@langfuse/shared/topics/server", () => ({
  writeTopicSummaries: mocks.write,
  readStagedTopicSummary: mocks.staged,
  updateStagedTopicSummary: mocks.update,
  TOPIC_EMBEDDING_EXPIRED_ERROR:
    "Topics staged results expired before processing completed. Start a new execution with stored-summary reuse to recover persisted results.",
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
  facetId: "facet",
  facetVersion: 1,
  traceId: `trace-${id}`,
  sessionId: null,
  triggerType: "manual_poc",
  unitStartTime: "2026-09-18T00:00:00.000Z",
  environment: "production",
  traceName: "Customer support",
  processedAt: "2026-09-18T00:00:00.000Z",
  state: "summarized",
  summary: `A summary of ${id}.`,
  embedding: [],
  transcriptId: "poc",
  transcriptVersion: "poc",
  summaryModel: "gpt-4.1-nano",
  embeddingModel: embeddingConfig.embeddingModel,
  providedUsageDetails: { summary_input: 20, summary_output: 10 },
  usageDetails: { summary_input: 20, summary_output: 10, total: 30 },
  providedCostDetails: {},
  costDetails: {
    summary_input: 0.00006,
    summary_output: 0.00004,
    total: 0.0001,
  },
  metadata: {},
});
const batch = (...rows: TopicSummary[]): TopicEmbeddingBatch => ({
  projectId: "project",
  executionId: "execution",
  batchId: "batch",
  summaries: rows.map((row) => ({
    summaryId: row.id,
    facetId: row.facetId,
    facetVersion: row.facetVersion,
    traceId: row.traceId,
  })),
});
const embeddingResult = {
  embedding: Array(16).fill(0.25),
  providedUsageDetails: { embedding_input: 8, total: 8 },
  usageDetails: { embedding_input: 8, total: 8 },
  providedCostDetails: {},
  costDetails: { embedding_input: 0.000001, total: 0.000001 },
};
let staged: Map<string, TopicSummary>;
beforeEach(() => {
  vi.resetAllMocks();
  staged = new Map();
  mocks.write.mockResolvedValue(undefined);
  mocks.staged.mockImplementation(async (_batch, ref) => {
    const row = staged.get(ref.summaryId);
    return row ? { summary: row, embeddingConfig } : null;
  });
  mocks.update.mockImplementation(async (_batch, ref, row) => {
    const existing = staged.get(ref.summaryId);
    if (!existing) return null;
    if (existing.state !== "summarized") return existing;
    staged.set(ref.summaryId, row);
    return row;
  });
  mocks.embed.mockResolvedValue(embeddingResult);
});
afterEach(() => vi.useRealTimers());

describe("Topics embedding handoff", () => {
  it("retries combined results from Redis after a failed ClickHouse write", async () => {
    const applicable = summary();
    const nonApplicable: TopicSummary = {
      ...summary("empty"),
      state: "not_applicable",
      summary: "",
    };
    for (const row of [applicable, nonApplicable]) staged.set(row.id, row);
    mocks.write.mockRejectedValueOnce(new Error("ClickHouse unavailable"));
    await expect(
      processTopicEmbeddingBatch(batch(applicable, nonApplicable)),
    ).rejects.toThrow("ClickHouse unavailable");
    expect(mocks.write.mock.calls[0][0]).toMatchObject([
      {
        id: applicable.id,
        state: "complete",
        providedUsageDetails: {
          summary_input: 20,
          summary_output: 10,
          embedding_input: 8,
          total: 38,
        },
        usageDetails: {
          summary_input: 20,
          summary_output: 10,
          embedding_input: 8,
          total: 38,
        },
        providedCostDetails: {},
        costDetails: {
          summary_input: 0.00006,
          summary_output: 0.00004,
          embedding_input: 0.000001,
          total: 0.000101,
        },
      },
      { id: nonApplicable.id, state: "not_applicable", embedding: [] },
    ]);
    expect(staged.get(applicable.id)?.state).toBe("complete");
    const completed = structuredClone(mocks.write.mock.calls[0][0]);
    await processTopicEmbeddingBatch(batch(applicable, nonApplicable));
    expect(mocks.embed).toHaveBeenCalledOnce();
    expect(mocks.write).toHaveBeenCalledTimes(2);
    expect(mocks.write.mock.calls[1][0]).toEqual(completed);
    expect(staged.size).toBe(2);
  });

  it("persists the canonical Redis result when embedding attempts overlap", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime("2026-09-18T00:01:00.000Z");
    const row = summary();
    staged.set(row.id, row);
    let finishFirst!: (value: typeof embeddingResult) => void;
    let finishSecond!: (value: typeof embeddingResult) => void;
    mocks.embed
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishSecond = resolve;
          }),
      );
    const first = processTopicEmbeddingBatch(batch(row));
    const second = processTopicEmbeddingBatch(batch(row));
    await vi.waitFor(() => expect(mocks.embed).toHaveBeenCalledTimes(2));
    finishFirst(embeddingResult);
    await first;
    const accepted = staged.get(row.id);
    vi.setSystemTime("2026-09-18T00:02:00.000Z");
    finishSecond({ ...embeddingResult, embedding: Array(16).fill(0.5) });
    await second;
    expect(mocks.write.mock.calls.map(([rows]) => rows)).toEqual([
      [accepted],
      [accepted],
    ]);
  });

  it("reports expired payloads as unrecoverable instead of regenerating summaries", async () => {
    const error = await processTopicEmbeddingBatch(batch(summary())).catch(
      (error: unknown) => error,
    );
    expect(error).toBeInstanceOf(UnrecoverableError);
    expect(error).toMatchObject({
      message: expect.stringContaining("Start a new execution"),
    });
    expect(mocks.embed).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("persists completed rows before retrying a later provider failure", async () => {
    const rows = [summary("first"), summary("second")];
    for (const row of rows) staged.set(row.id, row);
    mocks.embed.mockResolvedValueOnce(embeddingResult);
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
    expect(staged.get("first")?.state).toBe("complete");
    expect(staged.get("second")?.state).toBe("summarized");
    await processTopicEmbeddingBatch(batch(...rows));
    expect(mocks.embed).toHaveBeenCalledTimes(3);
    expect(staged.get("second")?.state).toBe("complete");
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

  it("fences an embedding when its Redis payload disappears during the call", async () => {
    const row = summary();
    staged.set(row.id, row);
    mocks.embed.mockImplementation(async () => {
      staged.delete(row.id);
      return embeddingResult;
    });
    await expect(processTopicEmbeddingBatch(batch(row))).rejects.toThrow(
      UnrecoverableError,
    );
    expect(mocks.write).not.toHaveBeenCalled();
    expect(staged.size).toBe(0);
  });
});
