import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  TopicAssignment,
  TopicEmbeddingConfig,
  TopicExecution,
  TopicFacetVersion,
  TopicRun,
  TopicProcessBatchState,
  TopicSummary,
} from "@langfuse/shared/topics";
import type { TopicEmbeddingBatch } from "@langfuse/shared/topics/server";
import { topicProcessingConfigSchema } from "@langfuse/shared/topics";
import { topicProviderError } from "./provider-error";

const state = vi.hoisted(() => ({
  batches: new Map<string, TopicProcessBatchState>(),
  executions: new Map<string, TopicExecution>(),
  summaries: new Map<string, TopicSummary>(),
  staged: new Map<
    string,
    { summary: TopicSummary; embeddingConfig: TopicEmbeddingConfig }
  >(),
  embeddingBatches: new Map<string, TopicEmbeddingBatch>(),
  completedBatches: new Set<string>(),
  deferEmbeddings: false,
  runs: new Map<string, TopicRun>(),
  assignments: new Map<string, TopicAssignment>(),
  facets: new Map<string, TopicFacetVersion>(),
  events: [] as string[],
  progress: [] as number[][],
  visible: true,
  sourceUnavailable: false,
  sourceFailures: new Set<string>(),
  sourceSuffix: "",
  summarize: vi.fn(),
  embed: vi.fn(),
  name: vi.fn(),
  numeric: vi.fn(),
  increment: vi.fn(),
}));
vi.mock("@langfuse/shared/src/server", () => ({
  recordIncrement: (...args: unknown[]) => state.increment(...args),
  recordDistribution: vi.fn(),
}));
const facet: TopicFacetVersion = {
  id: "facet-version",
  projectId: "project",
  facetId: "facet",
  version: 1,
  prompt: "Describe the interaction intent.",
  createdAt: "2026-01-01T00:00:00.000Z",
};

