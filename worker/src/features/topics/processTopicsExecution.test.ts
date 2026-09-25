import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  TopicAssignment,
  TopicEmbeddingConfig,
  TopicExecution,
  TopicFacetVersion,
  TopicFacetRef,
  TopicRun,
  TopicProcessBatchState,
  TopicSummary,
} from "@langfuse/shared/topics";
import {
  TOPICS_TRANSCRIPT_VERSION,
  type TopicEmbeddingBatch,
  type TopicEmbeddingRef,
} from "@langfuse/shared/topics/server";
import {
  assembleTranscript,
  type Transcript,
} from "@langfuse/shared/src/server";
import {
  topicExecutionInputSchema,
  topicSourceKey,
} from "@langfuse/shared/topics";
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
  visible: true,
  resultReads: vi.fn(),
  assignmentWrites: vi.fn(),
  saveBatch: vi.fn(),
  saveExecution: vi.fn(),
  loadTranscript: vi.fn(),
  summarize: vi.fn(),
  embed: vi.fn(),
  name: vi.fn(),
  numeric: vi.fn(),
}));
vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const { assembleTranscript } =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    assembleTranscript,
    recordIncrement: vi.fn(),
    recordDistribution: vi.fn(),
  };
});
const facet: TopicFacetVersion = {
  projectId: "project",
  facetId: "facet",
  version: 1,
  prompt: "Describe the interaction intent.",
  createdAt: "2026-01-01T00:00:00.000Z",
};

