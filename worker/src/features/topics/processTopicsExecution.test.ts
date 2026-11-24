import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  TopicAssignment,
  TopicEmbeddingConfig,
  TopicExecution,
  TopicFacetVersion,
  TopicFacetRef,
  TopicRun,
  TopicSummary,
  TopicTimeRange,
} from "@langfuse/shared/topics";
import { getTopicClusteringSummaries } from "@langfuse/shared/topics/server";
import {
  recordIncrement,
  TOPICS_TEXT_VERSION,
} from "@langfuse/shared/src/server";
import { topicExecutionInputSchema } from "@langfuse/shared/topics";
import { TopicsProviderUnavailable } from "./provider-error";
const { topicSourceKey } = vi.hoisted(() => ({
  topicSourceKey: (
    row: Pick<
      TopicSummary,
      "projectId" | "facetId" | "facetVersion" | "traceId" | "sessionId"
    >,
  ) =>
    JSON.stringify([
      row.projectId,
      row.facetId,
      row.facetVersion,
      row.traceId ?? row.sessionId,
    ]),
}));
const state = vi.hoisted(() => ({
  executions: new Map<string, TopicExecution>(),
  summaries: new Map<string, TopicSummary>(),
  runs: new Map<string, TopicRun>(),
  assignments: new Map<string, TopicAssignment>(),
  facets: new Map<string, TopicFacetVersion>(),
  visible: true,
  resultReads: vi.fn(),
  assignmentWrites: vi.fn(),
  saveExecution: vi.fn(),
  name: vi.fn(),
  sampleNaming: false,
  numeric: vi.fn(),
}));
vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/src/server")>()),
  recordIncrement: vi.fn(),
  recordDistribution: vi.fn(),
}));
const facet: TopicFacetVersion = {
  projectId: "project",
  facetId: "facet",
  version: 1,
  prompt: "Describe the interaction intent.",
  createdAt: "2026-01-01T00:00:00.000Z",
};