vi.mock("@langfuse/shared/topics/server", () => ({
  isTopicsEnabled: () => true,
  TOPIC_EMBEDDING_EXPIRED_ERROR:
    "Topics summaries expired before embedding completed. Start a new execution to regenerate them.",
  stageTopicSummary: async (
    summary: TopicSummary,
    embeddingConfig: TopicEmbeddingConfig,
  ) => {
    const accepted = state.staged.get(summary.id);
    if (accepted) return accepted.summary;
    state.staged.set(summary.id, structuredClone({ summary, embeddingConfig }));
    return summary;
  },
  readStagedTopicSummaries: async (
    projectId: string,
    executionId: string,
    facetVersionId: string,
    traceIds: string[],
  ) =>
    [...state.staged.values()]
      .map((row) => row.summary)
      .filter(
        (row) =>
          row.projectId === projectId &&
          row.executionId === executionId &&
          row.facetVersionId === facetVersionId &&
          traceIds.includes(row.traceId),
      ),
  readStagedTopicSummary: async (_scope: unknown, ref: { summaryId: string }) =>
    state.staged.get(ref.summaryId) ?? null,
  updateStagedTopicSummary: async (
    _scope: unknown,
    ref: { summaryId: string },
    summary: TopicSummary,
  ) => {
    const row = state.staged.get(ref.summaryId);
    if (row) state.staged.set(ref.summaryId, { ...row, summary });
  },
  deleteStagedTopicSummary: async (
    _scope: unknown,
    ref: { summaryId: string },
  ) => {
    state.staged.delete(ref.summaryId);
  },
  enqueueTopicEmbeddingBatch: async (batch: TopicEmbeddingBatch) => {
    const key = `${batch.projectId}/${batch.executionId}/${batch.batchId}`;
    if (state.completedBatches.has(key)) return "complete";
    state.embeddingBatches.set(key, batch);
    if (state.deferEmbeddings) return "pending";
    await processTopicEmbeddingBatch(batch);
    state.completedBatches.add(key);
    return "complete";
  },
  loadTopicTranscript: async ({ traceId }: { traceId: string }) => {
    state.events.push(`load:${traceId}`);
    if (state.sourceUnavailable || state.sourceFailures.delete(traceId))
      throw new Error("Source trace unavailable");
    return {
      traceTimestamp: "2026-01-01T00:00:00.000Z",
      transcript: {
        inputHash: traceId + state.sourceSuffix,
        text: JSON.stringify([
          {
            source: "input",
            text: traceId + state.sourceSuffix,
          },
        ]),
        hasContent: true,
        coverage: {},
      },
    };
  },
  readTopicExecutionSummary: async (_project: string, id: string) => {
    const execution = state.executions.get(id);
    if (!execution) return null;
    const { traceErrors: _errors, ...result } = execution;
    const input = { ...result.input };
    if (input.operation === "process")
      Reflect.deleteProperty(input, "traceIds");
    return {
      ...result,
      input,
      facets: result.facets.map(({ summaryIds: _ids, ...facet }) => facet),
    };
  },
  writeTopicExecution: async (execution: TopicExecution) => {
    state.events.push("write-execution");
    state.progress.push(
      execution.facets.map((facet) => facet.summaryIds.length),
    );
    state.executions.set(execution.id, structuredClone(execution));
  },
  getTopicFacetVersion: async (_project: string, id: string) =>
    state.facets.get(id) ?? null,
  listTopicSummaries: async (
    projectId: string,
    filter: {
      ids?: string[];
      traceIds?: string[];
      facetId?: string;
      facetVersionId?: string;
    },
  ) =>
    [...state.summaries.values()].filter(
      (row) =>
        row.projectId === projectId &&
        (!filter.facetId || row.facetId === filter.facetId) &&
        (!filter.ids || filter.ids.includes(row.id)) &&
        (!filter.facetVersionId ||
          row.facetVersionId === filter.facetVersionId) &&
        (!filter.traceIds || filter.traceIds.includes(row.traceId)),
    ),
  readTopicSummaries: async (_project: string, ids: string[]) =>
    ids.flatMap((id) => state.summaries.get(id) ?? []),
  writeTopicSummaries: async (rows: TopicSummary[]) =>
    rows.forEach((row) => {
      state.events.push(`write-summary:${row.state}`);
      if (
        (state.summaries.get(row.id)?.resultVersion ?? 0) <= row.resultVersion
      )
        state.summaries.set(row.id, row);
    }),
  createTopicRun: async (
    input: Pick<TopicRun, "id" | "projectId" | "facetVersionId" | "config"> & {
      executionId: string;
    },
  ) => {
    if (state.runs.has(input.id)) return state.runs.get(input.id);
    const run: TopicRun = {
      ...input,
      summaryIds: [],
      runSequence: String(state.runs.size + 1),
      status: "pending",
      phase: "pending",
      publishedAt: null,
      startedAt: null,
      createdAt: new Date().toISOString(),
      finishedAt: null,
      metrics: {},
      error: null,
      topics: [],
    };
    state.runs.set(run.id, run);
    return run;
  },
  getPublishedTopicRun: async (_project: string, facetId: string) =>
    [...state.runs.values()]
      .filter(
        (run) =>
          run.publishedAt &&
          state.facets.get(run.facetVersionId)?.facetId === facetId,
      )
      .at(-1) ?? null,
  getPublishedTopicRunForExecution: async (
    _project: string,
    executionId: string,
    facetVersionId: string,
  ) =>
    [...state.runs.values()]
      .filter(
        (run) =>
          run.publishedAt &&
          run.config.executionId === executionId &&
          run.facetVersionId === facetVersionId,
      )
      .at(-1) ?? null,
  getTopicClusteringSummaryIds: async (
    _project: string,
    facetId: string,
    facetVersionId: string,
    embeddingConfig: TopicEmbeddingConfig,
  ) => {
    const latest = new Map<string, TopicSummary>();
    for (const row of state.summaries.values()) {
      if (row.facetId !== facetId || row.facetVersionId !== facetVersionId)
        continue;
      const prior = latest.get(row.traceId);
      if (!prior || BigInt(row.revision) >= BigInt(prior.revision))
        latest.set(row.traceId, row);
    }
    return [...latest.values()]
      .filter(
        (row) =>
          row.state === "complete" &&
          row.embeddingModel === embeddingConfig.embeddingModel &&
          row.embedding.length === embeddingConfig.embeddingDimensions,
      )
      .sort((a, b) =>
        a.traceId < b.traceId ? -1 : a.traceId > b.traceId ? 1 : 0,
      )
      .map((row) => row.id);
  },
  getTopicRun: async (_project: string, id: string) =>
    state.runs.get(id) ?? null,
  saveTopicRun: async (run: TopicRun) => {
    state.events.push(run.publishedAt ? "publish" : run.phase);
    run.summaryIds = [...state.assignments.values()]
      .filter((row) => row.runId === run.id && row.origin === "initial")
      .map((row) => row.summaryId);
    state.runs.set(run.id, structuredClone(run));
    return structuredClone(run);
  },
  writeTopicAssignments: async (rows: TopicAssignment[]) => {
    state.events.push("write-assignments");
    rows.forEach((row) => state.assignments.set(row.id, row));
  },
  readTopicAssignments: async (
    _project: string,
    ids: string[],
    runId: string,
  ) => {
    state.events.push("read-assignments");
    if (!state.visible) return [];
    const latest = new Map<string, TopicAssignment>();
    const sorted = [...state.assignments.values()].sort(
      (a, b) =>
        a.assignedAt.localeCompare(b.assignedAt) || a.id.localeCompare(b.id),
    );
    for (const row of sorted)
      if (row.runId === runId && ids.includes(row.summaryId))
        latest.set(row.summaryId, row);
    return [...latest.values()];
  },
}));
vi.mock("./models", () => ({
  TOPICS_SUMMARY_PROMPT_VERSION: "3",
  TOPICS_NAMING_MODEL: "gpt-5.6-luna",
  summarizeTopicTrace: (...args: unknown[]) => state.summarize(...args),
  embedTopicSummary: (...args: unknown[]) => state.embed(...args),
  nameTopicGroup: (...args: unknown[]) => state.name(...args),
}));
vi.mock("./numeric", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./numeric")>()),
  TOPICS_NUMERIC_VERSION: "test-current",
  runTopicClustering: (...args: unknown[]) => state.numeric(...args),
}));