vi.mock("@langfuse/shared/topics/server", async (importOriginal) => {
  const { TOPICS_TRANSCRIPT_VERSION, TOPIC_EMBEDDING_EXPIRED_ERROR } =
    await importOriginal<typeof import("@langfuse/shared/topics/server")>();
  return {
    isTopicsEnabled: () => true,
    TOPICS_TRANSCRIPT_VERSION,
    TOPIC_EMBEDDING_EXPIRED_ERROR,
    stageTopicSummary: async (
      scope: { projectId: string; executionId: string },
      summary: TopicSummary,
      embeddingConfig: TopicEmbeddingConfig,
    ) => {
      const key = `${scope.executionId}/${topicSourceKey(summary)}`;
      const accepted = state.staged.get(key);
      if (accepted) return accepted.summary;
      state.staged.set(key, structuredClone({ summary, embeddingConfig }));
      return summary;
    },
    readStagedTopicSummaries: async (
      projectId: string,
      executionId: string,
      facetId: string,
      facetVersion: number,
      traceIds: string[],
    ) =>
      [...state.staged.entries()]
        .filter(([key]) => key.startsWith(`${executionId}/`))
        .map(([, row]) => row.summary)
        .filter(
          (row) =>
            row.projectId === projectId &&
            row.facetId === facetId &&
            row.facetVersion === facetVersion &&
            row.traceId !== null &&
            traceIds.includes(row.traceId),
        ),
    readStagedTopicSummary: async (
      scope: { projectId: string; executionId: string },
      ref: TopicEmbeddingRef,
    ) =>
      state.staged.get(
        `${scope.executionId}/${topicSourceKey({ ...scope, ...ref, sessionId: null })}`,
      ) ?? null,
    updateStagedTopicSummary: async (
      scope: { projectId: string; executionId: string },
      ref: TopicEmbeddingRef,
      summary: TopicSummary,
    ) => {
      const key = `${scope.executionId}/${topicSourceKey({ ...scope, ...ref, sessionId: null })}`;
      const row = state.staged.get(key);
      if (!row) return null;
      if (row.summary.state !== "summarized") return row.summary;
      state.staged.set(key, { ...row, summary });
      return summary;
    },
    deleteStagedTopicSummary: async (
      scope: { projectId: string; executionId: string },
      ref: TopicEmbeddingRef,
    ) => {
      state.staged.delete(
        `${scope.executionId}/${topicSourceKey({ ...scope, ...ref, sessionId: null })}`,
      );
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
    loadTopicTranscript: state.loadTranscript,
    readTopicExecutionSummary: async (_project: string, id: string) => {
      const execution = state.executions.get(id);
      if (!execution) return null;
      const { traceErrors: _errors, ...result } = execution;
      const input = { ...result.input };
      if (input.operation === "process")
        Reflect.deleteProperty(input, "traceIds");
      return structuredClone({
        ...result,
        input,
      });
    },
    writeTopicExecution: async (execution: TopicExecution) => {
      await state.saveExecution(execution);
      state.executions.set(execution.id, structuredClone(execution));
    },
    getTopicFacetVersion: async (
      _project: string,
      facetId: string,
      version: number,
    ) => state.facets.get(`${facetId}/${version}`) ?? null,
    listTopicSummaries: async (
      projectId: string,
      filter: {
        traceIds: string[];
        facetId: string;
        facetVersion: number;
      },
    ) => {
      state.resultReads("historical");
      return [...state.summaries.values()].filter(
        (row) =>
          row.projectId === projectId &&
          row.facetId === filter.facetId &&
          row.facetVersion === filter.facetVersion &&
          row.traceId !== null &&
          filter.traceIds.includes(row.traceId),
      );
    },
    writeTopicSummaries: async (rows: TopicSummary[]) =>
      rows.forEach((row) => {
        const key = topicSourceKey(row);
        if ((state.summaries.get(key)?.processedAt ?? "") <= row.processedAt)
          state.summaries.set(key, row);
      }),
    createTopicRun: async (
      input: Pick<
        TopicRun,
        "projectId" | "facetId" | "facetVersion" | "config"
      >,
    ) => pendingRun({ ...input, id: `generated-run-${state.runs.size}` }),
    getPublishedTopicRun: async (_project: string, facetId: string) =>
      [...state.runs.values()]
        .filter((run) => run.status === "completed" && run.facetId === facetId)
        .sort(
          (a, b) =>
            a.facetVersion - b.facetVersion ||
            a.createdAt.localeCompare(b.createdAt),
        )
        .at(-1) ?? null,
    getTopicClusteringSummaries: async (
      projectId: string,
      facetId: string,
      facetVersion: number,
      embeddingConfig: TopicEmbeddingConfig,
    ) =>
      [...state.summaries.values()]
        .filter(
          (row) =>
            row.projectId === projectId &&
            row.facetId === facetId &&
            row.facetVersion === facetVersion &&
            row.traceId !== null &&
            row.state === "complete" &&
            row.embeddingModel === embeddingConfig.embeddingModel &&
            row.embedding.length === embeddingConfig.embeddingDimensions,
        )
        .sort((a, b) =>
          a.traceId < b.traceId ? -1 : a.traceId > b.traceId ? 1 : 0,
        ),
    getTopicRun: async (_project: string, id: string) =>
      state.runs.get(id) ?? null,
    readTopicRunTraceIds: async (
      projectId: string,
      facet: TopicFacetRef,
      runId: string,
    ) =>
      [...state.assignments.values()]
        .filter(
          (row) =>
            row.projectId === projectId &&
            row.facetId === facet.facetId &&
            row.facetVersion === facet.version &&
            row.runId === runId &&
            row.origin === "initial" &&
            row.traceId !== null,
        )
        .map((row) => row.traceId),
    readTopicMapAssignments: async (
      projectId: string,
      facet: TopicFacetRef,
      runId: string,
    ) =>
      [...state.assignments.values()].filter(
        (row) =>
          row.projectId === projectId &&
          row.facetId === facet.facetId &&
          row.facetVersion === facet.version &&
          row.runId === runId &&
          row.origin === "initial",
      ),
    saveTopicRun: async (run: TopicRun) => {
      state.runs.set(run.id, structuredClone(run));
      return structuredClone(run);
    },
    writeTopicAssignments: async (rows: TopicAssignment[]) => {
      await state.assignmentWrites(rows);
      rows.forEach((row) =>
        state.assignments.set(
          JSON.stringify([topicSourceKey(row), row.runId, row.origin]),
          row,
        ),
      );
    },
    readTopicAssignments: async (
      projectId: string,
      facet: TopicFacetRef,
      sources: Pick<TopicSummary, "traceId" | "sessionId">[],
      runId: string,
    ) => {
      state.resultReads("assignments");
      if (!state.visible) return [];
      return [...state.assignments.values()].filter(
        (row) =>
          row.projectId === projectId &&
          row.facetId === facet.facetId &&
          row.facetVersion === facet.version &&
          row.runId === runId &&
          sources.some((source) => source.traceId === row.traceId),
      );
    },
  };
});
vi.mock("./models", () => ({
  TOPICS_NAMING_MODEL: "global.openai.gpt-5.6-terra",
  summarizeTopicTrace: (...args: unknown[]) => state.summarize(...args),
  embedTopicSummary: (...args: unknown[]) => state.embed(...args),
  nameTopicGroup: (...args: unknown[]) => state.name(...args),
}));
vi.mock("./numeric", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./numeric")>()),
  runTopicClustering: (...args: unknown[]) => state.numeric(...args),
}));

import { processTopicsExecution as processTopicsExecutionAttempt } from "./processTopicsExecution";
import { processTopicEmbeddingBatch } from "./processTopicEmbeddingBatch";

function traceInput(traceId: string, input: string | null = traceId) {
  return {
    unitStartTime: "2026-01-01T00:00:00.000Z",
    environment: "production",
    traceName: "Customer support",
    sessionId: "session",
    transcript: assembleTranscript([
      {
        id: `${traceId}-generation`,
        traceId,
        parentObservationId: null,
        type: "GENERATION",
        name: "chat",
        startTime: new Date("2026-01-01T00:00:00.000Z"),
        input,
        output: null,
        metadata: {},
      },
    ]),
  };
}