vi.mock("@langfuse/shared/topics/server", () => {
  return {
    topicAnalysisCohort: async () => ({
      traces: { query: "SELECT '' AS id LIMIT 0", params: {} },
      sample: { seed: "seed", limit: 20_000 },
    }),
    getTopicTextResponseMetadata: () => undefined,
    isTopicsEnabled: () => true,
    // A refit's rule selects every trace.
    getTopicRule: async () => ({ filter: [] }),
    getTopicsModels: async () => {
      const slot = (name: string, model: string) => ({
        slot: name,
        provider: "openai",
        adapter: "openai",
        model,
        connection: { secretKey: "encrypted" },
      });
      return {
        projectId: "project",
        enabled: true,
        summary: slot("summary", "gpt-4.1-nano"),
        embedding: {
          ...slot("embedding", "eu.cohere.embed-v4:0"),
          dimensions: 256,
        },
        clustering: slot("clustering", "gpt-5.6-terra"),
      };
    },
    readTopicExecutionSummary: async (_project: string, id: string) => {
      const execution = state.executions.get(id);
      return execution ? structuredClone(execution) : null;
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
    listTopicFacets: async () =>
      [...state.facets.values()].map((version) => ({
        id: version.facetId,
        projectId: version.projectId,
        name: version.facetId,
        description: "",
        isBuiltIn: false,
        versions: [version],
      })),
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
    // Maps written before rules belong to the rule.
    getTopicRuleMap: async (
      _project: string,
      ruleId: string,
      facetId: string,
    ) =>
      [...state.runs.values()]
        .filter(
          (run) =>
            run.status === "completed" &&
            run.facetId === facetId &&
            !run.batchActionId &&
            (run.ruleId ?? ruleId) === ruleId,
        )
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .at(-1) ?? null,
    getTopicClusteringSummaries: vi.fn(
      async (
        projectId: string,
        facetId: string,
        facetVersion: number,
        embeddingConfig: TopicEmbeddingConfig,
        timeRange: TopicTimeRange,
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
              row.embedding.length === embeddingConfig.embeddingDimensions &&
              inTimeRange(row, timeRange),
          )
          .sort((a, b) =>
            a.traceId < b.traceId ? -1 : a.traceId > b.traceId ? 1 : 0,
          ),
    ),
    getSampledTopicClusteringSummaries: async (
      projectId: string,
      facet: TopicFacetRef,
      embeddingConfig: TopicEmbeddingConfig,
      timeRange: TopicTimeRange,
    ) => ({
      timeRange,
      summaries: [...state.summaries.values()]
        .filter(
          (row) =>
            row.projectId === projectId &&
            row.facetId === facet.facetId &&
            row.facetVersion === facet.version &&
            row.traceId !== null &&
            row.state === "complete" &&
            row.embeddingModel === embeddingConfig.embeddingModel &&
            row.embedding.length === embeddingConfig.embeddingDimensions &&
            inTimeRange(row, timeRange),
        )
        .sort((a, b) => b.unitStartTime.localeCompare(a.unitStartTime)),
    }),
    getTopicRun: async (_project: string, id: string) =>
      state.runs.get(id) ?? null,
    readTopicRunTraceIds: async (
      projectId: string,
      facet: TopicFacetRef,
      runId: string,
      timeRange: TopicTimeRange,
    ) =>
      [...state.assignments.values()]
        .filter(
          (row) =>
            row.projectId === projectId &&
            row.facetId === facet.facetId &&
            row.facetVersion === facet.version &&
            row.runId === runId &&
            row.origin === "initial" &&
            row.traceId !== null &&
            inTimeRange(row, timeRange),
        )
        .map((row) => row.traceId),
    readTopicMapAssignments: async (
      projectId: string,
      facet: TopicFacetRef,
      runId: string,
      timeRange: TopicTimeRange,
    ) =>
      [...state.assignments.values()].filter(
        (row) =>
          row.projectId === projectId &&
          row.facetId === facet.facetId &&
          row.facetVersion === facet.version &&
          row.runId === runId &&
          row.origin === "initial" &&
          inTimeRange(row, timeRange),
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
      timeRange: TopicTimeRange,
    ) => {
      state.resultReads("assignments");
      if (!state.visible) return [];
      return [...state.assignments.values()].filter(
        (row) =>
          row.projectId === projectId &&
          row.facetId === facet.facetId &&
          row.facetVersion === facet.version &&
          row.runId === runId &&
          sources.some((source) => source.traceId === row.traceId) &&
          inTimeRange(row, timeRange),
      );
    },
  };
});
vi.mock("./models", () => ({
  prepareTopicNamingGroup: async (group: {
    members: { summary: string }[];
    contrasts: { id: string; summary: string }[];
  }) => {
    const members = state.sampleNaming
      ? group.members
          .toReversed()
          .filter((_, index) => index === 2 || index === 4)
      : group.members;
    return {
      // Citation IDs are opaque to the caller; packing can skip candidates.
      members: members.map((source, index) => ({
        id: state.sampleNaming ? `selected-${index}` : `m${index + 1}`,
        summary: source.summary,
        source,
      })),
      totalMemberCount: group.members.length,
      sampled: state.sampleNaming,
    };
  },
  nameTopicGroup: (_models: unknown, ...args: unknown[]) => state.name(...args),
}));
vi.mock("./numeric", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./numeric")>()),
  runTopicClustering: (...args: unknown[]) => state.numeric(...args),
}));

import {
  processTopicRuleRefit,
  processTopicUpdateExecution,
} from "./processTopicsExecution";

function inTimeRange(
  row: Pick<TopicSummary, "unitStartTime">,
  timeRange: TopicTimeRange,
) {
  const timestamp = new Date(row.unitStartTime);
  return timestamp >= timeRange.from && timestamp < timeRange.to;
}