import { processTopicsExecution as processTopicsExecutionAttempt } from "./processTopicsExecution";
import { processTopicEmbeddingBatch } from "./processTopicEmbeddingBatch";

async function processTopicsExecution(
  scope: Parameters<typeof processTopicsExecutionAttempt>[0],
) {
  const selected = state.executions.get(scope.executionId)!;
  const traceIds =
    selected.input.operation === "process"
      ? selected.input.traceIds
      : undefined;
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await processTopicsExecutionAttempt({
      ...scope,
      traceIds,
      batchId: "batch-0",
      batchState: state.batches.get(scope.executionId),
      saveBatchState: async (value) => {
        state.batches.set(scope.executionId, structuredClone(value));
        state.executions.set(
          scope.executionId,
          structuredClone(value.execution),
        );
      },
    });
    if (!result || state.deferEmbeddings) return result;
  }
  throw new Error(
    "Topics batch did not finish after embedding acknowledgements.",
  );
}

function execution<T extends "process" | "update" = "process">(
  id: string,
  count: number,
  operation: T = "process" as T,
  facets = [facet],
  embeddingDimensions = 16,
): TopicExecution & {
  input: Extract<TopicExecution["input"], { operation: T }>;
} {
  facets.forEach((selected) => state.facets.set(selected.id, selected));
  const input = {
    projectId: "project",
    requestId: id,
    facetVersionIds: facets.map((selected) => selected.id),
    exploratory: false,
    processingConfig: topicProcessingConfigSchema.parse({}),
    embeddingConfig: {
      embeddingModel: "text-embedding-3-small" as const,
      embeddingDimensions,
    },
    traceIds: Array.from({ length: count }, (_, i) => `trace${i}`),
  };
  return {
    id,
    projectId: "project",
    revision: String(state.executions.size + 1),
    input:
      operation === "process"
        ? {
            projectId: input.projectId,
            requestId: id,
            facetVersionIds: input.facetVersionIds,
            operation,
            embeddingConfig: input.embeddingConfig,
            processingConfig: input.processingConfig,
            traceIds: input.traceIds,
          }
        : {
            projectId: input.projectId,
            requestId: id,
            facetVersionIds: input.facetVersionIds,
            operation,
            embeddingConfig: input.embeddingConfig,
            exploratory: false,
          },
    status: "queued",
    phase: "queued",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    facets: facets.map((selected) => ({
      facetVersionId: selected.id,
      outcome: "pending",
      summaryIds: [],
      runId:
        operation === "process"
          ? ([...state.runs.values()]
              .filter(
                (run) =>
                  run.publishedAt &&
                  run.facetVersionId === selected.id &&
                  run.config.dimensions === embeddingDimensions,
              )
              .at(-1)?.id ?? null)
          : null,
      error: null,
      counts: {
        requested: count,
        complete: 0,
        nonApplicable: 0,
        insufficientInput: 0,
        failed: 0,
        assigned: 0,
        outlier: 0,
      },
    })),
    traceErrors: [],
    error: null,
  } as TopicExecution & {
    input: Extract<TopicExecution["input"], { operation: T }>;
  };
}

