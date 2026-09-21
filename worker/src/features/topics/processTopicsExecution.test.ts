import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  TopicAssignment,
  TopicEmbeddingConfig,
  TopicExecution,
  TopicFacetVersion,
  TopicRun,
  TopicSummary,
} from "@langfuse/shared/topics";
import type { TopicEmbeddingBatch } from "@langfuse/shared/topics/server";
import { topicProcessingConfigSchema } from "@langfuse/shared/topics";
import { topicProviderError } from "./provider-error";

const state = vi.hoisted(() => ({
  artifacts: new Map<string, unknown>(),
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
  readTopicExecution: async (_project: string, id: string) =>
    state.executions.get(id) ?? null,
  writeTopicExecution: async (execution: TopicExecution) => {
    state.progress.push(
      execution.facets.map((facet) => facet.summaryIds.length),
    );
    state.executions.set(execution.id, structuredClone(execution));
  },
  readTopicArtifact: async (_project: string, execution: string, key: string) =>
    state.artifacts.get(`${execution}/${key}`) ?? null,
  writeTopicArtifact: async (
    _project: string,
    execution: string,
    key: string,
    value: unknown,
  ) => {
    const id = `${execution}/${key}`;
    if (
      state.artifacts.has(id) &&
      JSON.stringify(state.artifacts.get(id)) !== JSON.stringify(value)
    )
      throw new Error("Immutable artifact changed");
    state.artifacts.set(id, structuredClone(value));
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
      manifestPath: string;
    },
  ) => {
    if (state.runs.has(input.id)) return state.runs.get(input.id);
    const cohort = state.artifacts.get(
      `${input.config.executionId}/${input.manifestPath}`,
    ) as { summaryIds: string[] };
    const run: TopicRun = {
      ...input,
      summaryIds: cohort.summaryIds,
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
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await processTopicsExecutionAttempt(scope);
    if (!result || state.deferEmbeddings) return result;
  }
  throw new Error(
    "Topics execution did not finish after embedding acknowledgements.",
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
      runId: null,
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
  state.artifacts.clear();
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
  const issues = { ...facet, id: "issues-version", facetId: "issues" };

  it("processes supplied traces without clustering and waits when no topics exist", async () => {
    const pending = execution("process-only", 3);
    state.executions.set(pending.id, pending);
    await processTopicsExecution({
      projectId: "project",
      executionId: pending.id,
    });
    expect(state.executions.get(pending.id)?.facets[0]).toMatchObject({
      outcome: "awaiting_topics",
      counts: { complete: 3, outlier: 0 },
    });
    expect(state.numeric).not.toHaveBeenCalled();
    expect(state.name).not.toHaveBeenCalled();
    expect(state.runs.size).toBe(0);
    expect(state.assignments.size).toBe(0);
  });

  it("updates topics directly from compatible summaries without loading traces or embedding", async () => {
    const pending = execution("process-source", 100);
    state.executions.set(pending.id, pending);
    await processTopicsExecution({
      projectId: "project",
      executionId: pending.id,
    });
    state.sourceUnavailable = true;
    state.events.length = 0;
    state.summarize.mockClear();
    state.embed.mockClear();
    const update = execution("update-only", 0, "update");
    state.executions.set(update.id, update);
    await processTopicsExecution({
      projectId: "project",
      executionId: update.id,
    });
    expect(state.executions.get(update.id)?.facets[0]).toMatchObject({
      outcome: "published",
      counts: { requested: 100, complete: 100 },
    });
    expect(state.numeric).toHaveBeenCalledTimes(1);
    expect(state.summarize).not.toHaveBeenCalled();
    expect(state.embed).not.toHaveBeenCalled();
    expect(state.events.filter((event) => event.startsWith("load:"))).toEqual(
      [],
    );
  });

  it("keeps completed selection counts while replaying frozen batches", async () => {
    const facets = [
      facet,
      issues,
      { ...facet, id: "outcome-version", facetId: "outcome" },
    ];
    const pending = execution("frozen-progress", 200, "process", facets);
    state.executions.set(pending.id, pending);
    state.deferEmbeddings = true;
    const scope = { projectId: "project", executionId: pending.id };
    await processTopicsExecution(scope);
    for (const [key, batch] of state.embeddingBatches) {
      await processTopicEmbeddingBatch(batch);
      state.completedBatches.add(key);
    }
    state.progress.length = 0;

    await processTopicsExecution(scope);

    expect(state.executions.get(pending.id)?.status).toBe("completed");
    expect(state.progress.length).toBeGreaterThan(0);
    expect(
      state.progress.every((counts) => counts.every((count) => count === 200)),
    ).toBe(true);
  });

  it("releases the coordinator while embeddings run and resumes without reloading traces", async () => {
    const pending = execution("queued-embeddings", 100);
    state.executions.set(pending.id, pending);
    state.deferEmbeddings = true;
    const scope = { projectId: "project", executionId: pending.id };

    expect(await processTopicsExecution(scope)).toEqual({
      pendingEmbeddingBatchIds: [expect.any(String)],
    });
    expect(state.executions.get(pending.id)).toMatchObject({
      status: "running",
      phase: "embedding",
    });
    expect(state.staged.size).toBe(100);
    expect(state.summaries.size).toBe(0);
    expect(state.numeric).not.toHaveBeenCalled();

    for (const [key, batch] of state.embeddingBatches) {
      await processTopicEmbeddingBatch(batch);
      state.completedBatches.add(key);
    }
    state.sourceUnavailable = true;
    await processTopicsExecution(scope);
    expect(state.executions.get(pending.id)?.status).toBe("completed");
    expect(state.summarize).toHaveBeenCalledTimes(100);
    expect(state.embed).toHaveBeenCalledTimes(100);
    expect(
      state.events.filter((event) => event.startsWith("load:")),
    ).toHaveLength(100);
    expect(state.staged.size).toBe(0);
    expect(state.assignments.size).toBe(0);
    expect(state.executions.get(pending.id)?.facets[0].outcome).toBe(
      "awaiting_topics",
    );
  });

  it("marks an accepted batch failed when staged summaries expire", async () => {
    const pending = execution("expired-embeddings", 3);
    state.executions.set(pending.id, pending);
    state.deferEmbeddings = true;
    const scope = { projectId: "project", executionId: pending.id };
    expect(await processTopicsExecution(scope)).toEqual({
      pendingEmbeddingBatchIds: [expect.any(String)],
    });
    state.staged.clear();
    state.deferEmbeddings = false;
    await processTopicsExecution(scope);
    expect(state.executions.get(pending.id)?.status).toBe("failed");
    expect(state.executions.get(pending.id)?.error).toContain(
      "Start a new execution",
    );
    expect(state.summarize).toHaveBeenCalledTimes(3);
    expect(state.summaries.size).toBe(0);
  });

  it("preserves expiry accounting for a partial later batch after replaying completed batches", async () => {
    const pending = execution("expired-partial-batch", 102);
    state.executions.set(pending.id, pending);
    const scope = { projectId: "project", executionId: pending.id };
    const summarize = state.summarize.getMockImplementation()!;
    state.summarize.mockImplementation(async (...args) => {
      if (state.summarize.mock.calls.length === 102)
        throw topicProviderError({ statusCode: 503 });
      return summarize(...args);
    });

    await processTopicsExecution(scope);
    expect(state.executions.get(pending.id)?.status).toBe("failed");
    expect(state.summaries.size).toBe(100);
    expect(state.staged.size).toBe(1);
    expect(state.summarize).toHaveBeenCalledTimes(102);
    const [accepted] = state.staged.values();
    expect(state.executions.get(pending.id)?.facets[0].summaryIds).toContain(
      accepted.summary.id,
    );

    state.staged.clear();
    state.sourceSuffix = "changed";
    const sourceReads = state.events.filter((event) =>
      event.startsWith("load:"),
    ).length;
    await processTopicsExecution(scope);
    await processTopicsExecution(scope);

    expect(state.executions.get(pending.id)?.status).toBe("failed");
    expect(state.executions.get(pending.id)?.error).toContain(
      "Start a new execution",
    );
    expect(state.summarize).toHaveBeenCalledTimes(102);
    expect(
      state.events.filter((event) => event.startsWith("load:")),
    ).toHaveLength(sourceReads);
    expect(state.summaries.size).toBe(100);
  });

  it("keeps paid results in their domain tables and resumes accepted cluster labels", async () => {
    await processSelection("durable-source", 100);
    state.executions.set("durable", execution("durable", 0, "update"));
    const naming = state.name.getMockImplementation()!;
    state.name
      .mockImplementationOnce(naming)
      .mockRejectedValueOnce(new Error("Naming unavailable"));
    await processTopicsExecution({
      projectId: "project",
      executionId: "durable",
    });
    const run = [...state.runs.values()][0];
    expect(run.topics).toHaveLength(1);
    expect(run.topics[0].metadata).not.toHaveProperty("namingEvidence");
    expect(
      [...state.artifacts.keys()].some((key) =>
        /\/(summary|complete|call|embedding|evidence|continuity|assignments|no-topic)-/.test(
          key,
        ),
      ),
    ).toBe(false);
    state.sourceUnavailable = true;
    await processTopicsExecution({
      projectId: "project",
      executionId: "durable",
    });
    expect(state.name).toHaveBeenCalledTimes(3);
    expect(state.summarize).toHaveBeenCalledTimes(100);
    expect(state.executions.get("durable")?.status).toBe("completed");
    expect(
      [...state.assignments.values()].every(
        (row) => row.executionId === "durable" && row.coordinates?.length === 2,
      ),
    ).toBe(true);
  });

  it("accumulates processed batches and preserves topic identities across explicit updates", async () => {
    await processSelection("first", 60);
    await processSelection(
      "second",
      40,
      Array.from({ length: 40 }, (_, i) => `trace${60 + i}`),
    );
    expect(state.runs.size).toBe(0);
    await updateSelection("initial");
    const original = [...state.runs.values()][0];
    await updateSelection("updated");
    const updated = [...state.runs.values()][1];
    expect(updated.summaryIds).toHaveLength(100);
    expect(updated.topics.map((topic) => topic.topicId).sort()).toEqual(
      original.topics.map((topic) => topic.topicId).sort(),
    );
    expect(updated.topics[0].topicVersionId).not.toBe(
      original.topics[0].topicVersionId,
    );
    expect(state.summarize).toHaveBeenCalledTimes(100);
    expect(state.embed).toHaveBeenCalledTimes(100);
    expect(state.numeric).toHaveBeenCalledTimes(2);
  });

  it("clears a previous assignment when a facet becomes non-applicable", async () => {
    state.executions.set("clear-first", execution("clear-first", 100));
    await processTopicsExecution({
      projectId: "project",
      executionId: "clear-first",
    });
    await updateSelection("clear-map");
    const before = [...state.assignments.values()].find(
      (row) => row.traceId === "trace0",
    )!;
    expect(before.topicId).toBeTruthy();
    state.sourceSuffix = "changed";
    state.summarize.mockResolvedValueOnce({
      output: { status: "not_applicable", summary: "" },
      inputTokens: 10,
      outputTokens: 10,
      costUsd: 0,
    });
    state.executions.set(
      "clear-second",
      execution("clear-second", 1, "process"),
    );
    await processTopicsExecution({
      projectId: "project",
      executionId: "clear-second",
    });
    const cleared = [...state.assignments.values()].find(
      (row) => row.traceId === "trace0" && row.outcome === "not_applicable",
    );
    expect(cleared).toMatchObject({ topicId: null, topicVersionId: null });
    expect(state.assignments.get(before.id)).toEqual(before);
  });

  it("processes more than 1000 traces without losing summaries", async () => {
    const pending = execution("large", 1002);
    state.executions.set(pending.id, pending);
    await processTopicsExecution({
      projectId: "project",
      executionId: pending.id,
    });
    expect(state.executions.get(pending.id)?.status).toBe("completed");
    expect(state.executions.get(pending.id)?.facets[0].counts.complete).toBe(
      1002,
    );
    expect(state.summaries.size).toBe(1002);
    expect(state.assignments.size).toBe(0);
    expect(state.numeric).not.toHaveBeenCalled();
  });

  it("assigns only incoming summaries and waits for a compatible map after dimensions change", async () => {
    await processSelection("initial", 100);
    await updateSelection("map");
    await processSelection("incoming", 1, ["trace100"]);
    expect(state.executions.get("incoming")?.facets[0]).toMatchObject({
      outcome: "assigned",
      counts: { requested: 1, complete: 1, assigned: 1 },
    });
    expect(
      [...state.assignments.values()].filter(
        (row) => row.executionId === "incoming",
      ),
    ).toHaveLength(1);
    state.executions.set(
      "dimensions",
      execution("dimensions", 1, "process", [facet], 32),
    );
    await processTopicsExecution({
      projectId: "project",
      executionId: "dimensions",
    });
    expect(state.executions.get("dimensions")?.facets[0].outcome).toBe(
      "awaiting_topics",
    );
    expect(state.summarize).toHaveBeenCalledTimes(101);
    expect(state.embed).toHaveBeenCalledTimes(102);
    expect(state.numeric).toHaveBeenCalledTimes(1);
    // Update reads only already compatible vectors, not every old embedding.
    state.executions.set(
      "dimensions-map",
      execution("dimensions-map", 0, "update", [facet], 32),
    );
    await processTopicsExecution({
      projectId: "project",
      executionId: "dimensions-map",
    });
    expect(state.executions.get("dimensions-map")?.facets[0]).toMatchObject({
      outcome: "insufficient_data",
      counts: { requested: 1 },
    });
    expect(state.embed).toHaveBeenCalledTimes(102);
    const oldTopics = [...state.runs.values()][0].topics
      .map((topic) => topic.topicId)
      .sort();
    state.executions.set(
      "reembed-selected",
      execution("reembed-selected", 100, "process", [facet], 32),
    );
    await processTopicsExecution({
      projectId: "project",
      executionId: "reembed-selected",
    });
    state.executions.set(
      "compatible-map",
      execution("compatible-map", 0, "update", [facet], 32),
    );
    await processTopicsExecution({
      projectId: "project",
      executionId: "compatible-map",
    });
    expect(
      [...state.runs.values()]
        .at(-1)!
        .topics.map((topic) => topic.topicId)
        .sort(),
    ).toEqual(oldTopics);
    expect(state.summarize).toHaveBeenCalledTimes(101);
  });

  it("writes explicit outliers when an update finds no topics and serves that published map", async () => {
    await processSelection("source", 100);
    await updateSelection("first-map");
    state.numeric.mockResolvedValueOnce({
      status: "no_topics",
      labels: Array(100).fill(-1),
      coordinates: Array(100).fill([0, 0]),
    });
    await updateSelection("empty-map");
    const run = [...state.runs.values()].at(-1)!;
    expect(run.topics).toEqual([]);
    const rows = [...state.assignments.values()].filter(
      (row) => row.runId === run.id,
    );
    expect(rows).toHaveLength(100);
    expect(rows.every((row) => row.outcome === "outlier")).toBe(true);
    await processSelection("incoming", 1, ["trace100"]);
    expect(state.executions.get("incoming")?.facets[0]).toMatchObject({
      runId: run.id,
      outcome: "assigned",
      counts: { outlier: 1 },
    });
    expect(state.numeric).toHaveBeenCalledTimes(2);
  });

  it("keeps pending embeddings isolated when another execution changes dimensions", async () => {
    state.embed.mockRejectedValueOnce(topicProviderError({ statusCode: 503 }));
    state.executions.set(
      "pending-dimensions",
      execution("pending-dimensions", 1),
    );
    await processTopicsExecution({
      projectId: "project",
      executionId: "pending-dimensions",
    });
    expect(state.executions.get("pending-dimensions")?.status).toBe("failed");
    const originalId = [...state.staged.keys()][0];
    state.executions.set(
      "other-dimensions",
      execution("other-dimensions", 1, "process", [facet], 32),
    );
    await processTopicsExecution({
      projectId: "project",
      executionId: "other-dimensions",
    });
    const otherId =
      state.executions.get("other-dimensions")!.facets[0].summaryIds[0];
    expect(otherId).not.toBe(originalId);
    state.sourceUnavailable = true;
    await processTopicsExecution({
      projectId: "project",
      executionId: "pending-dimensions",
    });
    expect(state.summaries.get(originalId)?.embedding).toHaveLength(16);
    expect(state.summaries.get(otherId)?.embedding).toHaveLength(32);
    expect(state.summarize).toHaveBeenCalledTimes(2);
  });

  it("records cached source reversions as the current summary for subsequent updates", async () => {
    state.executions.set("snapshot-x", execution("snapshot-x", 1, "process"));
    await processTopicsExecution({
      projectId: "project",
      executionId: "snapshot-x",
    });
    state.sourceSuffix = "y";
    state.executions.set("snapshot-y", execution("snapshot-y", 1, "process"));
    await processTopicsExecution({
      projectId: "project",
      executionId: "snapshot-y",
    });
    state.sourceSuffix = "";
    state.executions.set(
      "snapshot-x-again",
      execution("snapshot-x-again", 1, "process"),
    );
    await processTopicsExecution({
      projectId: "project",
      executionId: "snapshot-x-again",
    });
    const restored = state.summaries.get(
      state.executions.get("snapshot-x-again")!.facets[0].summaryIds[0],
    )!;
    expect(restored.inputHash).toBe("trace0");
    expect(restored.revision).toBe("3");
    expect(state.summarize).toHaveBeenCalledTimes(2);
    const next = execution("snapshot-next", 1, "process");
    if (next.input.operation === "process") next.input.traceIds = ["trace1"];
    state.executions.set(next.id, next);
    await processTopicsExecution({
      projectId: "project",
      executionId: next.id,
    });
    await updateSelection("snapshot-map");
    expect(
      state.executions.get("snapshot-map")!.facets[0].summaryIds,
    ).toContain(restored.id);
  });

  it("shares one in-memory source per trace across facets even when source changes during processing", async () => {
    const pending = execution("shared-transcript", 2, "process", [
      facet,
      issues,
    ]);
    const summarize = state.summarize.getMockImplementation()!;
    state.summarize.mockImplementation(async (...args) => {
      const result = await summarize(...args);
      state.sourceSuffix += "changed";
      return result;
    });
    state.executions.set(pending.id, pending);

    await processTopicsExecution({
      projectId: "project",
      executionId: pending.id,
    });

    expect(state.executions.get(pending.id)?.status).toBe("completed");
    expect(state.events.filter((event) => event.startsWith("load:"))).toEqual([
      "load:trace0",
      "load:trace1",
    ]);
    expect(state.summarize).toHaveBeenCalledTimes(4);
    const calls = state.summarize.mock.calls;
    expect(calls.map((call) => JSON.parse(call[1])[0].text)).toEqual([
      "trace0",
      "trace0",
      "trace1changedchanged",
      "trace1changedchanged",
    ]);
    for (const traceId of ["trace0", "trace1"]) {
      const summaries = [...state.summaries.values()].filter(
        (row) => row.traceId === traceId,
      );
      expect(summaries).toHaveLength(2);
      expect(summaries[0].inputHash).toBe(summaries[1].inputHash);
    }
    const persisted = JSON.stringify([...state.artifacts.values()]);
    for (const call of calls)
      expect(persisted).not.toContain(JSON.stringify(call[1]));
  });

  it("shares a failed source read across facets and still processes the next trace", async () => {
    const pending = execution("shared-source-failure", 2, "process", [
      facet,
      issues,
    ]);
    state.sourceFailures.add("trace0");
    state.executions.set(pending.id, pending);

    await processTopicsExecution({
      projectId: "project",
      executionId: pending.id,
    });

    expect(state.events.filter((event) => event.startsWith("load:"))).toEqual([
      "load:trace0",
      "load:trace1",
    ]);
    expect(state.executions.get(pending.id)?.status).toBe(
      "completed_with_errors",
    );
    for (const progress of state.executions.get(pending.id)!.facets)
      expect(progress.counts).toMatchObject({ complete: 1, failed: 1 });
  });

  it.each([false, true])(
    "resumes accepted facets and checks missing facets against their input (changed: %s)",
    async (changed) => {
      const pending = execution("shared-resume", 1, "process", [facet, issues]);
      const summarize = state.summarize.getMockImplementation()!;
      state.summarize
        .mockImplementationOnce(summarize)
        .mockRejectedValueOnce(topicProviderError({ statusCode: 503 }));
      state.executions.set(pending.id, pending);
      await processTopicsExecution({
        projectId: "project",
        executionId: pending.id,
      });
      expect(state.executions.get(pending.id)?.status).toBe("failed");

      state.sourceSuffix = changed ? "changed" : "";
      await processTopicsExecution({
        projectId: "project",
        executionId: pending.id,
      });

      const result = state.executions.get(pending.id)!;
      expect(result.status).toBe(
        changed ? "completed_with_errors" : "completed",
      );
      expect(result.facets[0].counts.complete).toBe(1);
      expect(result.facets[1].counts).toMatchObject({
        complete: changed ? 0 : 1,
        failed: changed ? 1 : 0,
      });
      if (changed)
        expect(result.traceErrors[0].error).toContain("Trace input changed");
      else expect(result.traceErrors).toEqual([]);
      expect(state.summarize).toHaveBeenCalledTimes(changed ? 2 : 3);
      expect([...state.summaries.values()].map((row) => row.inputHash)).toEqual(
        ["trace0", ...(changed ? [] : ["trace0"])],
      );
    },
  );

  it("records an oversized trace and continues processing the remaining cohort", async () => {
    const pending = execution("input-limit", 3, "process", [facet, issues]);
    state.summarize.mockRejectedValueOnce(
      new Error("The shared trace transcript exceeds its input limit."),
    );
    state.executions.set(pending.id, pending);
    await processTopicsExecution({
      projectId: "project",
      executionId: pending.id,
    });
    const result = state.executions.get(pending.id)!;
    expect(state.summarize).toHaveBeenCalledTimes(6);
    expect(result.status).toBe("completed_with_errors");
    expect(result.facets[0].counts).toMatchObject({ complete: 2, failed: 1 });
    expect(result.facets[1].counts).toMatchObject({ complete: 3, failed: 0 });
    expect(result.traceErrors).toEqual([
      {
        traceId: "trace0",
        error: "The shared trace transcript exceeds its input limit.",
      },
    ]);
  });

  it("fits repeated updates in canonical manifest order", async () => {
    const source = execution("source", 100);
    source.input.traceIds.reverse();
    state.executions.set(source.id, source);
    await processTopicsExecution({
      projectId: "project",
      executionId: source.id,
    });
    await updateSelection("first-map");
    await updateSelection("second-map");
    const [first, second] = [...state.runs.values()];
    expect(first.summaryIds).toEqual(second.summaryIds);
    expect(
      first.summaryIds.map((id) => state.summaries.get(id)!.traceId),
    ).toEqual([...source.input.traceIds].sort());
    expect(state.numeric.mock.calls[0][0]).toEqual(
      state.numeric.mock.calls[1][0],
    );
  });

  it("retries an update with its frozen population even after new summaries arrive", async () => {
    await processSelection("source", 100);
    state.numeric.mockRejectedValueOnce(
      new Error("Numerical stage interrupted"),
    );
    await updateSelection("update");
    const accepted = state.executions.get("update")!.facets[0].summaryIds;
    expect(state.executions.get("update")!.facets[0].outcome).toBe("failed");
    await processSelection("arrival", 1, ["trace100"]);
    await processTopicsExecution({
      projectId: "project",
      executionId: "update",
    });
    expect(state.executions.get("update")?.status).toBe("completed");
    expect(state.executions.get("update")?.facets[0].summaryIds).toEqual(
      accepted,
    );
    expect(state.numeric.mock.calls[0][0]).toEqual(
      state.numeric.mock.calls[1][0],
    );
    expect([...state.runs.values()][0].summaryIds).toHaveLength(100);
  });

  it("resumes an accepted summary without source data or another summary call", async () => {
    state.embed.mockRejectedValueOnce(topicProviderError({ statusCode: 503 }));
    state.executions.set("resume", execution("resume", 1));
    await processTopicsExecution({
      projectId: "project",
      executionId: "resume",
    });
    expect(state.executions.get("resume")?.status).toBe("failed");
    expect(state.summaries.size).toBe(0);
    const [saved] = [...state.staged.values()].map((row) => row.summary);
    expect(saved).toMatchObject({
      state: "summarized",
      resultVersion: 1,
      summary: "trace0",
      embedding: [],
    });
    state.sourceUnavailable = true;
    state.executions.get("resume")!.status = "queued";
    await processTopicsExecution({
      projectId: "project",
      executionId: "resume",
    });
    expect(state.executions.get("resume")?.status).toBe("completed");
    expect(state.executions.get("resume")?.facets[0].counts.complete).toBe(1);
    expect(state.summarize).toHaveBeenCalledTimes(1);
    expect(state.embed).toHaveBeenCalledTimes(2);
    expect(state.summaries.size).toBe(1);
    expect(state.summaries.get(saved.id)).toMatchObject({
      state: "complete",
      resultVersion: 2,
      summary: saved.summary,
    });
    expect(state.summaries.get(saved.id)?.embedding).toHaveLength(16);
    expect(
      state.events.filter((event) => event.startsWith("write-summary:")),
    ).toEqual(["write-summary:complete"]);
  });
  it("regenerates source input for a new execution and preserves earlier summaries", async () => {
    state.executions.set("first", execution("first", 1));
    await processTopicsExecution({
      projectId: "project",
      executionId: "first",
    });
    state.sourceSuffix = "changed";
    state.executions.set("changed", execution("changed", 1));
    await processTopicsExecution({
      projectId: "project",
      executionId: "changed",
    });
    expect(state.summarize).toHaveBeenCalledTimes(2);
    expect(state.summaries.size).toBe(2);
    expect(state.executions.get("changed")!.facets[0].summaryIds).not.toEqual(
      state.executions.get("first")!.facets[0].summaryIds,
    );
  });
  it("reuses summaries and embeddings after a rule filter changes but rejects stale prompt identities", async () => {
    const original = execution("original", 1);
    original.input.ruleId = "rule-original";
    original.input.traceSelection = {
      filter: [],
      from: new Date("2026-01-01T00:00:00Z"),
      to: new Date("2026-01-02T00:00:00Z"),
      limit: null,
      sampling: "latest",
      seed: "original",
      excludedTraceIds: [],
    };
    state.executions.set(original.id, original);
    await processTopicsExecution({
      projectId: "project",
      executionId: "original",
    });
    const firstIds = state.executions.get("original")!.facets[0].summaryIds;
    const cached = execution("cached", 1);
    cached.input.ruleId = "rule-changed";
    cached.input.traceSelection = {
      ...original.input.traceSelection,
      from: new Date("2025-01-01T00:00:00Z"),
      sampling: "random",
      seed: "changed",
    };
    state.executions.set(cached.id, cached);
    await processTopicsExecution({
      projectId: "project",
      executionId: "cached",
    });
    expect(state.executions.get("cached")!.facets[0].summaryIds).toEqual(
      firstIds,
    );
    expect(state.summarize).toHaveBeenCalledTimes(1);
    expect(state.embed).toHaveBeenCalledTimes(1);
    for (const row of state.summaries.values())
      row.invocationHash = "previous-prompt-version";
    state.executions.set("new-prompt", execution("new-prompt", 1));
    await processTopicsExecution({
      projectId: "project",
      executionId: "new-prompt",
    });
    expect(state.summarize).toHaveBeenCalledTimes(2);
    expect(
      state.executions.get("new-prompt")!.facets[0].summaryIds,
    ).not.toEqual(firstIds);
  });

  it("regenerates summaries when the run changes summary settings", async () => {
    state.executions.set(
      "settings-original",
      execution("settings-original", 1),
    );
    await processTopicsExecution({
      projectId: "project",
      executionId: "settings-original",
    });
    const changed = execution("settings-changed", 1);
    changed.input = {
      ...changed.input,
      processingConfig: topicProcessingConfigSchema.parse({
        maxOutputTokens: 64,
      }),
    };
    state.executions.set(changed.id, changed);
    await processTopicsExecution({
      projectId: "project",
      executionId: changed.id,
    });
    expect(state.summarize).toHaveBeenCalledTimes(2);
    expect(state.summarize.mock.calls[1][2]).toEqual(
      changed.input.processingConfig,
    );
  });

  it("re-embeds changed dimensions and reuses summaries when reverting a prompt", async () => {
    state.executions.set(
      "dimensions-original",
      execution("dimensions-original", 1),
    );
    await processTopicsExecution({
      projectId: "project",
      executionId: "dimensions-original",
    });
    const original = structuredClone([...state.summaries.values()][0]);
    state.executions.set(
      "dimensions-updated",
      execution("dimensions-updated", 1, "process", [facet], 32),
    );
    await processTopicsExecution({
      projectId: "project",
      executionId: "dimensions-updated",
    });

    expect(state.summarize).toHaveBeenCalledTimes(1);
    expect(state.embed.mock.calls.map((call) => call[1])).toEqual([16, 32]);
    const target = state.summaries.get(
      state.executions.get("dimensions-updated")!.facets[0].summaryIds[0],
    )!;
    expect(target).toMatchObject({
      facetId: facet.facetId,
      facetVersionId: facet.id,
      facetVersion: facet.version,
      executionId: "dimensions-updated",
      state: "complete",
      summary: original.summary,
      inputHash: original.inputHash,
      inputTokens: 0,
      outputTokens: 0,
      summaryCostUsd: 0,
      metadata: {
        summaryReusedFromId: original.id,
      },
    });
    expect(target.embedding).toHaveLength(32);
    expect(target.id).not.toBe(original.id);
    expect(target.invocationHash).toBe(original.invocationHash);
    expect(state.summaries.get(original.id)).toEqual(original);

    const changed = {
      ...facet,
      id: "prompt-v2",
      version: 2,
      prompt: "Describe the issue.",
    };
    state.executions.set(
      "prompt-changed",
      execution("prompt-changed", 1, "process", [changed]),
    );
    await processTopicsExecution({
      projectId: "project",
      executionId: "prompt-changed",
    });
    const reverted = { ...facet, id: "prompt-v3", version: 3 };
    state.executions.set(
      "prompt-reverted",
      execution("prompt-reverted", 1, "process", [reverted]),
    );
    await processTopicsExecution({
      projectId: "project",
      executionId: "prompt-reverted",
    });
    const reused = state.summaries.get(
      state.executions.get("prompt-reverted")!.facets[0].summaryIds[0],
    )!;
    expect(reused.embedding).toEqual(original.embedding);
    expect(reused.embeddingCostUsd).toBe(0);
    expect(reused.metadata.embeddingReusedFromId).toBe(original.id);
    expect(state.summarize).toHaveBeenCalledTimes(2);
    expect(state.embed).toHaveBeenCalledTimes(3);
  });

  it("resumes re-embedding a reused summary without source data or summary inference", async () => {
    state.executions.set("reuse-source", execution("reuse-source", 1));
    await processTopicsExecution({
      projectId: "project",
      executionId: "reuse-source",
    });
    state.executions.set(
      "reuse-resume",
      execution("reuse-resume", 1, "process", [facet], 32),
    );
    state.embed.mockRejectedValueOnce(topicProviderError({ statusCode: 503 }));
    await processTopicsExecution({
      projectId: "project",
      executionId: "reuse-resume",
    });
    expect(state.executions.get("reuse-resume")?.status).toBe("failed");
    expect(state.summarize).toHaveBeenCalledTimes(1);
    state.sourceUnavailable = true;
    await processTopicsExecution({
      projectId: "project",
      executionId: "reuse-resume",
    });
    expect(state.executions.get("reuse-resume")?.status).toBe("completed");
    expect(state.summarize).toHaveBeenCalledTimes(1);
    expect(state.embed).toHaveBeenCalledTimes(3);
    expect(
      state.summaries.get(
        state.executions.get("reuse-resume")!.facets[0].summaryIds[0],
      )?.embedding,
    ).toHaveLength(32);
  });

  it("reuses non-applicable summaries after a dimension change without embedding", async () => {
    state.summarize.mockResolvedValueOnce({
      output: { status: "not_applicable", summary: "" },
      inputTokens: 50,
      outputTokens: 20,
      costUsd: 0.00002,
    });
    state.executions.set("non-applicable", execution("non-applicable", 1));
    await processTopicsExecution({
      projectId: "project",
      executionId: "non-applicable",
    });
    state.executions.set(
      "non-applicable-reuse",
      execution("non-applicable-reuse", 1, "process", [facet], 32),
    );
    await processTopicsExecution({
      projectId: "project",
      executionId: "non-applicable-reuse",
    });
    expect(state.summarize).toHaveBeenCalledTimes(1);
    expect(state.embed).not.toHaveBeenCalled();
    expect(
      state.executions.get("non-applicable-reuse")?.facets[0].counts
        .nonApplicable,
    ).toBe(1);
  });

  it("does not reuse another facet's summary for an identical prompt", async () => {
    state.executions.set("recipe-source", execution("recipe-source", 1));
    await processTopicsExecution({
      projectId: "project",
      executionId: "recipe-source",
    });
    const updated = {
      ...facet,
      facetId: "different-facet",
      id: "recipe-v2",
      version: 2,
    };
    state.executions.set(
      "recipe-updated",
      execution("recipe-updated", 1, "process", [updated]),
    );
    await processTopicsExecution({
      projectId: "project",
      executionId: "recipe-updated",
    });
    expect(state.summarize).toHaveBeenCalledTimes(2);
    expect(state.executions.get("recipe-updated")?.status).toBe("completed");
  });
  it("stops the entire execution on a sanitized provider failure", async () => {
    const failure = topicProviderError({
      statusCode: 401,
      message: "Incorrect API key sk-private-secret",
    });
    state.summarize.mockRejectedValueOnce(failure);
    state.executions.set("auth", execution("auth", 100));
    await processTopicsExecution({ projectId: "project", executionId: "auth" });
    expect(state.summarize).toHaveBeenCalledTimes(1);
    expect(state.embed).not.toHaveBeenCalled();
    expect(state.executions.get("auth")?.status).toBe("failed");
    expect(state.increment).toHaveBeenCalledWith(
      "langfuse.topics.executions",
      1,
      {
        outcome: "failed",
      },
    );
    expect(state.executions.get("auth")?.error).toContain("HTTP 401");
    expect(JSON.stringify(state.executions.get("auth"))).not.toContain(
      "sk-private-secret",
    );
  });
  it("records a cold-start outcome and replays without another provider call", async () => {
    state.executions.set("small", execution("small", 9));
    await processTopicsExecution({
      projectId: "project",
      executionId: "small",
    });
    expect(state.executions.get("small")?.facets[0].outcome).toBe(
      "awaiting_topics",
    );
    expect(state.summarize).toHaveBeenCalledTimes(9);
    expect(state.numeric).not.toHaveBeenCalled();
    await processTopicsExecution({
      projectId: "project",
      executionId: "small",
    });
    expect(state.summarize).toHaveBeenCalledTimes(9);
  });

  it.each([30, 31])(
    "applies the configured clustering minimum to %i summaries",
    async (count) => {
      await processSelection("threshold-source", count);
      const pending = execution("threshold", 0, "update");
      pending.input.minimumTraceCount = 31;
      state.executions.set(pending.id, pending);
      await processTopicsExecution({
        projectId: "project",
        executionId: pending.id,
      });
      if (count < 31) {
        expect(state.executions.get(pending.id)?.facets[0].outcome).toBe(
          "insufficient_data",
        );
        expect(state.numeric).not.toHaveBeenCalled();
      } else {
        expect(state.numeric).toHaveBeenCalledWith(
          expect.any(Array),
          expect.objectContaining({
            minimumCount: 31,
            minClusterSize: 15,
            minSamples: 5,
          }),
        );
        expect([...state.runs.values()][0].config.minimumCount).toBe(31);
      }
    },
  );

  it("waits when the published map has no compatible embedding configuration", async () => {
    await processSelection("source", 100);
    await updateSelection("map");
    const run = [...state.runs.values()][0];
    delete run.config.embeddingModel;
    await processSelection("incoming", 1, ["trace100"]);
    expect(state.executions.get("incoming")?.facets[0]).toMatchObject({
      outcome: "awaiting_topics",
      runId: null,
    });
    expect(
      [...state.assignments.values()].filter(
        (row) => row.executionId === "incoming",
      ),
    ).toEqual([]);
  });

  it("pins the serving map across embedding waits and assigns only the incoming batch", async () => {
    await processSelection("source", 100);
    await updateSelection("first-map");
    const first = [...state.runs.values()][0];
    expect(state.events.at(-2)).toBe("read-assignments");
    expect(state.events.at(-1)).toBe("publish");
    state.deferEmbeddings = true;
    await processSelection("incoming", 2, ["trace100", "trace101"]);
    await updateSelection("second-map");
    for (const [key, batch] of state.embeddingBatches) {
      if (state.completedBatches.has(key)) continue;
      await processTopicEmbeddingBatch(batch);
      state.completedBatches.add(key);
    }
    state.deferEmbeddings = false;
    await processTopicsExecution({
      projectId: "project",
      executionId: "incoming",
    });
    expect(state.executions.get("incoming")?.facets[0]).toMatchObject({
      runId: first.id,
      counts: { assigned: 1, outlier: 1 },
    });
    expect(
      [...state.assignments.values()].filter(
        (row) => row.executionId === "incoming",
      ),
    ).toHaveLength(2);
    expect(state.numeric).toHaveBeenCalledTimes(2);
    expect(state.summarize).toHaveBeenCalledTimes(102);
  });

  it("keeps an unpublished map until memberships are visible, reusing its accepted fit", async () => {
    await processSelection("source", 100);
    state.visible = false;
    state.executions.set("hidden", execution("hidden", 0, "update"));
    await processTopicsExecution({
      projectId: "project",
      executionId: "hidden",
    });
    expect(state.executions.get("hidden")?.facets[0].outcome).toBe("failed");
    expect([...state.runs.values()][0].publishedAt).toBeNull();
    expect(state.events).not.toContain("publish");
    const run = [...state.runs.values()][0];
    state.visible = true;
    await processTopicsExecution({
      projectId: "project",
      executionId: "hidden",
    });
    expect(state.runs.get(run.id)!.publishedAt).not.toBeNull();
    expect(state.numeric).toHaveBeenCalledTimes(1);
  });

  it("restores counts after map publication survives interrupted progress persistence", async () => {
    await processSelection("source", 100);
    state.executions.set("published", execution("published", 0, "update"));
    await processTopicsExecution({
      projectId: "project",
      executionId: "published",
    });
    const completed = structuredClone(state.executions.get("published")!);
    const interrupted = state.executions.get("published")!;
    interrupted.status = "running";
    interrupted.facets[0].outcome = "pending";
    interrupted.facets[0].counts.assigned = 0;
    interrupted.facets[0].counts.outlier = 0;
    state.sourceUnavailable = true;

    await processTopicsExecution({
      projectId: "project",
      executionId: "published",
    });

    expect(state.executions.get("published")?.status).toBe("completed");
    expect(state.executions.get("published")?.facets[0].counts).toEqual(
      completed.facets[0].counts,
    );
    expect(state.summarize).toHaveBeenCalledTimes(100);
    expect(state.numeric).toHaveBeenCalledTimes(1);
    expect(state.name).toHaveBeenCalledTimes(2);
  });

  it("retries assignments using only the accepted cohort", async () => {
    state.executions.set("map", execution("map", 100));
    await processTopicsExecution({ projectId: "project", executionId: "map" });
    await updateSelection("serving-map");
    const batch = execution("assignment-resume", 2, "process");
    if (batch.input.operation !== "process") throw new Error("Invalid fixture");
    batch.input.traceIds = ["trace100", "trace101"];
    state.summarize.mockRejectedValueOnce(new Error("Source read failed"));
    state.visible = false;
    state.executions.set(batch.id, batch);
    await processTopicsExecution({
      projectId: "project",
      executionId: batch.id,
    });
    expect(state.executions.get(batch.id)?.facets[0].outcome).toBe("failed");
    state.visible = true;

    await processTopicsExecution({
      projectId: "project",
      executionId: batch.id,
    });

    expect(state.executions.get(batch.id)?.facets[0]).toMatchObject({
      outcome: "assigned",
      counts: { complete: 1, failed: 1, assigned: 0, outlier: 1 },
    });
    expect(state.summarize).toHaveBeenCalledTimes(102);
  });
});
