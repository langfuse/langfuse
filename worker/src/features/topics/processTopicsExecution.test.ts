import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  TopicAssignment,
  TopicExecution,
  TopicFacetVersion,
  TopicRun,
  TopicSummary,
} from "@langfuse/shared/topics";
import { topicProcessingConfigSchema } from "@langfuse/shared/topics";
import { topicProviderError } from "./provider-error";

const state = vi.hoisted(() => ({
  artifacts: new Map<string, unknown>(),
  executions: new Map<string, TopicExecution>(),
  summaries: new Map<string, TopicSummary>(),
  runs: new Map<string, TopicRun>(),
  assignments: new Map<string, TopicAssignment>(),
  facets: new Map<string, TopicFacetVersion>(),
  events: [] as string[],
  visible: true,
  sourceUnavailable: false,
  sourceFailures: new Set<string>(),
  sourceSuffix: "",
  summarize: vi.fn(),
  embed: vi.fn(),
  name: vi.fn(),
  numeric: vi.fn(),
}));
const facet: TopicFacetVersion = {
  id: "facet-version",
  projectId: "project",
  facetId: "facet",
  version: 1,
  prompt: "Describe the interaction intent.",
  processingConfig: topicProcessingConfigSchema.parse({}),
  createdAt: "2026-01-01T00:00:00.000Z",
};