async function processSelection(
  id: string,
  count: number,
  traceIds?: string[],
) {
  const pending = execution(id, count);
  if (traceIds) pending.input.traceIds = traceIds;
  state.executions.set(id, pending);
  await processTopicsExecution({ projectId: "project", executionId: id });
}

async function updateSelection(id: string) {
  state.executions.set(id, execution(id, 0, "update"));
  await processTopicsExecution({ projectId: "project", executionId: id });
}

beforeEach(() => {
  state.increment.mockClear();
  state.batches.clear();
  state.executions.clear();
  state.summaries.clear();
  state.staged.clear();
  state.embeddingBatches.clear();
  state.completedBatches.clear();
  state.deferEmbeddings = false;
  state.runs.clear();
  state.assignments.clear();
  state.facets.clear();
  state.events.length = 0;
  state.progress.length = 0;
  state.visible = true;
  state.sourceUnavailable = false;
  state.sourceFailures.clear();
  state.sourceSuffix = "";
  state.summarize
    .mockReset()
    .mockImplementation(async (_facet, text: string) => {
      const block = JSON.parse(text).find(
        (entry: { source: string }) => entry.source === "input",
      );
      return {
        output: {
          status: "applicable",
          summary: block.text.replace(state.sourceSuffix, ""),
        },
        inputTokens: 50,
        outputTokens: 20,
        costUsd: 0.00002,
      };
    });
  state.embed
    .mockReset()
    .mockImplementation(async (summary: string, dimensions: number) => {
      const i = Number(summary.replace("trace", ""));
      const embedding = Array.from({ length: dimensions }, () => 0);
      if (i === 101) embedding[2] = 1;
      else {
        embedding[i < 50 || i === 100 ? 0 : 1] = 1;
        embedding[3] = Math.sin(i) * 0.03;
      }
      return { embedding, inputTokens: 10, costUsd: 0.000001 };
    });
  state.numeric.mockReset().mockImplementation(async (vectors: number[][]) => ({
    status: "complete",
    labels: vectors.map((vector) =>
      vector[0] > 0.5 ? 0 : vector[1] > 0.5 ? 1 : -1,
    ),
    coordinates: vectors.map((vector) => vector.slice(0, 2)),
  }));
  state.name
    .mockReset()
    .mockImplementation(
      async (group: { id: string; members: { id: string }[] }) => ({
        output: {
          name: `Topic ${group.id.slice(0, 8)}`,
          description: "Observed member interactions.",
          evidenceSummaryIds: [group.members[0].id],
        },
        inputTokens: 50,
        outputTokens: 20,
        costUsd: 0.00002,
      }),
    );
});

