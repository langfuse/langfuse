import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnrecoverableError } from "bullmq";
import {
  topicSourceKey,
  type TopicEmbeddingConfig,
  type TopicSummary,
} from "@langfuse/shared/topics";
import type { TopicEmbeddingBatch } from "@langfuse/shared/topics/server";

const mocks = vi.hoisted(() => ({
  write: vi.fn(),
  staged: vi.fn(),
  update: vi.fn(),
  embed: vi.fn(),
  pause: vi.fn(),
  embeddingModel: "eu.cohere.embed-v4:0",
}));
vi.mock("@langfuse/shared/topics/server", () => ({
  pauseTopicsModels: mocks.pause,
  writeTopicSummaries: mocks.write,
  readStagedTopicSummary: mocks.staged,
  updateStagedTopicSummary: mocks.update,
  getTopicsModels: async () => ({
    projectId: "project",
    enabled: true,
    embedding: {
      slot: "embedding",
      provider: "bedrock",
      adapter: "bedrock",
      model: mocks.embeddingModel,
      connection: { secretKey: "encrypted" },
      dimensions: 256,
    },
  }),
  TOPIC_EMBEDDING_EXPIRED_ERROR:
    "Topics staged results expired before processing completed. Start a new execution with stored-summary reuse to recover persisted results.",
}));
vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const { isInternalEvalEnvironment } =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    isInternalEvalEnvironment,
    logger: { error: vi.fn() },
    recordIncrement: vi.fn(),
    recordDistribution: vi.fn(),
  };
});
vi.mock("./models", () => ({
  embedTopicSummaries: mocks.embed,
}));

import { processTopicEmbeddingBatch } from "./processTopicEmbeddingBatch";
import { TopicsProviderUnavailable } from "./provider-error";

const embeddingConfig: TopicEmbeddingConfig = {
  embeddingModel: "eu.cohere.embed-v4:0",
  embeddingDimensions: 256,
};
const summary = (id = "summary"): TopicSummary => ({
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
    facetId: row.facetId,
    facetVersion: row.facetVersion,
    traceId: row.traceId,
  })),
});
const embeddingUsage = {
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
    const row = staged.get(
      topicSourceKey({ ..._batch, ...ref, sessionId: null }),
    );
    return row ? { summary: row, embeddingConfig } : null;
  });
  mocks.update.mockImplementation(async (_batch, ref, row) => {
    const existing = staged.get(
      topicSourceKey({ ..._batch, ...ref, sessionId: null }),
    );
    if (!existing) return null;
    if (existing.state !== "summarized") return existing;
    staged.set(topicSourceKey({ ..._batch, ...ref, sessionId: null }), row);
    return row;
  });
  mocks.embed.mockImplementation(async (_model, summaries: string[]) => ({
    ...embeddingUsage,
    embeddings: summaries.map(() => Array(256).fill(0.25)),
  }));
});