async function processTopicsExecution(
  scope: Parameters<typeof processTopicsExecutionAttempt>[0],
) {
  const selected = state.executions.get(scope.executionId)!;
  const traceIds =
    selected.input.operation === "process"
      ? selected.input.traceIds
      : undefined;
  return processTopicsExecutionAttempt({
    ...scope,
    traceIds,
    batchId: "batch-0",
    batchState: state.batches.get(scope.executionId),
    saveBatchState: async (value) => {
      await state.saveBatch(value);
      state.batches.set(scope.executionId, structuredClone(value));
      state.executions.set(scope.executionId, structuredClone(value.execution));
    },
  });
}

function pendingRun(
  input: Pick<
    TopicRun,
    "id" | "projectId" | "facetId" | "facetVersion" | "config"
  >,
): TopicRun {
  const run: TopicRun = {
    ...input,
    status: "pending",
    startedAt: null,
    createdAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    topics: [],
  };
  state.runs.set(run.id, structuredClone(run));
  return run;
}

function execution<T extends "process" | "update" = "process">(
  id: string,
  count: number,
  operation: T = "process" as T,
  facets = [facet],
  embeddingDimensions = 256,
): TopicExecution & {
  input: Extract<TopicExecution["input"], { operation: T }>;
} {
  facets.forEach((selected) =>
    state.facets.set(`${selected.facetId}/${selected.version}`, selected),
  );
  const input = topicExecutionInputSchema.parse({
    projectId: "project",
    requestId: id,
    operation,
    facets: facets.map(({ facetId, version }) => ({ facetId, version })),
    embeddingConfig: {
      embeddingDimensions,
    },
    ...(operation === "process"
      ? { traceIds: Array.from({ length: count }, (_, i) => `trace${i}`) }
      : {}),
  });
  return {
    id,
    projectId: "project",
    input,
    status: "queued",
    phase: "queued",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    facets: facets.map((selected) => ({
      facetId: selected.facetId,
      facetVersion: selected.version,
      outcome: "pending",
      runId:
        operation === "process"
          ? ([...state.runs.values()]
              .filter(
                (run) =>
                  run.status === "completed" &&
                  run.facetId === selected.facetId &&
                  run.facetVersion === selected.version &&
                  run.config.dimensions === embeddingDimensions,
              )
              .at(-1)?.id ?? null)
          : pendingRun({
              id: `run-${id}-${selected.facetId}-${selected.version}`,
              projectId: "project",
              facetId: selected.facetId,
              facetVersion: selected.version,
              config: {},
            }).id,
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
  reuseExistingSummaries = false,
) {
  const pending = execution(id, count);
  pending.input.reuseExistingSummaries = reuseExistingSummaries;
  if (traceIds) pending.input.traceIds = traceIds;
  state.executions.set(id, pending);
  return processTopicsExecution({ projectId: "project", executionId: id });
}

async function updateSelection(id: string) {
  state.executions.set(id, execution(id, 0, "update"));
  await processTopicsExecution({ projectId: "project", executionId: id });
}

beforeEach(() => {
  vi.resetAllMocks();
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
  state.visible = true;
  state.loadTranscript.mockImplementation(async ({ traceId }) =>
    traceInput(traceId),
  );
  state.summarize.mockImplementation(async (_facet, text: string) => {
    const transcript: Transcript = JSON.parse(text);
    const input = transcript.threads[0].currentTurn.messages[0].parts.find(
      (part) => part.type === "text",
    );
    return {
      output: {
        status: "applicable",
        summary: input!.text,
      },
      providedUsageDetails: { summary_input: 1 },
      usageDetails: { summary_input: 1 },
      providedCostDetails: {},
      costDetails: {},
    };
  });
  state.embed.mockImplementation(
    async (summary: string, dimensions: number) => {
      const i = Number(summary.replace("trace", ""));
      const embedding = Array.from({ length: dimensions }, () => 0);
      if (i === 101) embedding[2] = 1;
      else {
        embedding[i < 50 || i === 100 ? 0 : 1] = 1;
        embedding[3] = Math.sin(i) * 0.03;
      }
      return {
        embedding,
        providedUsageDetails: { embedding_input: 1 },
        usageDetails: { embedding_input: 1 },
        providedCostDetails: {},
        costDetails: {},
      };
    },
  );
  state.numeric.mockImplementation(async (vectors: number[][]) => ({
    status: "complete",
    labels: vectors.map((vector) =>
      vector[0] > 0.5 ? 0 : vector[1] > 0.5 ? 1 : -1,
    ),
    coordinates: vectors.map((vector) => vector.slice(0, 2)),
  }));
  state.name.mockImplementation(
    async (group: { id: string; members: { id: string }[] }) => ({
      output: {
        name: `Topic ${group.id.slice(0, 8)}`,
        description: "Observed member interactions.",
        evidenceSummaryIds: [group.members[0].id],
      },
    }),
  );
});

describe("Topics execution", () => {
  it("records null transcripts as insufficient input without inference", async () => {
    state.loadTranscript.mockResolvedValueOnce(traceInput("trace0", null));
    await processSelection("empty-transcript", 1);
    expect(state.executions.get("empty-transcript")).toMatchObject({
      status: "completed",
      facets: [{ counts: { insufficientInput: 1, failed: 0 } }],
    });
    expect([...state.summaries.values()]).toMatchObject([
      { state: "insufficient_input", summary: "", embedding: [] },
    ]);
    expect(state.summarize).not.toHaveBeenCalled();
    expect(state.embed).not.toHaveBeenCalled();
  });

  it("processes fresh summaries without a topic map or implicit historical reuse", async () => {
    await processSelection("first", 10);
    expect(state.executions.get("first")?.status).toBe("completed");
    expect(state.executions.get("first")?.facets[0].outcome).toBe(
      "awaiting_topics",
    );
    expect(state.summaries.size).toBe(10);
    expect(state.assignments.size).toBe(0);
    expect([...state.summaries.values()][0]).toMatchObject({
      traceId: "trace0",
      sessionId: "session",
      environment: "production",
      traceName: "Customer support",
      unitStartTime: "2026-01-01T00:00:00.000Z",
    });
    expect(state.numeric).not.toHaveBeenCalled();
    expect(state.saveExecution).not.toHaveBeenCalled();
    await processSelection("second", 10);
    expect(state.executions.get("second")?.status).toBe("completed");
    expect(state.summaries.size).toBe(10);
    await processTopicsExecution({
      projectId: "project",
      executionId: "first",
    });
    expect(state.summarize).toHaveBeenCalledTimes(20);
    expect(state.resultReads).not.toHaveBeenCalled();
  });

  it.each([
    { facetId: "issues", version: 1 },
    { facetId: "facet", version: 2 },
  ])(
    "resumes only unfinished facet $facetId version $version after completed payloads expire",
    async (reference) => {
      const issues = { ...facet, ...reference };
      state.executions.set(
        "source",
        execution("source", 100, "process", [facet, issues]),
      );
      await processTopicsExecution({
        projectId: "project",
        executionId: "source",
      });
      expect(state.loadTranscript).toHaveBeenCalledTimes(100);
      expect(state.summarize).toHaveBeenCalledTimes(200);
      expect(state.summaries.size).toBe(200);
      state.executions.set(
        "maps",
        execution("maps", 0, "update", [facet, issues]),
      );
      await processTopicsExecution({
        projectId: "project",
        executionId: "maps",
      });
      state.summarize.mockClear();
      state.embed.mockClear();
      state.resultReads.mockReset().mockImplementation(() => {
        throw new Error("Unexpected ClickHouse result read");
      });
      state.assignments.clear();
      state.executions.set(
        "partial-assignment",
        execution("partial-assignment", 1, "process", [facet, issues]),
      );
      state.assignmentWrites
        .mockReset()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("Insert failed"));
      await processTopicsExecution({
        projectId: "project",
        executionId: "partial-assignment",
      });
      expect(
        state.executions
          .get("partial-assignment")
          ?.facets.map((f) => f.outcome),
      ).toEqual(["assigned", "failed"]);
      expect(state.executions.get("partial-assignment")?.status).toBe(
        "completed_with_errors",
      );
      expect(state.staged.size).toBe(2);
      const failedWrite = structuredClone(
        state.assignmentWrites.mock.calls[1][0],
      );
      for (const [id, row] of state.staged) {
        if (
          row.summary.facetId === facet.facetId &&
          row.summary.facetVersion === facet.version
        )
          state.staged.delete(id);
      }
      state.embeddingBatches.clear();
      state.completedBatches.clear();
      await processTopicsExecution({
        projectId: "project",
        executionId: "partial-assignment",
      });
      expect(state.executions.get("partial-assignment")?.status).toBe(
        "completed",
      );
      expect(state.assignments.size).toBe(2);
      expect(state.assignmentWrites.mock.calls[2][0]).toEqual(failedWrite);
      expect(state.staged.size).toBe(0);
      expect(state.summarize).toHaveBeenCalledTimes(2);
      expect(state.embed).toHaveBeenCalledTimes(2);
      expect(state.resultReads).not.toHaveBeenCalled();
    },
  );

  it("retains Redis payloads until the terminal batch receipt is saved", async () => {
    state.saveBatch
      .mockImplementationOnce(async () => {})
      .mockImplementation(async (batch: TopicProcessBatchState) => {
        if (batch.execution.status === "completed")
          throw new Error("Redis receipt unavailable");
      });
    await processSelection("receipt", 1);
    expect(state.executions.get("receipt")?.status).toBe("failed");
    expect(state.staged.size).toBe(1);
    state.staged.clear();
    state.embeddingBatches.clear();
    state.completedBatches.clear();
    state.saveBatch.mockReset();
    await processTopicsExecution({
      projectId: "project",
      executionId: "receipt",
    });
    expect(state.executions.get("receipt")?.status).toBe("completed");
    expect(state.staged.size).toBe(0);
    expect(state.summarize).toHaveBeenCalledOnce();
    expect(state.embed).toHaveBeenCalledOnce();
  });

  it.each([false, true])(
    "does not regenerate expired payloads (embedding persisted: %s)",
    async (persisted) => {
      state.deferEmbeddings = true;
      await processSelection("expired", 1);
      if (persisted) {
        for (const [key, batch] of state.embeddingBatches) {
          await processTopicEmbeddingBatch(batch);
          state.completedBatches.add(key);
        }
      }
      expect(state.summaries.size).toBe(persisted ? 1 : 0);
      state.staged.clear();
      state.deferEmbeddings = false;
      await processTopicsExecution({
        projectId: "project",
        executionId: "expired",
      });
      expect(state.executions.get("expired")).toMatchObject({
        status: "failed",
        error: expect.stringContaining("expired"),
      });
      expect(state.resultReads).not.toHaveBeenCalled();
      expect(state.summarize).toHaveBeenCalledOnce();
    },
  );

  it.each([
    { version: TOPICS_TRANSCRIPT_VERSION, calls: 1, usageDetails: {} },
    {
      version: "older-transcript",
      calls: 2,
      usageDetails: { summary_input: 1, embedding_input: 1, total: 2 },
    },
  ])(
    "reuses only compatible historical summaries ($version)",
    async ({ version, calls, usageDetails }) => {
      await processSelection("first", 1);
      for (const summary of state.summaries.values())
        summary.transcriptVersion = version;
      state.loadTranscript.mockImplementation(async ({ traceId }) => ({
        ...traceInput(traceId),
        environment: "staging",
        traceName: "Updated support",
      }));
      await processSelection("second", 1, undefined, true);
      expect(state.summarize).toHaveBeenCalledTimes(calls);
      expect(state.embed).toHaveBeenCalledTimes(calls);
      expect([...state.summaries.values()]).toMatchObject([
        {
          environment: "staging",
          traceName: "Updated support",
          transcriptVersion: TOPICS_TRANSCRIPT_VERSION,
        },
      ]);
      expect([...state.summaries.values()][0].usageDetails).toEqual(
        usageDetails,
      );
    },
  );

  it("rejects frozen legacy summary models before reusing or relabeling results", async () => {
    await processSelection("source", 1);
    const summary = [...state.summaries.values()][0];
    summary.summaryModel = "gpt-4.1-nano";
    const original = structuredClone(summary);
    const legacy = execution("legacy", 1);
    legacy.input.reuseExistingSummaries = true;
    Object.assign(legacy.input.processingConfig, {
      summaryModel: "gpt-4.1-nano",
    });
    state.executions.set(legacy.id, legacy);
    vi.clearAllMocks();

    await processTopicsExecution({
      projectId: "project",
      executionId: legacy.id,
    });

    expect(state.executions.get(legacy.id)).toMatchObject({
      status: "failed",
      error: expect.stringContaining("Start a new execution"),
    });
    expect([...state.summaries.values()]).toEqual([original]);
    expect(state.resultReads).not.toHaveBeenCalled();
    expect(state.loadTranscript).not.toHaveBeenCalled();
    expect(state.summarize).not.toHaveBeenCalled();
    expect(state.embed).not.toHaveBeenCalled();
    expect(state.name).not.toHaveBeenCalled();
  });

  it("resumes legacy summary references after a provider interruption", async () => {
    const original = state.summarize.getMockImplementation()!;
    state.summarize
      .mockImplementationOnce(original)
      .mockRejectedValueOnce(topicProviderError({ statusCode: 503 }));
    await processSelection("partial", 3);
    expect(state.batches.get("partial")?.summaries).toHaveLength(1);
    expect(state.executions.get("partial")?.status).toBe("failed");
    const accepted = [...state.staged.values()][0].summary;
    Object.assign(accepted, { id: "legacy-summary-id" });
    Object.assign(state.batches.get("partial")!.summaries[0], {
      summaryId: "legacy-summary-id",
    });
    accepted.transcriptVersion = "older-transcript";
    state.loadTranscript.mockClear();
    await processTopicsExecution({
      projectId: "project",
      executionId: "partial",
    });
    expect(state.executions.get("partial")?.status).toBe("completed");
    expect(state.summarize).toHaveBeenCalledTimes(4);
    expect(state.summaries.size).toBe(3);
    expect(state.loadTranscript).not.toHaveBeenCalledWith({
      projectId: "project",
      traceId: accepted.traceId,
    });
    expect(
      state.summaries.get(topicSourceKey(accepted))?.transcriptVersion,
    ).toBe("older-transcript");
  });

  it("resumes pending embeddings with the pinned map and no source or result reads", async () => {
    await processSelection("source", 100);
    await updateSelection("first-map");
    const first = [...state.runs.values()].at(-1)!;
    state.deferEmbeddings = true;
    await processSelection("incoming", 1, ["trace100"]);
    expect(state.batches.get("incoming")?.summarized).toBe(true);
    expect(state.executions.get("incoming")?.phase).toBe("embedding");
    await updateSelection("second-map");
    for (const [key, batch] of state.embeddingBatches) {
      if (!state.completedBatches.has(key))
        await processTopicEmbeddingBatch(batch);
      state.completedBatches.add(key);
    }
    state.loadTranscript.mockRejectedValue(
      new Error("Source trace unavailable"),
    );
    state.resultReads.mockClear();
    state.deferEmbeddings = false;
    await processTopicsExecution({
      projectId: "project",
      executionId: "incoming",
    });
    expect(state.executions.get("incoming")?.status).toBe("completed");
    expect(state.summarize).toHaveBeenCalledTimes(101);
    expect(state.resultReads).not.toHaveBeenCalled();
    expect(
      [...state.assignments.values()].find(
        (row) => row.traceId === "trace100" && row.origin === "online",
      )?.runId,
    ).toBe(first.id);
  });

  it("reuses summary inference when embedding dimensions change", async () => {
    await processSelection("source", 4);
    const reprocess = execution("dimensions", 4, "process", [facet], 512);
    reprocess.input.reuseExistingSummaries = true;
    state.executions.set("dimensions", reprocess);
    await processTopicsExecution({
      projectId: "project",
      executionId: "dimensions",
    });
    expect(state.summarize).toHaveBeenCalledTimes(4);
    expect(state.embed).toHaveBeenCalledTimes(8);
    expect(
      [...state.summaries.values()].filter(
        (row) => row.embedding.length === 512,
      ),
    ).toHaveLength(4);
  });

  it("records source failures while processing the remaining traces", async () => {
    state.loadTranscript.mockRejectedValueOnce(
      new Error("Source trace unavailable"),
    );
    await processSelection("source-failure", 3);
    expect(state.executions.get("source-failure")?.status).toBe(
      "completed_with_errors",
    );
    expect(
      state.executions.get("source-failure")?.facets[0].counts,
    ).toMatchObject({ complete: 2, failed: 1 });
    expect(state.summarize).toHaveBeenCalledTimes(2);
  });

  it("restarts a failed update with fresh membership and naming while preserving the published map", async () => {
    await processSelection("source", 100);
    await updateSelection("published");
    const published = [...state.runs.values()].at(-1)!;
    for (const summary of state.summaries.values())
      summary.embedding[3] += 0.001;
    const naming = state.name.getMockImplementation()!;
    state.name
      .mockImplementationOnce(naming)
      .mockRejectedValueOnce(new Error("Naming unavailable"));
    await updateSelection("retry");
    const failed = [...state.runs.values()].at(-1)!;
    expect(failed.status).toBe("failed");
    expect(state.runs.get(published.id)?.status).toBe("completed");
    await processSelection("additional", 1, ["trace100"]);
    await processTopicsExecution({
      projectId: "project",
      executionId: "retry",
    });
    const retried = [...state.runs.values()].at(-1)!;
    expect(retried.id).not.toBe(failed.id);
    expect(retried.status).toBe("completed");
    expect(
      [...state.assignments.values()].filter(
        (row) => row.runId === retried.id && row.origin === "initial",
      ),
    ).toHaveLength(101);
    expect(state.numeric).toHaveBeenCalledTimes(3);
    expect(state.name).toHaveBeenCalledTimes(6);
  });

  it.each([false, true])(
    "recovers completed maps after a lost acknowledgement (all outliers: %s)",
    async (outliers) => {
      await processSelection("source", 100);
      state.loadTranscript.mockRejectedValue(
        new Error("Source trace unavailable"),
      );
      if (outliers)
        state.numeric.mockImplementation(async (vectors: number[][]) => ({
          status: "no_topics",
          labels: vectors.map(() => -1),
          coordinates: vectors.map(() => [0, 0]),
        }));
      state.saveExecution.mockImplementation(
        async (execution: TopicExecution) => {
          if (execution.facets[0].outcome !== "pending")
            throw new Error("Progress acknowledgement lost");
        },
      );
      await expect(updateSelection("published")).rejects.toThrow(
        "Progress acknowledgement lost",
      );
      const interrupted = state.executions.get("published")!.facets[0];
      expect(interrupted.outcome).toBe("pending");
      expect(state.runs.get(interrupted.runId!)?.status).toBe("completed");
      expect(state.summarize).toHaveBeenCalledTimes(100);
      expect(state.embed).toHaveBeenCalledTimes(100);
      expect(state.assignments.size).toBe(100);
      expect([...state.assignments.values()][0].coordinates).toHaveLength(2);
      state.saveExecution.mockReset();
      state.loadTranscript.mockImplementation(async ({ traceId }) => ({
        ...traceInput(traceId),
        environment: "staging",
        traceName: "New support requests",
      }));
      await processSelection("online", 2, ["trace100", "trace101"]);
      expect(state.executions.get("online")?.facets[0]).toMatchObject({
        outcome: "assigned",
        counts: { assigned: outliers ? 0 : 1, outlier: outliers ? 2 : 1 },
      });
      for (const assignment of state.assignments.values()) {
        const summary = state.summaries.get(topicSourceKey(assignment))!;
        expect(assignment).toMatchObject({
          environment: summary.environment,
          traceName: summary.traceName,
        });
      }
      await processTopicsExecution({
        projectId: "project",
        executionId: "published",
      });
      expect(state.executions.get("published")?.facets[0]).toMatchObject({
        outcome: outliers ? "no_topics" : "published",
        counts: {
          requested: 100,
          complete: 100,
          assigned: outliers ? 0 : 100,
          outlier: outliers ? 100 : 0,
        },
      });
      expect(state.numeric).toHaveBeenCalledOnce();
      expect(state.name).toHaveBeenCalledTimes(outliers ? 0 : 2);
      expect(state.runs.size).toBe(1);
    },
  );

  it("does not fit or name when persisting the attempt fails", async () => {
    await processSelection("source", 100);
    state.saveExecution.mockImplementation(
      async (execution: TopicExecution) => {
        if (execution.phase === "clustering")
          throw new Error("Progress unavailable");
      },
    );
    await updateSelection("unregistered");
    expect(state.executions.get("unregistered")?.facets[0]).toMatchObject({
      outcome: "failed",
      error: "Progress unavailable",
    });
    expect([...state.runs.values()][0].status).toBe("pending");
    expect(state.numeric).not.toHaveBeenCalled();
    expect(state.name).not.toHaveBeenCalled();
  });

  it("maps local naming citations back to their scoped source references", async () => {
    await processSelection("source", 100);
    await updateSelection("named");
    const topics = [...state.runs.values()].at(-1)!.topics;
    expect(topics).toHaveLength(2);
    for (const [index, [group]] of state.name.mock.calls.entries()) {
      for (const member of group.members)
        expect(member).toEqual({
          id: expect.stringMatching(/^m\d+$/),
          summary: expect.any(String),
        });
      for (const contrast of group.contrasts)
        expect(contrast).toEqual({
          id: expect.stringMatching(/^c\d+$/),
          summary: expect.any(String),
        });
      const source = [...state.summaries.values()].find(
        (summary) => summary.summary === group.members[0].summary,
      )!;
      expect(topics[index].representativeSummaries).toEqual([
        {
          facetId: source.facetId,
          facetVersion: source.facetVersion,
          traceId: source.traceId,
          sessionId: null,
        },
      ]);
    }
  });

  it.each([0, 3])(
    "recovers a skipped cohort of %s after a lost progress acknowledgement",
    async (count) => {
      if (count) await processSelection("source", count);
      state.saveExecution.mockImplementation(
        async (execution: TopicExecution) => {
          if (execution.facets[0].outcome !== "pending")
            throw new Error("Progress acknowledgement lost");
        },
      );
      await expect(updateSelection("skipped")).rejects.toThrow(
        "Progress acknowledgement lost",
      );
      const interrupted = state.executions.get("skipped")!;
      expect(interrupted.facets[0].runId).toBeTruthy();
      expect(state.runs.get(interrupted.facets[0].runId!)?.status).toBe(
        "skipped",
      );
      state.saveExecution.mockReset();
      await processTopicsExecution({
        projectId: "project",
        executionId: "skipped",
      });
      expect(state.executions.get("skipped")?.facets[0]).toMatchObject({
        outcome: count ? "insufficient_data" : "no_applicable_summaries",
        counts: { requested: count },
      });
      expect(state.numeric).not.toHaveBeenCalled();
      expect(state.runs.size).toBe(1);
    },
  );

  it("reuses stored definitions despite roundoff as membership grows and updates retry", async () => {
    await processSelection("source", 100);
    for (const summary of state.summaries.values()) summary.embedding[3] = 0;
    await updateSelection("first");
    for (const topic of [...state.runs.values()].at(-1)!.topics) {
      topic.centroid[0] += Number.EPSILON;
      topic.radius += Number.EPSILON;
    }
    const first = structuredClone([...state.runs.values()].at(-1)!);
    await processSelection("additional", 1, ["trace100"]);
    for (const summary of state.summaries.values()) summary.embedding[3] = 0;
    state.assignmentWrites.mockRejectedValueOnce(
      new Error("Temporary failure"),
    );
    await updateSelection("second");
    expect([...state.runs.values()].at(-1)?.status).toBe("failed");
    await processTopicsExecution({
      projectId: "project",
      executionId: "second",
    });
    const second = [...state.runs.values()].at(-1)!;
    expect(second.status).toBe("completed");
    expect(second.topics).toEqual(first.topics);
    expect(
      second.topics.every((topic) => topic.createdByRunId === first.id),
    ).toBe(true);
    expect(state.name).toHaveBeenCalledTimes(2);
    expect(
      [...state.assignments.values()].find(
        (row) => row.runId === second.id && row.traceId === "trace100",
      )?.topicVersionId,
    ).toBe(
      first.topics.find((topic) => topic.centroid[0] > 0.5)?.topicVersionId,
    );
    expect(state.runs.get(first.id)).toEqual(first);
  });

  it("retains only populations served by stored geometry when near-tied definitions are reused", async () => {
    await processSelection("source", 100);
    for (const summary of state.summaries.values()) {
      const second = summary.embedding[1] > 0.5;
      summary.embedding.fill(0);
      summary.embedding[0] = 1;
      summary.embedding[1] = second ? 3e-8 : 0;
    }
    state.numeric.mockImplementation(async (vectors: number[][]) => ({
      status: "complete",
      labels: vectors.map((vector) => (vector[1] ? 1 : 0)),
      coordinates: vectors.map((vector) => vector.slice(0, 2)),
    }));
    await updateSelection("first");
    const first = [...state.runs.values()].at(-1)!;
    expect(first.topics).toHaveLength(2);
    first.topics.find((topic) => topic.centroid[1] === 0)!.centroid[0] -=
      4 * Number.EPSILON;
    const retained = first.topics.find((topic) => topic.centroid[1] > 0)!;
    await updateSelection("second");
    const second = [...state.runs.values()].at(-1)!;
    expect(second.topics).toEqual([retained]);
    expect(state.name).toHaveBeenCalledTimes(2);
    const assignments = [...state.assignments.values()].filter(
      (row) => row.runId === second.id,
    );
    expect(assignments).toHaveLength(100);
    expect(
      assignments.every(
        (row) => row.topicVersionId === retained.topicVersionId,
      ),
    ).toBe(true);
  });

  it.each(["centroid", "radius"] as const)(
    "creates a new version with the same stable identity when its %s changes",
    async (changed) => {
      await processSelection("source", 100);
      const members = [...state.summaries.values()].filter(
        (summary) => Number(summary.traceId?.replace("trace", "")) < 50,
      );
      members.forEach((summary, index) => {
        summary.embedding[3] = index % 2 ? 0.03 : -0.03;
      });
      await updateSelection("first");
      const first = structuredClone([...state.runs.values()].at(-1)!);
      members.forEach((summary, index) => {
        if (changed === "radius")
          summary.embedding[3] = index % 2 ? 0.04 : -0.04;
        else summary.embedding[3] += 0.001;
      });
      await updateSelection("second");
      const second = [...state.runs.values()].at(-1)!;
      const old = first.topics.find((topic) => topic.centroid[0] > 0.5)!;
      const updated = second.topics.find(
        (topic) => topic.topicId === old.topicId,
      )!;
      expect(updated.topicVersionId).not.toBe(old.topicVersionId);
      expect(updated.createdByRunId).toBe(second.id);
      expect(updated[changed]).not.toEqual(old[changed]);
      if (changed === "radius") expect(updated.centroid).toEqual(old.centroid);
      expect(second.topics.find((topic) => topic.centroid[1] > 0.5)).toEqual(
        first.topics.find((topic) => topic.centroid[1] > 0.5),
      );
      expect(state.name).toHaveBeenCalledTimes(3);
      expect(state.runs.get(first.id)).toEqual(first);
    },
  );

  it("reserves reused names before naming changed definitions", async () => {
    await processSelection("source", 100);
    await updateSelection("first");
    const first = [...state.runs.values()].at(-1)!;
    const unchanged = first.topics.find((topic) => topic.centroid[1] > 0.5)!;
    for (const summary of state.summaries.values()) {
      if (summary.embedding[0] > 0.5) summary.embedding[3] += 0.001;
    }
    state.name.mockResolvedValueOnce({
      output: {
        name: unchanged.name,
        description: "A colliding name.",
        evidenceSummaryIds: ["m1"],
      },
    });
    await updateSelection("second");
    expect([...state.runs.values()].at(-1)).toMatchObject({
      status: "failed",
      error: "Topic names must be concise, non-empty, and distinct.",
    });
  });

  it("defers publication when assignments are not visible", async () => {
    await processSelection("source", 100);
    state.visible = false;
    await updateSelection("hidden");
    expect([...state.runs.values()][0].status).toBe("failed");
    state.visible = true;
    await processTopicsExecution({
      projectId: "project",
      executionId: "hidden",
    });
    expect([...state.runs.values()].at(-1)?.status).toBe("completed");
    expect(state.numeric).toHaveBeenCalledTimes(2);
  });
});