vi.mock("@langfuse/shared/topics/server", () => ({
  isTopicsEnabled: () => true,
  loadTopicTranscript: async ({ traceId }: { traceId: string }) => {
    state.events.push(`load:${traceId}`);
    if (state.sourceUnavailable || state.sourceFailures.delete(traceId))
      throw new Error("Source trace unavailable");
    const blockId = `${traceId}:input`;
    return {
      traceTimestamp: "2026-01-01T00:00:00.000Z",
      snapshotHash: traceId + state.sourceSuffix,
      transcript: {
        inputHash: traceId + state.sourceSuffix,
        text: JSON.stringify({
          blockId,
          observationId: traceId,
          source: "input",
          text: traceId + state.sourceSuffix,
        }),
        sourceReferences: [{ blockId, source: "input" }],
        coverage: {},
      },
    };
  },
  readTopicExecution: async (_project: string, id: string) =>
    state.executions.get(id) ?? null,
  writeTopicExecution: async (execution: TopicExecution) => {
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
    input: Pick<
      TopicRun,
      "id" | "projectId" | "facetVersionId" | "summaryIds" | "config"
    >,
  ) => {
    if (state.runs.has(input.id)) return state.runs.get(input.id);
    const run: TopicRun = {
      ...input,
      runSequence: String(state.runs.size + 1),
      status: "pending",
      phase: "pending",
      publishedAt: null,
      startedAt: null,
      createdAt: new Date().toISOString(),
      finishedAt: null,
      manifestPath: "manifest",
      artifactPath: "",
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
  getLatestFacetSummaries: async (
    _project: string,
    facetId: string,
    facetVersionId: string,
  ) => {
    const latest = new Map<string, TopicSummary>();
    for (const row of state.summaries.values()) {
      if (
        row.facetId !== facetId ||
        row.facetVersionId !== facetVersionId ||
        row.state === "summarized"
      )
        continue;
      const prior = latest.get(row.traceId);
      if (!prior || BigInt(row.revision) >= BigInt(prior.revision))
        latest.set(row.traceId, row);
    }
    return [...latest.values()];
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
  nameTopicGroups: (...args: unknown[]) => state.name(...args),
}));
vi.mock("./numeric", () => ({
  TOPICS_NUMERIC_VERSION: "test-current",
  topicClusterSettings: (exploratory: boolean) => ({
    minimumCount: exploratory ? 10 : 100,
    minClusterSize: exploratory ? 3 : 15,
    minSamples: 5,
  }),
  runTopicClustering: (...args: unknown[]) => state.numeric(...args),
}));

import { processTopicsExecution } from "./processTopicsExecution";

function execution(
  id: string,
  count: number,
  operation: "discover" | "assign" | "refresh" = "discover",
  facets = [facet],
  embeddingDimensions = 16,
): TopicExecution {
  facets.forEach((selected) => state.facets.set(selected.id, selected));
  const input = {
    projectId: "project",
    requestId: id,
    facetVersionIds: facets.map((selected) => selected.id),
    exploratory: false,
    embeddingConfig: {
      embeddingModel: "text-embedding-3-small" as const,
      embeddingDimensions,
    },
    forceRefresh: false,
    traceIds: Array.from({ length: count }, (_, i) => `trace${i}`),
  };
  return {
    id,
    projectId: "project",
    revision: String(state.executions.size + 1),
    input:
      operation !== "assign"
        ? { ...input, operation }
        : {
            ...input,
            operation,
            targetRunIds: { [facet.id]: [...state.runs.keys()][0] },
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
  };
}

beforeEach(() => {
  state.artifacts.clear();
  state.executions.clear();
  state.summaries.clear();
  state.runs.clear();
  state.assignments.clear();
  state.facets.clear();
  state.events.length = 0;
  state.visible = true;
  state.sourceUnavailable = false;
  state.sourceFailures.clear();
  state.sourceSuffix = "";
  state.summarize
    .mockReset()
    .mockImplementation(async (_context, _facet, text: string) => {
      const block = text
        .split("\n")
        .map((line) => JSON.parse(line))
        .find((line) => line.source === "input");
      return {
        output: {
          status: "applicable",
          summary: block.observationId,
          evidenceBlockIds: [block.blockId],
        },
        inputTokens: 50,
        outputTokens: 20,
        costUsd: 0.00002,
      };
    });
  state.embed
    .mockReset()
    .mockImplementation(
      async (_context, summary: string, dimensions: number) => {
        const i = Number(summary.replace("trace", ""));
        const embedding = Array.from({ length: dimensions }, () => 0);
        if (i === 101) embedding[2] = 1;
        else {
          embedding[i < 50 || i === 100 ? 0 : 1] = 1;
          embedding[3] = Math.sin(i) * 0.03;
        }
        return { embedding, inputTokens: 10, costUsd: 0.000001 };
      },
    );
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
      async (
        _context,
        input: { groups: { id: string; members: { id: string }[] }[] },
      ) => ({
        output: {
          labels: input.groups.map((group) => ({
            id: group.id,
            name: `Topic ${group.id.slice(0, 8)}`,
            description: "Observed member interactions.",
            evidenceSummaryIds: [group.members[0].id],
          })),
        },
        inputTokens: 50,
        outputTokens: 20,
        costUsd: 0.00002,
      }),
    );
});

describe("Topics execution", () => {
  const issues = { ...facet, id: "issues-version", facetId: "issues" };

  it("keeps paid results in their domain tables and resumes accepted cluster labels", async () => {
    state.executions.set("durable", execution("durable", 100));
    const naming = state.name.getMockImplementation()!;
    state.name.mockImplementationOnce(naming).mockRejectedValueOnce(new Error("Naming unavailable"));
    await processTopicsExecution({ projectId: "project", executionId: "durable" });
    const run = [...state.runs.values()][0];
    expect(run.topics).toHaveLength(1);
    expect(run.topics[0].metadata).not.toHaveProperty("namingEvidence");
    expect([...state.artifacts.keys()].some((key) => /\/(summary|complete|call|embedding|evidence|continuity|assignments|no-topic)-/.test(key))).toBe(false);
    state.sourceUnavailable = true;
    await processTopicsExecution({ projectId: "project", executionId: "durable" });
    expect(state.name).toHaveBeenCalledTimes(3);
    expect(state.summarize).toHaveBeenCalledTimes(100);
    expect(state.executions.get("durable")?.status).toBe("completed");
    expect([...state.assignments.values()].every((row) => row.executionId === "durable" && row.coordinates?.length === 2)).toBe(true);
  });

  it("accumulates small refresh batches and retains topic identities on a forced refresh", async () => {
    const first = execution("refresh-first", 60, "refresh");
    state.executions.set(first.id, first);
    await processTopicsExecution({
      projectId: "project",
      executionId: first.id,
    });
    expect(state.executions.get(first.id)?.facets[0].outcome).toBe(
      "insufficient_data",
    );
    const second = execution("refresh-second", 40, "refresh");
    if (second.input.operation === "refresh")
      second.input.traceIds = Array.from(
        { length: 40 },
        (_, i) => `trace${60 + i}`,
      );
    state.executions.set(second.id, second);
    await processTopicsExecution({
      projectId: "project",
      executionId: second.id,
    });
    expect(state.executions.get(second.id)?.facets[0].counts.complete).toBe(
      100,
    );
    const original = [...state.runs.values()].find((run) => run.publishedAt)!;
    expect(original).toBeDefined();
    const third = execution("refresh-third", 1, "refresh");
    third.input.forceRefresh = true;
    state.executions.set(third.id, third);
    await processTopicsExecution({
      projectId: "project",
      executionId: third.id,
    });
    const refreshed = [...state.runs.values()]
      .filter((run) => run.publishedAt)
      .at(-1)!;
    expect(refreshed.id).not.toBe(original.id);
    expect(refreshed.topics.map((t) => t.topicId).sort()).toEqual(
      original.topics.map((t) => t.topicId).sort(),
    );
    expect(refreshed.topics[0].topicVersionId).not.toBe(
      original.topics[0].topicVersionId,
    );
    expect(state.summarize).toHaveBeenCalledTimes(100);
    expect(state.embed).toHaveBeenCalledTimes(100);
  });

  it("clears a previous assignment when a facet becomes non-applicable", async () => {
    state.executions.set("clear-first", execution("clear-first", 100));
    await processTopicsExecution({
      projectId: "project",
      executionId: "clear-first",
    });
    const before = [...state.assignments.values()].find(
      (row) => row.traceId === "trace0",
    )!;
    expect(before.topicId).toBeTruthy();
    state.sourceSuffix = "changed";
    state.summarize.mockResolvedValueOnce({
      output: { status: "not_applicable", summary: "", evidenceBlockIds: [] },
      inputTokens: 10,
      outputTokens: 10,
      costUsd: 0,
    });
    state.executions.set(
      "clear-second",
      execution("clear-second", 1, "refresh"),
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

  it("changes embedding dimensions without changing the facet or repeating summary inference", async () => {
    state.executions.set("dims-first", execution("dims-first", 1));
    await processTopicsExecution({
      projectId: "project",
      executionId: "dims-first",
    });
    expect(
      state.events.filter((event) => event.startsWith("write-summary:")),
    ).toEqual(["write-summary:complete"]);
    const second = execution("dims-second", 1);
    second.input.embeddingConfig.embeddingDimensions = 32;
    state.executions.set(second.id, second);
    await processTopicsExecution({
      projectId: "project",
      executionId: second.id,
    });
    expect(state.summarize).toHaveBeenCalledTimes(1);
    expect(state.embed.mock.calls.map((call) => call[2])).toEqual([16, 32]);
    expect(
      state.events.filter((event) => event.startsWith("write-summary:")),
    ).toEqual(["write-summary:complete", "write-summary:complete"]);
    expect(
      new Set([...state.summaries.values()].map((row) => row.facetVersionId)),
    ).toEqual(new Set([facet.id]));
  });

  it("processes more than 1000 traces without losing assignments", async () => {
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
    expect(state.assignments.size).toBe(1002);
    expect(state.numeric.mock.calls[0][0]).toHaveLength(1002);
  });

  it("assigns a small new batch without reclustering and re-embeds the full cohort on a configuration change", async () => {
    state.executions.set("grow-first", execution("grow-first", 100, "refresh"));
    await processTopicsExecution({
      projectId: "project",
      executionId: "grow-first",
    });
    const next = execution("grow-second", 1, "refresh");
    if (next.input.operation === "refresh") next.input.traceIds = ["trace100"];
    state.executions.set(next.id, next);
    await processTopicsExecution({
      projectId: "project",
      executionId: next.id,
    });
    expect(state.executions.get(next.id)?.facets[0].outcome).toBe("assigned");
    expect(state.numeric).toHaveBeenCalledTimes(1);
    const dimensions = execution("grow-dimensions", 1, "refresh", [facet], 32);
    state.executions.set(dimensions.id, dimensions);
    await processTopicsExecution({
      projectId: "project",
      executionId: dimensions.id,
    });
    expect(state.executions.get(dimensions.id)?.status).toBe("completed");
    expect(state.numeric).toHaveBeenCalledTimes(2);
    expect(state.numeric.mock.calls[1][0]).toHaveLength(101);
    expect(
      state.numeric.mock.calls[1][0].every((v: number[]) => v.length === 32),
    ).toBe(true);
    expect(state.summarize).toHaveBeenCalledTimes(101);
  });

  it("writes outlier assignments when a successful refresh finds no topics", async () => {
    state.executions.set(
      "empty-first",
      execution("empty-first", 100, "refresh"),
    );
    await processTopicsExecution({
      projectId: "project",
      executionId: "empty-first",
    });
    state.numeric.mockResolvedValueOnce({
      status: "no_topics",
      labels: Array(100).fill(-1),
      coordinates: Array(100).fill([0, 0]),
    });
    const empty = execution("empty-second", 1, "refresh");
    empty.input.forceRefresh = true;
    state.executions.set(empty.id, empty);
    await processTopicsExecution({
      projectId: "project",
      executionId: empty.id,
    });
    expect(state.executions.get(empty.id)?.status).toBe("completed");
    const run = [...state.runs.values()].filter((r) => r.publishedAt).at(-1)!;
    expect(run.topics).toEqual([]);
    expect(
      [...state.assignments.values()].filter((a) => a.runId === run.id),
    ).toHaveLength(100);
    expect(
      [...state.assignments.values()]
        .filter((a) => a.runId === run.id)
        .every((a) => a.outcome === "outlier"),
    ).toBe(true);
    const next = execution("empty-third", 1, "refresh");
    if (next.input.operation === "refresh") next.input.traceIds = ["trace100"];
    state.executions.set(next.id, next);
    await processTopicsExecution({
      projectId: "project",
      executionId: next.id,
    });
    expect(state.executions.get(next.id)?.facets[0].runId).toBe(run.id);
    expect(
      [...state.assignments.values()].some(
        (a) =>
          a.traceId === "trace100" &&
          a.runId === run.id &&
          a.outcome === "outlier",
      ),
    ).toBe(true);
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
    const originalId = [...state.summaries.keys()][0];
    state.executions.set(
      "other-dimensions",
      execution("other-dimensions", 1, "discover", [facet], 32),
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
    expect(state.summarize).toHaveBeenCalledTimes(1);
  });

  it("records cached source reversions as the current summary for subsequent refreshes", async () => {
    state.executions.set("snapshot-x", execution("snapshot-x", 1, "refresh"));
    await processTopicsExecution({
      projectId: "project",
      executionId: "snapshot-x",
    });
    state.sourceSuffix = "y";
    state.executions.set("snapshot-y", execution("snapshot-y", 1, "refresh"));
    await processTopicsExecution({
      projectId: "project",
      executionId: "snapshot-y",
    });
    state.sourceSuffix = "";
    state.executions.set(
      "snapshot-x-again",
      execution("snapshot-x-again", 1, "refresh"),
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
    const next = execution("snapshot-next", 1, "refresh");
    if (next.input.operation === "refresh") next.input.traceIds = ["trace1"];
    state.executions.set(next.id, next);
    await processTopicsExecution({
      projectId: "project",
      executionId: next.id,
    });
    expect(state.executions.get(next.id)!.facets[0].summaryIds).toContain(
      restored.id,
    );
  });

  it("shares one in-memory source per trace across facets even when source changes during processing", async () => {
    const pending = execution("shared-transcript", 2, "discover", [
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
    expect(calls.map((call) => JSON.parse(call[2]).observationId)).toEqual([
      "trace0",
      "trace0",
      "trace1",
      "trace1",
    ]);
    expect(calls[0].slice(2)).toEqual(calls[1].slice(2));
    expect(calls[2].slice(2)).toEqual(calls[3].slice(2));
    for (const traceId of ["trace0", "trace1"]) {
      const summaries = [...state.summaries.values()].filter(
        (row) => row.traceId === traceId,
      );
      expect(summaries).toHaveLength(2);
      expect(summaries[0].inputHash).toBe(summaries[1].inputHash);
    }
    const persisted = JSON.stringify([...state.artifacts.values()]);
    for (const call of calls)
      expect(persisted).not.toContain(JSON.stringify(call[2]));
  });

  it("shares a failed source read across facets and still processes the next trace", async () => {
    const pending = execution("shared-source-failure", 2, "discover", [
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
      const pending = execution("shared-resume", 1, "discover", [
        facet,
        issues,
      ]);
      state.embed.mockRejectedValueOnce(
        topicProviderError({ statusCode: 503 }),
      );
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
      expect(state.summarize).toHaveBeenCalledTimes(changed ? 1 : 2);
      expect([...state.summaries.values()].map((row) => row.inputHash)).toEqual(
        ["trace0", ...(changed ? [] : ["trace0"])],
      );
    },
  );

  it("records an oversized trace and continues processing the remaining cohort", async () => {
    const pending = execution("input-limit", 3, "discover", [facet, issues]);
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

  it("fits discovery and reclustering in the same canonical manifest order", async () => {
    const first = execution("ordered-discovery", 100);
    if (first.input.operation !== "discover")
      throw new Error("Invalid fixture");
    first.input.traceIds.reverse();
    state.executions.set(first.id, first);
    await processTopicsExecution({
      projectId: "project",
      executionId: first.id,
    });

    const recluster = execution("ordered-recluster", 0);
    recluster.input = {
      projectId: "project",
      requestId: recluster.id,
      operation: "recluster",
      facetVersionIds: [facet.id],
      exploratory: false,
      embeddingConfig: {
        embeddingModel: "text-embedding-3-small",
        embeddingDimensions: 16,
      },
      forceRefresh: false,
      sourceExecutionIds: [first.id],
    };
    state.executions.set(recluster.id, recluster);
    await processTopicsExecution({
      projectId: "project",
      executionId: recluster.id,
    });

    expect(state.executions.get(recluster.id)?.status).toBe("completed");
    expect(state.numeric.mock.calls[0][0]).toEqual(
      state.numeric.mock.calls[1][0],
    );
    const [discoveryRun, reclusterRun] = [...state.runs.values()];
    expect(discoveryRun.summaryIds).toEqual(reclusterRun.summaryIds);
    expect(
      discoveryRun.summaryIds.map((id) => state.summaries.get(id)!.traceId),
    ).toEqual([...first.input.traceIds].sort());
    expect(
      discoveryRun.summaryIds.map((id) => state.summaries.get(id)!.embedding),
    ).toEqual(state.numeric.mock.calls[0][0]);
    expect(state.summarize).toHaveBeenCalledTimes(100);
    expect(state.embed).toHaveBeenCalledTimes(100);
  });

  it("resumes a frozen cohort without admitting previously failed traces", async () => {
    state.summarize.mockRejectedValueOnce(new Error("Source read failed"));
    state.numeric.mockRejectedValueOnce(
      new Error("Numerical stage interrupted"),
    );
    const pending = execution("frozen-cohort", 101);
    state.executions.set(pending.id, pending);
    await processTopicsExecution({
      projectId: "project",
      executionId: pending.id,
    });
    const first = state.executions.get(pending.id)!;
    expect(first.facets[0].outcome).toBe("failed");
    expect(first.facets[0].counts).toMatchObject({ complete: 100, failed: 1 });
    const acceptedIds = [...first.facets[0].summaryIds];
    const run = [...state.runs.values()][0];
    const startedAt = run.startedAt;
    state.executions.get(pending.id)!.status = "queued";
    await processTopicsExecution({
      projectId: "project",
      executionId: pending.id,
    });

    const resumed = state.executions.get(pending.id)!;
    expect(resumed.status).toBe("completed_with_errors");
    expect(resumed.facets[0].outcome).toBe("published");
    expect(resumed.facets[0].counts).toMatchObject({
      complete: 100,
      failed: 1,
    });
    expect(resumed.facets[0].summaryIds).toEqual(acceptedIds);
    expect(state.summarize).toHaveBeenCalledTimes(101);
    expect(state.numeric.mock.calls[1][0]).toEqual(
      state.numeric.mock.calls[0][0],
    );
    expect(state.runs.get(run.id)).toMatchObject({
      startedAt,
      status: "completed",
      error: null,
    });
  });

  it("resumes an accepted summary without source data or another summary call", async () => {
    state.embed.mockRejectedValueOnce(topicProviderError({ statusCode: 503 }));
    state.executions.set("resume", execution("resume", 1));
    await processTopicsExecution({
      projectId: "project",
      executionId: "resume",
    });
    expect(state.executions.get("resume")?.status).toBe("failed");
    const [saved] = [...state.summaries.values()];
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
    ).toEqual(["write-summary:summarized", "write-summary:complete"]);
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
  it("reuses unchanged inputs across executions but rejects stale prompt identities", async () => {
    state.executions.set("original", execution("original", 1));
    await processTopicsExecution({
      projectId: "project",
      executionId: "original",
    });
    const firstIds = state.executions.get("original")!.facets[0].summaryIds;
    state.executions.set("cached", execution("cached", 1));
    await processTopicsExecution({
      projectId: "project",
      executionId: "cached",
    });
    expect(state.executions.get("cached")!.facets[0].summaryIds).toEqual(
      firstIds,
    );
    expect(state.summarize).toHaveBeenCalledTimes(1);
    expect(state.embed).toHaveBeenCalledTimes(1);
    expect(
      [...state.artifacts.keys()].some((key) =>
        /\/(snapshot|projection)-/.test(key),
      ),
    ).toBe(false);
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

  it("reuses paid summaries across dimension-only facet versions and preserves historical vectors", async () => {
    state.executions.set(
      "dimensions-original",
      execution("dimensions-original", 1),
    );
    await processTopicsExecution({
      projectId: "project",
      executionId: "dimensions-original",
    });
    const original = structuredClone([...state.summaries.values()][0]);
    const updated = {
      ...facet,
      id: "dimensions-v2",
      version: 2,
      createdAt: "2026-01-02T00:00:00.000Z",
    };
    state.executions.set(
      "dimensions-updated",
      execution("dimensions-updated", 1, "discover", [updated], 32),
    );
    await processTopicsExecution({
      projectId: "project",
      executionId: "dimensions-updated",
    });

    expect(state.summarize).toHaveBeenCalledTimes(1);
    expect(state.embed.mock.calls.map((call) => call[2])).toEqual([16, 32]);
    const target = [...state.summaries.values()].find(
      (row) => row.facetVersionId === updated.id,
    )!;
    expect(target).toMatchObject({
      facetId: facet.facetId,
      facetVersionId: updated.id,
      facetVersion: 2,
      executionId: "dimensions-updated",
      state: "complete",
      summary: original.summary,
      inputHash: original.inputHash,
      inputTokens: 0,
      outputTokens: 0,
      summaryCostUsd: 0,
      metadata: {
        summaryReusedFromId: original.id,
        evidenceBlockIds: original.metadata.evidenceBlockIds,
      },
    });
    expect(target.embedding).toHaveLength(32);
    expect(target.id).not.toBe(original.id);
    expect(state.summaries.get(original.id)).toEqual(original);

    const reverted = { ...facet, id: "dimensions-v3", version: 3 };
    state.executions.set(
      "dimensions-reverted",
      execution("dimensions-reverted", 1, "discover", [reverted]),
    );
    await processTopicsExecution({
      projectId: "project",
      executionId: "dimensions-reverted",
    });
    const reused = [...state.summaries.values()].find(
      (row) => row.facetVersionId === reverted.id,
    )!;
    expect(reused.embedding).toEqual(original.embedding);
    expect(reused.embeddingCostUsd).toBe(0);
    expect(reused.metadata.embeddingReusedFromId).toBe(original.id);
    expect(state.summarize).toHaveBeenCalledTimes(1);
    expect(state.embed).toHaveBeenCalledTimes(2);
  });

  it("resumes re-embedding a reused summary without source data or summary inference", async () => {
    state.executions.set("reuse-source", execution("reuse-source", 1));
    await processTopicsExecution({
      projectId: "project",
      executionId: "reuse-source",
    });
    const updated = {
      ...facet,
      id: "reuse-v2",
      version: 2,
    };
    state.executions.set(
      "reuse-resume",
      execution("reuse-resume", 1, "discover", [updated], 32),
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
      [...state.summaries.values()].find(
        (row) => row.facetVersionId === updated.id,
      )?.embedding,
    ).toHaveLength(32);
  });

  it("reuses non-applicable summaries after a dimension change without embedding", async () => {
    state.summarize.mockResolvedValueOnce({
      output: { status: "not_applicable", summary: "", evidenceBlockIds: [] },
      inputTokens: 50,
      outputTokens: 20,
      costUsd: 0.00002,
    });
    state.executions.set("non-applicable", execution("non-applicable", 1));
    await processTopicsExecution({
      projectId: "project",
      executionId: "non-applicable",
    });
    const updated = {
      ...facet,
      id: "non-applicable-v2",
      version: 2,
    };
    state.executions.set(
      "non-applicable-reuse",
      execution("non-applicable-reuse", 1, "discover", [updated], 32),
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

  it.each([
    { label: "prompt", change: { prompt: "Describe the issue." } },
    { label: "facet", change: { facetId: "different-facet" } },
    {
      label: "guidance",
      change: {
        processingConfig: {
          ...facet.processingConfig,
          projection: "issues" as const,
        },
      },
    },
    {
      label: "token limits",
      change: {
        processingConfig: { ...facet.processingConfig, maxOutputTokens: 64 },
      },
    },
  ])("does not reuse a summary after changing $label", async ({ change }) => {
    state.executions.set("recipe-source", execution("recipe-source", 1));
    await processTopicsExecution({
      projectId: "project",
      executionId: "recipe-source",
    });
    const updated = { ...facet, ...change, id: "recipe-v2", version: 2 };
    state.executions.set(
      "recipe-updated",
      execution("recipe-updated", 1, "discover", [updated]),
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
      "insufficient_data",
    );
    expect(state.summarize).toHaveBeenCalledTimes(9);
    expect(state.numeric).not.toHaveBeenCalled();
    await processTopicsExecution({
      projectId: "project",
      executionId: "small",
    });
    expect(state.summarize).toHaveBeenCalledTimes(9);
  });

  it("rejects a target map without its embedding configuration", async () => {
    state.executions.set("A", execution("A", 100));
    await processTopicsExecution({ projectId: "project", executionId: "A" });
    const run = [...state.runs.values()][0];
    delete run.config.embeddingModel;
    state.executions.set("B", execution("B", 1, "assign"));

    await processTopicsExecution({ projectId: "project", executionId: "B" });

    expect(state.executions.get("B")?.facets[0]).toMatchObject({
      outcome: "failed",
      error: "Target map is incompatible with this facet version.",
    });
  });

  it("publishes after visible assignments, assigns batch B without rediscovery, and reclusters stored summaries", async () => {
    state.executions.set("A", execution("A", 100));
    await processTopicsExecution({ projectId: "project", executionId: "A" });
    expect(state.executions.get("A")?.status).toBe("completed");
    const first = [...state.runs.values()][0];
    expect(first.topics).toHaveLength(2);
    expect(state.events.at(-2)).toBe("read-assignments");
    expect(state.events.at(-1)).toBe("publish");
    const next = execution("B", 2, "assign");
    if (next.input.operation !== "assign") throw new Error("Invalid fixture");
    next.input.traceIds = ["trace100", "trace101"];
    state.executions.set("B", next);
    await processTopicsExecution({ projectId: "project", executionId: "B" });
    expect(state.executions.get("B")?.facets[0].counts).toMatchObject({
      assigned: 1,
      outlier: 1,
    });
    expect(state.numeric).toHaveBeenCalledTimes(1);
    expect(state.name).toHaveBeenCalledTimes(2);
    const recluster = execution("C", 0);
    recluster.input = {
      projectId: "project",
      requestId: "C",
      operation: "recluster",
      facetVersionIds: [facet.id],
      exploratory: false,
      embeddingConfig: {
        embeddingModel: "text-embedding-3-small",
        embeddingDimensions: 16,
      },
      forceRefresh: false,
      sourceExecutionIds: ["A", "B"],
    };
    state.executions.set("C", recluster);
    await processTopicsExecution({ projectId: "project", executionId: "C" });
    expect(state.executions.get("C")?.status).toBe("completed");
    expect(state.numeric).toHaveBeenCalledTimes(2);
    expect(state.summarize).toHaveBeenCalledTimes(102);
    expect(state.embed).toHaveBeenCalledTimes(102);
    expect([...state.runs.values()][1].summaryIds).toHaveLength(102);
  });

  it("keeps an unpublished map until memberships are visible, reusing its accepted fit", async () => {
    state.visible = false;
    state.executions.set("hidden", execution("hidden", 100));
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
    state.executions.set("published", execution("published", 100));
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
    const batch = execution("assignment-resume", 2, "assign");
    if (batch.input.operation !== "assign") throw new Error("Invalid fixture");
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