describe("Topics execution", () => {
  it("processes a bounded batch and records awaiting assignments without a topic map", async () => {
    await processSelection("first", 10);
    expect(state.executions.get("first")?.status).toBe("completed");
    expect(state.executions.get("first")?.facets[0].outcome).toBe(
      "awaiting_topics",
    );
    expect(state.summaries.size).toBe(10);
    expect(state.assignments.size).toBe(10);
    expect(
      [...state.assignments.values()].every(
        (row) => row.outcome === "awaiting_topics" && row.runId === null,
      ),
    ).toBe(true);
    expect(state.numeric).not.toHaveBeenCalled();
    expect(state.events).not.toContain("write-execution");
    await processTopicsExecution({
      projectId: "project",
      executionId: "first",
    });
    expect(state.summarize).toHaveBeenCalledTimes(10);
  });

  it("records batch membership even when all paid summaries are reused", async () => {
    await processSelection("first", 4);
    await processSelection("second", 4);
    expect(state.summarize).toHaveBeenCalledTimes(4);
    expect(state.embed).toHaveBeenCalledTimes(4);
    expect(state.summaries.size).toBe(4);
    expect(
      [...state.assignments.values()].filter(
        (row) => row.executionId === "second",
      ),
    ).toHaveLength(4);
  });

  it("shares one transcript per trace across facets", async () => {
    const issues = { ...facet, id: "issues-version", facetId: "issues" };
    state.executions.set(
      "multi",
      execution("multi", 3, "process", [facet, issues]),
    );
    await processTopicsExecution({
      projectId: "project",
      executionId: "multi",
    });
    expect(
      state.events.filter((event) => event.startsWith("load:")),
    ).toHaveLength(3);
    expect(state.summarize).toHaveBeenCalledTimes(6);
    expect(state.summaries.size).toBe(6);
  });

  it("resumes accepted references after an embedding wait without loading source traces", async () => {
    state.deferEmbeddings = true;
    await processSelection("waiting", 3);
    expect(state.batches.get("waiting")?.summarized).toBe(true);
    expect(state.executions.get("waiting")?.phase).toBe("embedding");
    for (const [key, batch] of state.embeddingBatches) {
      await processTopicEmbeddingBatch(batch);
      state.completedBatches.add(key);
    }
    state.sourceUnavailable = true;
    state.deferEmbeddings = false;
    await processTopicsExecution({
      projectId: "project",
      executionId: "waiting",
    });
    expect(state.executions.get("waiting")?.status).toBe("completed");
    expect(state.summarize).toHaveBeenCalledTimes(3);
    expect(
      state.events.filter((event) => event.startsWith("load:")),
    ).toHaveLength(3);
  });

  it("does not regenerate paid summaries after their staged payload expires", async () => {
    state.deferEmbeddings = true;
    await processSelection("expired", 3);
    state.staged.clear();
    state.deferEmbeddings = false;
    await processTopicsExecution({
      projectId: "project",
      executionId: "expired",
    });
    expect(state.executions.get("expired")?.status).toBe("failed");
    expect(state.executions.get("expired")?.error).toContain("expired");
    expect(state.summarize).toHaveBeenCalledTimes(3);
  });

  it("preserves partially accepted summaries after a provider interruption", async () => {
    const original = state.summarize.getMockImplementation()!;
    state.summarize
      .mockImplementationOnce(original)
      .mockRejectedValueOnce(topicProviderError({ statusCode: 503 }));
    await processSelection("partial", 3);
    expect(state.batches.get("partial")?.summaries).toHaveLength(1);
    expect(state.executions.get("partial")?.status).toBe("failed");
    await processTopicsExecution({
      projectId: "project",
      executionId: "partial",
    });
    expect(state.executions.get("partial")?.status).toBe("completed");
    expect(state.summarize).toHaveBeenCalledTimes(4);
    expect(state.summaries.size).toBe(3);
  });

  it("pins the execution map while embeddings are pending", async () => {
    await processSelection("source", 100);
    await updateSelection("first-map");
    const first = [...state.runs.values()].at(-1)!;
    state.deferEmbeddings = true;
    await processSelection("incoming", 1, ["trace100"]);
    await updateSelection("second-map");
    for (const [key, batch] of state.embeddingBatches) {
      if (!state.completedBatches.has(key))
        await processTopicEmbeddingBatch(batch);
      state.completedBatches.add(key);
    }
    state.deferEmbeddings = false;
    await processTopicsExecution({
      projectId: "project",
      executionId: "incoming",
    });
    expect(
      [...state.assignments.values()].find(
        (row) => row.executionId === "incoming",
      )?.runId,
    ).toBe(first.id);
  });

  it("reuses summary inference when embedding dimensions change", async () => {
    await processSelection("source", 4);
    state.executions.set(
      "dimensions",
      execution("dimensions", 4, "process", [facet], 32),
    );
    await processTopicsExecution({
      projectId: "project",
      executionId: "dimensions",
    });
    expect(state.summarize).toHaveBeenCalledTimes(4);
    expect(state.embed).toHaveBeenCalledTimes(8);
    expect(
      [...state.summaries.values()].filter(
        (row) => row.embedding.length === 32,
      ),
    ).toHaveLength(4);
  });

  it("records source failures while processing the remaining traces", async () => {
    state.sourceFailures.add("trace0");
    await processSelection("source-failure", 3);
    expect(state.executions.get("source-failure")?.status).toBe(
      "completed_with_errors",
    );
    expect(
      state.executions.get("source-failure")?.facets[0].counts,
    ).toMatchObject({ complete: 2, failed: 1 });
    expect(state.summarize).toHaveBeenCalledTimes(2);
  });

  it("updates from stored summaries without loading traces or repeating paid extraction", async () => {
    await processSelection("source", 100);
    state.sourceUnavailable = true;
    await updateSelection("map");
    expect(state.executions.get("map")?.status).toBe("completed");
    expect(state.numeric).toHaveBeenCalledTimes(1);
    expect(state.summarize).toHaveBeenCalledTimes(100);
    expect(state.embed).toHaveBeenCalledTimes(100);
    expect([...state.runs.values()][0].summaryIds).toHaveLength(100);
    expect(
      [...state.assignments.values()]
        .filter((row) => row.executionId === "map")
        .every((row) => row.coordinates?.length === 2),
    ).toBe(true);
  });

  it("restarts a failed update with fresh membership and naming while preserving the published map", async () => {
    await processSelection("source", 100);
    await updateSelection("published");
    const published = [...state.runs.values()].at(-1)!;
    const naming = state.name.getMockImplementation()!;
    state.name
      .mockImplementationOnce(naming)
      .mockRejectedValueOnce(new Error("Naming unavailable"));
    await updateSelection("retry");
    const failed = [...state.runs.values()].at(-1)!;
    expect(failed.status).toBe("failed");
    expect(failed.topics).toHaveLength(1);
    expect(state.runs.get(published.id)?.publishedAt).toBeTruthy();
    await processSelection("additional", 1, ["trace100"]);
    await processTopicsExecution({
      projectId: "project",
      executionId: "retry",
    });
    const retried = [...state.runs.values()].at(-1)!;
    expect(retried.id).not.toBe(failed.id);
    expect(retried.publishedAt).toBeTruthy();
    expect(retried.summaryIds).toHaveLength(101);
    expect(state.numeric).toHaveBeenCalledTimes(3);
    expect(state.name).toHaveBeenCalledTimes(6);
  });

  it("recognizes publication after a lost progress acknowledgement", async () => {
    await processSelection("source", 100);
    await updateSelection("published");
    const interrupted = state.executions.get("published")!;
    interrupted.status = "running";
    interrupted.facets[0].outcome = "pending";
    interrupted.facets[0].runId = null;
    interrupted.facets[0].counts.assigned = 0;
    await processTopicsExecution({
      projectId: "project",
      executionId: "published",
    });
    expect(state.executions.get("published")?.facets[0].counts.assigned).toBe(
      100,
    );
    expect(state.numeric).toHaveBeenCalledTimes(1);
    expect(state.name).toHaveBeenCalledTimes(2);
    expect(state.runs.size).toBe(1);
  });

  it("keeps stable topic identities across completed updates", async () => {
    await processSelection("source", 100);
    await updateSelection("first");
    const first = [...state.runs.values()].at(-1)!;
    await updateSelection("second");
    const second = [...state.runs.values()].at(-1)!;
    expect(second.topics.map((topic) => topic.topicId).sort()).toEqual(
      first.topics.map((topic) => topic.topicId).sort(),
    );
  });

  it("records a short cohort without publishing an empty replacement", async () => {
    await processSelection("short", 3);
    await updateSelection("short-map");
    expect(state.executions.get("short-map")?.facets[0]).toMatchObject({
      outcome: "insufficient_data",
      counts: { requested: 3 },
    });
    expect([...state.runs.values()][0]).toMatchObject({
      status: "completed",
      publishedAt: null,
    });
    expect(state.numeric).not.toHaveBeenCalled();
  });

  it("defers publication when assignments are not visible", async () => {
    await processSelection("source", 100);
    state.visible = false;
    await updateSelection("hidden");
    expect([...state.runs.values()][0].publishedAt).toBeNull();
    state.visible = true;
    await processTopicsExecution({
      projectId: "project",
      executionId: "hidden",
    });
    expect([...state.runs.values()].at(-1)?.publishedAt).toBeTruthy();
    expect(state.numeric).toHaveBeenCalledTimes(2);
  });
});