describe("Topics embedding handoff", () => {
  it.each(["summarized", "complete"] as const)(
    "skips internal staged summaries in a mixed batch (%s)",
    async (state) => {
      const row: TopicSummary = {
        ...summary(),
        state,
        environment: "langfuse-topics",
        embedding: state === "complete" ? Array(256).fill(0.25) : [],
      };
      const allowed = summary("allowed");
      staged.set(topicSourceKey(row), row);
      staged.set(topicSourceKey(allowed), allowed);

      await processTopicEmbeddingBatch(batch(row, allowed));

      expect(mocks.embed).toHaveBeenCalledExactlyOnceWith(
        expect.anything(),
        [allowed.summary],
        256,
      );
      expect(mocks.update).toHaveBeenCalledTimes(1);
      expect(mocks.write).toHaveBeenCalledExactlyOnceWith([
        expect.objectContaining({
          traceId: allowed.traceId,
          state: "complete",
        }),
      ]);
    },
  );

  it("retries combined results from Redis after a failed ClickHouse write", async () => {
    const applicable = summary();
    const nonApplicable: TopicSummary = {
      ...summary("empty"),
      state: "not_applicable",
      summary: "",
    };
    for (const row of [applicable, nonApplicable])
      staged.set(topicSourceKey(row), row);
    mocks.write.mockRejectedValueOnce(new Error("ClickHouse unavailable"));
    await expect(
      processTopicEmbeddingBatch(batch(applicable, nonApplicable)),
    ).rejects.toThrow("ClickHouse unavailable");
    expect(mocks.write.mock.calls[0][0]).toMatchObject([
      {
        traceId: applicable.traceId,
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
      {
        traceId: nonApplicable.traceId,
        state: "not_applicable",
        embedding: [],
      },
    ]);
    expect(staged.get(topicSourceKey(applicable))?.state).toBe("complete");
    const completed = structuredClone(mocks.write.mock.calls[0][0]);
    await processTopicEmbeddingBatch(batch(applicable, nonApplicable));
    expect(mocks.embed).toHaveBeenCalledOnce();
    expect(mocks.write).toHaveBeenCalledTimes(2);
    expect(mocks.write.mock.calls[1][0]).toEqual(completed);
    expect(staged.size).toBe(2);
  });

  it("persists the canonical result returned by Redis", async () => {
    const row = summary();
    staged.set(topicSourceKey(row), row);
    const accepted: TopicSummary = {
      ...row,
      state: "complete",
      embedding: Array(256).fill(0.5),
      processedAt: "2026-09-18T00:01:00.000Z",
    };
    mocks.update.mockResolvedValueOnce(accepted);
    await processTopicEmbeddingBatch(batch(row));
    expect(mocks.write).toHaveBeenCalledExactlyOnceWith([accepted]);
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

  it("embeds each trace's facets in one call and keeps finished traces when another fails", async () => {
    const intent = summary("first");
    const outcome: TopicSummary = {
      ...intent,
      facetId: "outcome",
      summary: "An outcome of first.",
    };
    const other = summary("second");
    for (const row of [intent, outcome, other])
      staged.set(topicSourceKey(row), row);
    const failure = new TopicsProviderUnavailable(
      "Topics provider call failed (HTTP 429).",
      "rate_limit",
    );
    mocks.embed.mockImplementation(async (_model, summaries: string[]) => {
      if (summaries.includes("A summary of second.")) throw failure;
      return {
        ...embeddingUsage,
        embeddings: summaries.map(() => Array(256).fill(0.25)),
      };
    });
    await expect(
      processTopicEmbeddingBatch(batch(intent, outcome, other)),
    ).rejects.toBe(failure);
    expect(mocks.embed).toHaveBeenCalledTimes(2);
    expect(mocks.embed.mock.calls.map((call) => call[1])).toContainEqual([
      "A summary of first.",
      "An outcome of first.",
    ]);
    // The finished trace is stored with the call's usage recorded once.
    expect(mocks.write.mock.calls[0][0]).toMatchObject([
      { facetId: "facet", state: "complete", usageDetails: { total: 38 } },
      { facetId: "outcome", state: "complete", usageDetails: { total: 30 } },
    ]);
    expect(staged.get(topicSourceKey(other))?.state).toBe("summarized");
  });

  it("stops on a permanent failure even when another trace failed retryably", async () => {
    const rows = [summary("first"), summary("second")];
    for (const row of rows) staged.set(topicSourceKey(row), row);
    mocks.embed.mockImplementation(async (_model, summaries: string[]) => {
      throw summaries.includes("A summary of first.")
        ? new TopicsProviderUnavailable("Rate limited.", "rate_limit")
        : new TopicsProviderUnavailable(
            "Check worker credentials.",
            "authentication",
          );
    });
    await expect(processTopicEmbeddingBatch(batch(...rows))).rejects.toThrow(
      UnrecoverableError,
    );
    expect(mocks.pause).toHaveBeenCalledOnce();
  });

  it("does not retry provider authentication failures", async () => {
    const row = summary();
    staged.set(topicSourceKey(row), row);
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
    expect(staged.get(topicSourceKey(row))?.state).toBe("summarized");
    expect(mocks.pause).toHaveBeenCalledExactlyOnceWith("project", {
      blockReason: "LLM_CONNECTION_AUTH_INVALID",
      blockMessage: expect.stringContaining("Check worker credentials."),
    });
  });

  it("does not pause Topics when the saved embedding model changed", async () => {
    const row = summary();
    staged.set(topicSourceKey(row), row);
    mocks.embeddingModel = "text-embedding-3-small";
    await expect(processTopicEmbeddingBatch(batch(row))).rejects.toThrow(
      UnrecoverableError,
    );
    mocks.embeddingModel = "eu.cohere.embed-v4:0";
    expect(mocks.embed).not.toHaveBeenCalled();
    expect(mocks.pause).not.toHaveBeenCalled();
  });

  it("fences an embedding when its Redis payload disappears during the call", async () => {
    const row = summary();
    staged.set(topicSourceKey(row), row);
    mocks.embed.mockImplementation(async () => {
      staged.delete(topicSourceKey(row));
      return { ...embeddingUsage, embeddings: [Array(256).fill(0.25)] };
    });
    await expect(processTopicEmbeddingBatch(batch(row))).rejects.toThrow(
      UnrecoverableError,
    );
    expect(mocks.write).not.toHaveBeenCalled();
    expect(staged.size).toBe(0);
  });
});