/** Stores complete summaries; trace `i` embeds into group 0 below 50 (and at 100), else group 1. */
function seedSummaries(
  count: number,
  traceIds = Array.from({ length: count }, (_, i) => `trace${i}`),
  facets = [facet],
) {
  for (const selected of facets)
    for (const traceId of traceIds) {
      const i = Number(traceId.replace("trace", ""));
      const embedding = Array.from({ length: 256 }, () => 0);
      if (i === 101) embedding[2] = 1;
      else {
        embedding[i < 50 || i === 100 ? 0 : 1] = 1;
        embedding[3] = Math.sin(i) * 0.03;
      }
      const summary: TopicSummary = {
        projectId: "project",
        facetId: selected.facetId,
        facetVersion: selected.version,
        traceId,
        sessionId: "session",
        triggerType: "rule",
        ruleIds: [],
        executionId: null,
        unitStartTime: "2026-01-01T00:00:00.000Z",
        environment: "production",
        traceName: "Customer support",
        state: "complete",
        summary: traceId,
        embedding,
        transcriptId: "revision",
        transcriptVersion: TOPICS_TEXT_VERSION,
        transcriptBytes: 0,
        summaryModel: "gpt-4.1-nano",
        embeddingModel: "eu.cohere.embed-v4:0",
        providedUsageDetails: {},
        usageDetails: {},
        providedCostDetails: {},
        costDetails: {},
        processedAt: new Date().toISOString(),
        metadata: {},
      };
      state.summaries.set(topicSourceKey(summary), summary);
    }
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

function execution(
  id: string,
  count: number,
  facets = [facet],
): TopicExecution & {
  input: Extract<TopicExecution["input"], { operation: "update" }>;
} {
  facets.forEach((selected) =>
    state.facets.set(`${selected.facetId}/${selected.version}`, selected),
  );
  const input = topicExecutionInputSchema.parse({
    projectId: "project",
    requestId: id,
    operation: "update",
    facets: facets.map(({ facetId, version }) => ({ facetId, version })),
    embeddingConfig: {
      embeddingModel: "eu.cohere.embed-v4:0",
      embeddingDimensions: 256,
    },
    timeRange: {
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: new Date("2026-01-08T00:00:00.000Z"),
    },
  });
  if (input.operation !== "update") throw new Error("Expected an update.");
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
      runId: pendingRun({
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
    error: null,
  };
}

async function updateSelection(id: string) {
  state.executions.set(id, execution(id, 0));
  await processTopicUpdateExecution({ projectId: "project", executionId: id });
}

beforeEach(() => {
  vi.resetAllMocks();
  state.executions.clear();
  state.summaries.clear();
  state.runs.clear();
  state.assignments.clear();
  state.facets.clear();
  state.visible = true;
  state.sampleNaming = false;
  state.numeric.mockImplementation(async (vectors: number[][]) => ({
    status: "complete",
    labels: vectors.map((vector) =>
      vector[0] > 0.5 ? 0 : vector[1] > 0.5 ? 1 : -1,
    ),
    coordinates: vectors.map((vector) => vector.slice(0, 2)),
  }));
  state.name.mockImplementation(
    async (group: { members: { id: string; summary: string }[] }) => ({
      output: {
        name: `Topic ${group.members[0].summary}`,
        description: "Observed member interactions.",
        evidenceSummaryIds: [group.members[0].id],
      },
    }),
  );
});

describe("Topics execution", () => {
  it("fails the pending discovery run when loading its cohort fails, preserving the published map", async () => {
    seedSummaries(100);
    await updateSelection("published");
    const published = [...state.runs.values()].at(-1)!;
    state.numeric.mockClear();
    state.name.mockClear();
    vi.mocked(getTopicClusteringSummaries).mockRejectedValueOnce(
      new Error("Clustering cohort exceeds capacity"),
    );

    await updateSelection("capacity-failure");

    const failed = state.executions.get("capacity-failure")!;
    expect(failed.status).toBe("completed_with_errors");
    expect(failed.facets[0].outcome).toBe("failed");
    expect(state.runs.get(failed.facets[0].runId!)).toMatchObject({
      status: "failed",
      error: "Clustering cohort exceeds capacity",
      finishedAt: expect.any(String),
    });
    expect(state.runs.get(published.id)).toEqual(published);
    expect(state.numeric).not.toHaveBeenCalled();
    expect(state.name).not.toHaveBeenCalled();
  });

  it("publishes filtered naming groups and later retries their labels without changing membership", async () => {
    const facets = [facet, { ...facet, facetId: "sibling" }];
    seedSummaries(100, undefined, facets);
    state.name.mockImplementationOnce(
      async (_group, _metadata, _conflict, onCost) => {
        onCost?.({ naming_input: 0.001, total: 0.001 });
        throw new TopicsProviderUnavailable(
          "The model filtered this response.",
          "content_filter",
        );
      },
    );
    state.executions.set("filtered", execution("filtered", 0, facets));

    await processTopicUpdateExecution({
      projectId: "project",
      executionId: "filtered",
    });

    const completed = state.executions.get("filtered")!;
    expect(completed).toMatchObject({
      status: "completed_with_errors",
      facets: [
        {
          outcome: "published",
          error: expect.any(String),
          counts: { assigned: 100, outlier: 0, failed: 0 },
        },
        {
          outcome: "published",
          error: null,
          counts: { assigned: 100, outlier: 0, failed: 0 },
        },
      ],
    });
    expect(state.name).toHaveBeenCalledTimes(4);
    const published = state.runs.get(completed.facets[0].runId!)!;
    expect(published.status).toBe("completed");
    expect(published.topics).toHaveLength(2);
    const placeholder = published.topics.find(
      (topic) => topic.metadata.namingFailure === "content_filter",
    )!;
    const named = published.topics.find((topic) => topic !== placeholder)!;
    expect(placeholder).toMatchObject({
      costDetails: { naming_input: 0.001, total: 0.001 },
      name: expect.any(String),
      description: expect.stringMatching(/filter/i),
    });
    expect(placeholder.name).not.toBe(named.name);
    // Definition readback must match after metadata passes through JSON storage.
    expect(JSON.parse(JSON.stringify(placeholder))).toStrictEqual(placeholder);
    const assignments = [...state.assignments.values()].filter(
      (row) => row.runId === published.id,
    );
    expect(assignments).toHaveLength(100);
    for (const topic of published.topics)
      expect(
        assignments.filter((row) => row.topicId === topic.topicId),
      ).toHaveLength(50);

    state.name.mockClear();
    await updateSelection("retry-label");

    expect(state.name).toHaveBeenCalledOnce();
    const retried = [...state.runs.values()].at(-1)!;
    expect(state.executions.get("retry-label")?.status).toBe("completed");
    expect(retried.topics).toContainEqual(named);
    const relabeled = retried.topics.find(
      (topic) => topic.topicId === placeholder.topicId,
    )!;
    expect(relabeled.metadata.namingFailure).toBeUndefined();
    expect(relabeled.topicVersionId).not.toBe(placeholder.topicVersionId);
    expect(relabeled.centroid).toEqual(placeholder.centroid);
    expect(relabeled.radius).toBe(placeholder.radius);
    const membership = (runId: string) =>
      [...state.assignments.values()]
        .filter((row) => row.runId === runId)
        .map(({ traceId, topicId }) => ({ traceId, topicId }));
    expect(membership(retried.id)).toEqual(membership(published.id));
  });

  it("restarts a failed update with fresh membership and naming while preserving the published map", async () => {
    seedSummaries(100);
    await updateSelection("published");
    const published = [...state.runs.values()].at(-1)!;
    for (const summary of state.summaries.values()) summary.embedding[4] = 0.75;
    const naming = state.name.getMockImplementation()!;
    state.name
      .mockImplementationOnce(naming)
      .mockRejectedValueOnce(
        new TopicsProviderUnavailable("Naming unavailable", "invalid_output"),
      );
    await updateSelection("retry");
    const failed = [...state.runs.values()].at(-1)!;
    expect(failed.status).toBe("failed");
    expect(state.runs.get(published.id)?.status).toBe("completed");
    seedSummaries(1, ["trace100"]);
    await processTopicUpdateExecution({
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

  it("keeps discovery and retry membership inside the frozen source-time window", async () => {
    seedSummaries(100);
    const summaries = [...state.summaries.values()];
    summaries[0].unitStartTime = "2025-12-31T23:59:59.999Z";
    summaries[1].unitStartTime = "2026-01-08T00:00:00.000Z";
    const pending = execution("bounded", 0);
    pending.input.minimumTraceCount = 3;
    state.executions.set(pending.id, pending);
    state.assignmentWrites.mockRejectedValueOnce(new Error("Insert failed"));

    await processTopicUpdateExecution({
      projectId: "project",
      executionId: pending.id,
    });
    expect(state.runs.get(pending.facets[0].runId!)?.status).toBe("failed");
    await processTopicUpdateExecution({
      projectId: "project",
      executionId: pending.id,
    });

    const published = [...state.runs.values()].at(-1)!;
    expect(published).toMatchObject({
      status: "completed",
      config: {
        timeRange: {
          from: "2026-01-01T00:00:00.000Z",
          to: "2026-01-08T00:00:00.000Z",
        },
      },
    });
    const assigned = [...state.assignments.values()].filter(
      (row) => row.runId === published.id,
    );
    expect(assigned).toHaveLength(98);
    expect(assigned.some((row) => row.traceId === summaries[0].traceId)).toBe(
      false,
    );
    expect(assigned.some((row) => row.traceId === summaries[1].traceId)).toBe(
      false,
    );
  });

  it.each([false, true])(
    "recovers completed maps after a lost acknowledgement (all outliers: %s)",
    async (outliers) => {
      seedSummaries(100);
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
      expect(state.assignments.size).toBe(100);
      expect([...state.assignments.values()][0].coordinates).toHaveLength(2);
      state.saveExecution.mockReset();
      await processTopicUpdateExecution({
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
    seedSummaries(100);
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

  it("maps sampled naming citations back to their scoped source references", async () => {
    state.sampleNaming = true;
    seedSummaries(100);
    await updateSelection("named");
    const topics = [...state.runs.values()].at(-1)!.topics;
    expect(topics).toHaveLength(2);
    for (const [index, [group]] of state.name.mock.calls.entries()) {
      const source = [...state.summaries.values()].find(
        (summary) => summary.summary === group.members[0].summary,
      )!;
      expect(topics[index].metadata).toMatchObject({
        effectiveMemberCount: 50,
        selectedMemberCount: 2,
        namingSampled: true,
      });
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

  it("fits a snapshot below the standard minimum as a small sample", async () => {
    seedSummaries(40);
    const snapshot = execution("snapshot", 0);
    snapshot.input.analysis = { label: "Snapshot", filter: [], seed: "seed" };
    state.executions.set("snapshot", snapshot);

    await processTopicUpdateExecution({
      projectId: "project",
      executionId: "snapshot",
    });

    expect(state.numeric).toHaveBeenCalled();
    expect([...state.runs.values()].at(-1)).toMatchObject({
      status: "completed",
      config: { exploratory: true, minimumCount: 10, analysis: true },
    });
  });

  it.each([0, 3])(
    "recovers a skipped cohort of %s after a lost progress acknowledgement",
    async (count) => {
      seedSummaries(count);
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
      await processTopicUpdateExecution({
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
    seedSummaries(100);
    for (const summary of state.summaries.values()) summary.embedding[3] = 0;
    await updateSelection("first");
    for (const topic of [...state.runs.values()].at(-1)!.topics) {
      topic.centroid[0] += Number.EPSILON;
      topic.radius += Number.EPSILON;
    }
    const first = structuredClone([...state.runs.values()].at(-1)!);
    seedSummaries(1, ["trace100"]);
    for (const summary of state.summaries.values()) summary.embedding[3] = 0;
    state.assignmentWrites.mockRejectedValueOnce(
      new Error("Temporary failure"),
    );
    await updateSelection("second");
    expect([...state.runs.values()].at(-1)?.status).toBe("failed");
    await processTopicUpdateExecution({
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
    seedSummaries(100);
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
    "creates a new version with the same stable identity, named with its previous name as context, when its %s changes",
    async (changed) => {
      seedSummaries(100);
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
      expect(state.name.mock.calls[2][0]).toMatchObject({
        previousTopic: { name: old.name, description: old.description },
      });
      expect(state.runs.get(first.id)).toEqual(first);
    },
  );

  it.each(["renamed", "repeated", "failed"] as const)(
    "publishes a changed definition whose name repeats a reused topic (retry %s)",
    async (retry) => {
      const persists = retry !== "renamed";
      seedSummaries(100);
      await updateSelection("first");
      const first = [...state.runs.values()].at(-1)!;
      const unchanged = first.topics.find((topic) => topic.centroid[1] > 0.5)!;
      for (const summary of state.summaries.values()) {
        if (summary.embedding[0] > 0.5) summary.embedding[4] = 0.75;
      }
      const colliding = {
        output: {
          name: unchanged.name,
          description: "A colliding name.",
          evidenceSummaryIds: ["m1"],
        },
      };
      state.name.mockImplementationOnce(
        async (_group, _metadata, _conflict, onCost) => {
          onCost?.({ naming_input: 0.1, naming_output: 0.02, total: 0.09 });
          return colliding;
        },
      );
      state.name.mockImplementationOnce(
        async (_group, _metadata, _conflict, onCost) => {
          onCost?.({ naming_input: 0.2, naming_cache_read: 0.01, total: 0.25 });
          if (retry === "failed") throw new Error("Invalid naming response");
          return retry === "repeated"
            ? colliding
            : { output: { ...colliding.output, name: "Distinct topic" } };
        },
      );
      const calls = state.name.mock.calls.length;
      await updateSelection("second");
      const [, conflictCall] = state.name.mock.calls.slice(calls);
      expect(conflictCall[2]).toMatchObject({
        name: unchanged.name,
        description: unchanged.description,
      });
      const second = [...state.runs.values()].at(-1)!;
      expect(second.topics).toContainEqual(unchanged);
      expect(
        second.topics.find((topic) => topic.createdByRunId === second.id)
          ?.costDetails,
      ).toEqual({
        naming_input: 0.3,
        naming_output: 0.02,
        naming_cache_read: 0.01,
        total: 0.34,
      });
      expect(second.status).toBe("completed");
      expect(
        second.topics.filter((topic) => topic.name === unchanged.name),
      ).toHaveLength(persists ? 2 : 1);
    },
  );

  it.each([
    { owner: "the setup snapshot", ruleId: null, continued: true },
    { owner: "another rule's map", ruleId: "other-rule", continued: false },
  ])(
    "fits a rule's first map from its scheduled run, continuing $owner only if no rule owns it",
    async ({ ruleId, continued }) => {
      seedSummaries(100);
      await updateSelection("published");
      const published = {
        ...[...state.runs.values()].at(-1)!,
        batchActionId: ruleId ? null : "setup",
        ruleId,
      };
      state.runs.set(published.id, published);
      state.runs.set("refit", {
        ...pendingRun({
          id: "refit",
          projectId: "project",
          facetId: facet.facetId,
          facetVersion: facet.version,
          config: {
            embeddingModel: "eu.cohere.embed-v4:0",
            dimensions: 256,
            timeRange: {
              from: "2026-01-01T00:00:00.000Z",
              to: "2026-01-08T00:00:00.000Z",
            },
          },
        }),
        ruleId: "rule",
      });
      state.name.mockClear();

      await processTopicRuleRefit({ projectId: "project", runId: "refit" });

      const refit = state.runs.get("refit")!;
      expect(refit).toMatchObject({ status: "completed", ruleId: "rule" });
      expect(recordIncrement).toHaveBeenCalledWith(
        "langfuse.topics.rule_fits",
        1,
        { outcome: "published", trigger: "automatic" },
      );
      const sameTopics = refit.topics.some((topic) =>
        published.topics.some((other) => other.topicId === topic.topicId),
      );
      expect(sameTopics).toBe(continued);
      if (continued) expect(state.name).not.toHaveBeenCalled();
      expect(
        [...state.assignments.values()].filter(
          (row) => row.runId === "refit" && row.origin === "initial",
        ),
      ).toHaveLength(100);
    },
  );

  it("bounds assignment writes and retries publication when a batch is not visible", async () => {
    seedSummaries(1);
    const template = [...state.summaries.values()][0];
    for (let index = 1; index < 2001; index++) {
      const summary = { ...template, traceId: `trace${index}` };
      state.summaries.set(topicSourceKey(summary), summary);
    }
    state.numeric.mockImplementation(async (vectors: number[][]) => ({
      status: "no_topics",
      labels: vectors.map(() => -1),
      coordinates: vectors.map(() => [0, 0]),
    }));
    state.assignmentWrites.mockImplementation(async () => {
      // A late visibility failure must prevent publication of the whole map.
      if (state.assignmentWrites.mock.calls.length === 3) state.visible = false;
    });
    await updateSelection("batched");
    expect(
      state.assignmentWrites.mock.calls.map(([rows]) => rows.length),
    ).toEqual([1000, 1000, 1]);
    expect([...state.runs.values()].at(-1)?.status).toBe("failed");
    expect(state.executions.get("batched")?.facets[0].error).toContain(
      "not fully visible",
    );
    state.visible = true;
    await processTopicUpdateExecution({
      projectId: "project",
      executionId: "batched",
    });
    expect([...state.runs.values()].at(-1)?.status).toBe("completed");
    expect(state.numeric).toHaveBeenCalledTimes(2);
  });
});
