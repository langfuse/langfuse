import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import type { Session } from "next-auth";
import type * as sharedServer from "@langfuse/shared/src/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  topicProcessingConfigSchema,
  topicEmbeddingConfigSchema,
  type TopicExecution,
  type TopicExecutionInput,
} from "@langfuse/shared/topics";

const mocks = vi.hoisted(() => ({
  createTopicExecution: vi.fn(),
  readTopicExecutionSummary: vi.fn(),
  readTopicExecutionTraceErrors: vi.fn(),
  getTopicSummaryCounts: vi.fn(),
  readTopicExecutionForRequest: vi.fn(),
  listTopicExecutions: vi.fn(),
  writeTopicExecution: vi.fn(),
  listTopicFacets: vi.fn(),
  readLatestTopicAssignments: vi.fn(),
  getLatestFacetSummaries: vi.fn(),
  getPublishedTopicRun: vi.fn(),
  getTopicDefinitions: vi.fn(),
  ensureDefaultTopicFacets: vi.fn(),
  getTopicFacetVersion: vi.fn(),
  createTopicFacet: vi.fn(),
  createTopicFacetVersion: vi.fn(),
  listTopicRules: vi.fn(),
  getTopicRule: vi.fn(),
  saveTopicRule: vi.fn(),
  listTopicRuns: vi.fn(),
  getTopicRun: vi.fn(),
  readTopicSummaries: vi.fn(),
  listTopicSummaries: vi.fn(),
  readTopicAssignments: vi.fn(),
  readTopicMapAssignments: vi.fn(),
  readTopicRunSummaryIds: vi.fn(),
  loadTopicTranscript: vi.fn(),
  isTopicsProjectEnabled: vi.fn(),
  enqueueTopicExecution: vi.fn(),
  getTopicExecutionQueueState: vi.fn(),
  queryClickhouse: vi.fn(),
}));
vi.mock("@langfuse/shared/topics/server", () => mocks);
vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof sharedServer>()),
  queryClickhouse: mocks.queryClickhouse,
}));
vi.mock("@/src/features/posthog-analytics/server/backendActivity", () => ({
  recordBackendActivity: vi.fn(async () => undefined),
}));

import { topicsRouter } from "@/src/features/topics/server/topicsRouter";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

const projectId = "project-a";
const facetVersionId = "facet-v1";
const input: Extract<TopicExecutionInput, { operation: "process" }> = {
  projectId,
  requestId: "request-a",
  operation: "process",
  facetVersionIds: [facetVersionId],
  traceIds: ["trace-a"],
  reuseExistingSummaries: false,
  processingConfig: topicProcessingConfigSchema.parse({}),
  embeddingConfig: topicEmbeddingConfigSchema.parse({}),
};

function caller(role: "ADMIN" | "VIEWER" = "ADMIN", langfuseTopics = true) {
  const session = {
    expires: "1",
    user: {
      id: "user-a",
      featureFlags: testFeatureFlags({ langfuseTopics }),
      organizations: [
        {
          id: "org-a",
          role,
          projects: [{ id: projectId, role }],
        },
      ],
    },
  } as Session;
  return topicsRouter.createCaller(
    createInnerTRPCContext({ session, headers: {} }),
  );
}

function execution(): TopicExecution {
  return {
    id: "execution-a",
    projectId,
    input: {
      projectId,
      requestId: "update-a",
      operation: "update",
      facetVersionIds: [facetVersionId],
      embeddingConfig: topicEmbeddingConfigSchema.parse({}),
      exploratory: false,
    },
    status: "completed",
    phase: "completed",
    createdAt: "2026-09-16T00:00:00Z",
    updatedAt: "2026-09-16T00:00:00Z",
    facets: [
      {
        facetVersionId,
        outcome: "published",
        summaryIds: ["summary-a"],
        runId: "run-a",
        error: null,
        counts: {
          requested: 1,
          complete: 1,
          nonApplicable: 0,
          insufficientInput: 0,
          failed: 0,
          assigned: 1,
          outlier: 0,
        },
      },
    ],
    traceErrors: [],
    error: null,
  };
}

const run = {
  id: "run-a",
  projectId,
  facetVersionId,
  status: "completed",
  publishedAt: "2026-09-16T00:00:00Z",
  metrics: { summaryCount: 1 },
  topics: [
    {
      topicId: "topic-a",
      name: "Refunds",
      description: "Refund requests",
      radius: 0.2,
      centroid: [0.1, 0.9],
      representativeSummaryIds: ["summary-a"],
    },
  ],
};
const summary = {
  id: "summary-a",
  projectId,
  traceId: "trace-a",
  sessionId: "parent-session",
  facetVersionId,
  state: "complete",
  summary: "Requests a refund",
  processedAt: "2026-09-16T00:00:00Z",
  embedding: [0.1, 0.9],
  executionId: "prior-execution",
  summaryModel: "gpt-4.1-nano",
  metadata: {},
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.queryClickhouse.mockResolvedValue([]);
  mocks.isTopicsProjectEnabled.mockReturnValue(true);
  mocks.getTopicFacetVersion.mockResolvedValue({
    id: facetVersionId,
    facetId: "facet-a",
    projectId,
  });
  mocks.readTopicExecutionSummary.mockResolvedValue(execution());
  mocks.getLatestFacetSummaries.mockResolvedValue([summary]);
  mocks.readTopicExecutionTraceErrors.mockResolvedValue({
    errors: [],
    expired: false,
  });
  mocks.readTopicExecutionForRequest.mockResolvedValue(null);
  mocks.createTopicExecution.mockResolvedValue(execution());
  mocks.getTopicRun.mockResolvedValue(run);
  mocks.listTopicRuns.mockResolvedValue([run]);
  mocks.readTopicSummaries.mockResolvedValue([summary]);
  mocks.readTopicAssignments.mockResolvedValue([
    {
      summaryId: summary.id,
      summaryProcessedAt: summary.processedAt,
      topicId: "topic-a",
    },
  ]);
});

describe("Topics feature access", () => {
  it("rejects reads, transcripts, and execution without an explicit opt-in", async () => {
    const disabled = caller("ADMIN", false);
    await expect(disabled.facets({ projectId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      disabled.transcript({ projectId, traceId: "trace-a" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(disabled.trigger(input)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mocks.listTopicFacets).not.toHaveBeenCalled();
    expect(mocks.loadTopicTranscript).not.toHaveBeenCalled();
    expect(mocks.createTopicExecution).not.toHaveBeenCalled();
    expect(mocks.enqueueTopicExecution).not.toHaveBeenCalled();
  });
});

describe("Topics project allowlist", () => {
  it("rejects triggers before reading or creating execution state", async () => {
    mocks.isTopicsProjectEnabled.mockReturnValue(false);
    await expect(caller().trigger(input)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Topics processing is not enabled for this project.",
    });
    expect(mocks.isTopicsProjectEnabled).toHaveBeenCalledWith(projectId);
    expect(mocks.readTopicExecutionForRequest).not.toHaveBeenCalled();
    expect(mocks.getTopicFacetVersion).not.toHaveBeenCalled();
    expect(mocks.queryClickhouse).not.toHaveBeenCalled();
    expect(mocks.createTopicExecution).not.toHaveBeenCalled();
    expect(mocks.enqueueTopicExecution).not.toHaveBeenCalled();
  });

  it("rejects retries before reading or changing execution state", async () => {
    mocks.isTopicsProjectEnabled.mockReturnValue(false);
    await expect(
      caller().retry({ projectId, executionId: "execution-a" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Topics processing is not enabled for this project.",
    });
    expect(mocks.isTopicsProjectEnabled).toHaveBeenCalledWith(projectId);
    expect(mocks.readTopicExecutionSummary).not.toHaveBeenCalled();
    expect(mocks.getTopicExecutionQueueState).not.toHaveBeenCalled();
    expect(mocks.writeTopicExecution).not.toHaveBeenCalled();
    expect(mocks.enqueueTopicExecution).not.toHaveBeenCalled();
  });

  it("keeps reads and facet configuration available when processing is disabled", async () => {
    mocks.isTopicsProjectEnabled.mockReturnValue(false);
    mocks.listTopicFacets.mockResolvedValue([]);
    mocks.ensureDefaultTopicFacets.mockResolvedValue([]);

    await expect(caller().facets({ projectId })).resolves.toEqual([]);
    await expect(caller().initialize({ projectId })).resolves.toEqual([]);
    expect(mocks.listTopicFacets).toHaveBeenCalledWith(projectId);
    expect(mocks.ensureDefaultTopicFacets).toHaveBeenCalledWith(projectId);
  });
});

describe("Topics filtered trace preview", () => {
  const selection = {
    projectId,
    filter: [],
    from: new Date("2026-09-15T00:00:00Z"),
    to: new Date("2026-09-16T00:00:00Z"),
    limit: 100,
    sampling: "random" as const,
    seed: "sample-seed",
  };

  it("selects distinct trace identities before counting and seeded sampling without loading I/O", async () => {
    mocks.queryClickhouse.mockResolvedValue([
      {
        id: "trace/a:1",
        timestampMs: "1789430400000",
        name: "Support agent",
        environment: "production",
        matchedTraceCount: "123",
      },
    ]);
    const response = await caller("VIEWER").previewTraces({
      ...selection,
      filter: [
        {
          column: "level",
          type: "stringOptions",
          operator: "any of",
          value: ["ERROR"],
        },
        {
          column: "tags",
          type: "arrayOptions",
          operator: "any of",
          value: ["billing"],
        },
      ],
    });
    expect(response).toMatchObject({
      matchedTraceCount: 123,
      selectedTraceCount: 100,
      traces: [
        {
          id: "trace/a:1",
          name: "Support agent",
          environment: "production",
          timestamp: new Date("2026-09-15T00:00:00Z"),
        },
      ],
    });
    const request = mocks.queryClickhouse.mock.calls[0][0];
    expect(request.query).toContain("GROUP BY m.id");
    expect(request.query.indexOf("GROUP BY m.id")).toBeLessThan(
      request.query.indexOf("count() OVER ()"),
    );
    expect(request.query).toContain(
      "cityHash64(t.id, {samplingSeed: String}) ASC, t.id ASC",
    );
    expect(request.query).toContain("e.level IN (");
    expect(request.query).toContain('e."tags"');
    expect(request.query).toContain("e.start_time >= {");
    expect(request.query).toContain("e.start_time < {");
    expect(request.query).toContain("e.trace_id != ''");
    expect(request.query).not.toMatch(
      /e\.(input|output)\b|\bFINAL\b|\bSAMPLE\b/,
    );
    expect(request.params).toMatchObject({
      projectId,
      limit: 100,
      samplingSeed: "sample-seed",
    });
    expect(request.preferredClickhouseService).toBe("EventsReadOnly");
  });

  it("bounds preview rows while counting all selected traces and preserving a larger explicit sample", async () => {
    const traces = Array.from({ length: 100 }, (_, index) => ({
      id: `trace-${index}`,
      timestampMs: "1789430400000",
      name: "Agent",
      environment: "default",
      matchedTraceCount: "1001",
    }));
    mocks.queryClickhouse.mockResolvedValue(traces);
    const response = await caller().previewTraces({
      ...selection,
      limit: null,
    });
    expect(response.traces).toHaveLength(100);
    expect(response.matchedTraceCount).toBe(1001);
    expect(response.selectedTraceCount).toBe(1001);
    expect(mocks.queryClickhouse.mock.calls[0][0].params.limit).toBe(100);
    await caller().previewTraces({ ...selection, limit: 10000 });
    expect(mocks.queryClickhouse.mock.calls[1][0].params.limit).toBe(100);
  });

  it("resolves filtered triggers on the server without a trace cap and excludes unchecked traces", async () => {
    mocks.createTopicExecution.mockImplementation(async (resolved) => ({
      ...execution(),
      input: resolved,
      status: "queued",
    }));
    mocks.queryClickhouse.mockResolvedValue(
      Array.from({ length: 1001 }, (_, index) => ({
        id: `trace-${index}`,
        timestampMs: "1789430400000",
        name: "Agent",
        environment: "default",
        matchedTraceCount: "1001",
      })),
    );
    const criteria = {
      filter: selection.filter,
      from: selection.from,
      to: selection.to,
      limit: selection.limit,
      sampling: selection.sampling,
      seed: selection.seed,
    };
    await caller().trigger({
      projectId,
      requestId: "filtered-request",
      operation: "process",
      facetVersionIds: [facetVersionId],
      selection: { ...criteria, limit: null, excludedTraceIds: ["trace-0"] },
    });
    const resolved = mocks.createTopicExecution.mock.calls[0][0];
    expect(resolved.traceIds).toHaveLength(1000);
    expect(resolved.traceIds[0]).toBe("trace-1");
    expect(resolved.traceIds.at(-1)).toBe("trace-1000");
    expect(mocks.enqueueTopicExecution).toHaveBeenCalledWith(
      projectId,
      "execution-a",
      "process",
      resolved.traceIds,
    );
    expect(resolved).not.toHaveProperty("selection");
    expect(resolved.traceSelection).toEqual({
      ...criteria,
      limit: null,
      excludedTraceIds: ["trace-0"],
    });
    expect(mocks.queryClickhouse.mock.calls[0][0].query).not.toContain("LIMIT");
    expect(mocks.queryClickhouse.mock.calls[0][0].params.samplingSeed).toBe(
      "sample-seed",
    );

    mocks.createTopicExecution.mockClear();
    mocks.queryClickhouse.mockResolvedValue([]);
    await expect(
      caller().trigger({
        projectId,
        requestId: "empty-request",
        operation: "process",
        facetVersionIds: [facetVersionId],
        selection: criteria,
      }),
    ).rejects.toThrow("No traces match this selection");
    expect(mocks.createTopicExecution).not.toHaveBeenCalled();
  });

  it("runs saved rules without creating facet versions and rejects stale or foreign rules", async () => {
    const rule = {
      id: "rule-a",
      projectId,
      name: "Billing",
      filter: selection.filter,
      sampling: selection.sampling,
      limit: selection.limit,
      facetIds: ["facet-a"],
    };
    const request = {
      projectId,
      requestId: "rule-request",
      operation: "process" as const,
      facetVersionIds: [facetVersionId],
      ruleId: rule.id,
      selection: {
        filter: selection.filter,
        from: selection.from,
        to: selection.to,
        limit: selection.limit,
        sampling: selection.sampling,
        seed: selection.seed,
      },
    };
    mocks.getTopicRule.mockResolvedValue(null);
    await expect(caller().trigger(request)).rejects.toThrow(
      "Topic rule not found in this project",
    );
    expect(mocks.getTopicRule).toHaveBeenCalledWith(projectId, rule.id);
    mocks.getTopicRule.mockResolvedValue({ ...rule, sampling: "latest" });
    await expect(caller().trigger(request)).rejects.toThrow(
      "Topic rule changed",
    );
    mocks.getTopicRule.mockResolvedValue({
      ...rule,
      facetIds: ["other-facet"],
    });
    await expect(caller().trigger(request)).rejects.toThrow(
      "Select the facets attached",
    );
    mocks.getTopicRule.mockResolvedValue(rule);
    mocks.queryClickhouse.mockResolvedValue([
      {
        id: "trace-a",
        timestampMs: "1789430400000",
        name: "Agent",
        environment: "default",
        matchedTraceCount: "1",
      },
    ]);
    await caller().trigger(request);
    expect(mocks.createTopicExecution.mock.calls[0][0]).toMatchObject({
      ruleId: rule.id,
      traceIds: ["trace-a"],
      traceSelection: { ...request.selection, excludedTraceIds: [] },
    });
    expect(mocks.createTopicFacetVersion).not.toHaveBeenCalled();
    mocks.readTopicExecutionForRequest.mockResolvedValue(execution());
    mocks.getTopicRule.mockClear();
    mocks.queryClickhouse.mockClear();
    await caller().trigger(request);
    expect(mocks.getTopicRule).not.toHaveBeenCalled();
    expect(mocks.queryClickhouse).not.toHaveBeenCalled();
  });

  it("orders latest traces after deduplication and returns an empty preview when no events match", async () => {
    expect(
      await caller().previewTraces({ ...selection, sampling: "latest" }),
    ).toMatchObject({ matchedTraceCount: 0, traces: [] });
    const query = mocks.queryClickhouse.mock.calls[0][0].query;
    expect(query).toContain("ORDER BY t.latest_match DESC, t.id ASC");
    expect(query).not.toContain("cityHash64");
  });

  it("reuses the frozen cohort for a retried filtered request without querying the selection again", async () => {
    const request = {
      projectId,
      requestId: "filtered-retry",
      operation: "process" as const,
      facetVersionIds: [facetVersionId],
      selection: {
        filter: selection.filter,
        from: selection.from,
        to: selection.to,
        limit: null,
        sampling: selection.sampling,
        seed: selection.seed,
      },
    };
    mocks.readTopicExecutionForRequest.mockResolvedValue(execution());
    expect(await caller().trigger(request)).toEqual({ id: "execution-a" });
    expect(mocks.queryClickhouse).not.toHaveBeenCalled();
    expect(mocks.createTopicExecution).not.toHaveBeenCalled();
    const firstHash = mocks.readTopicExecutionForRequest.mock.calls[0][2];
    await caller().trigger({
      ...request,
      selection: { ...request.selection, limit: 50 },
    });
    expect(mocks.readTopicExecutionForRequest.mock.calls[1][2]).not.toBe(
      firstHash,
    );
  });

  it("rejects invalid or foreign-project selection before querying storage", async () => {
    for (const invalid of [
      { ...selection, limit: 0 },
      { ...selection, from: selection.to },
      { ...selection, from: new Date("2025-01-01") },
      { ...selection, projectId: "foreign-project" },
    ])
      await expect(caller().previewTraces(invalid)).rejects.toBeDefined();
    await expect(
      caller("ADMIN", false).previewTraces(selection),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mocks.queryClickhouse).not.toHaveBeenCalled();
  });

  it("rejects unsupported filters instead of broadening the selected trace cohort", async () => {
    await expect(
      caller().previewTraces({
        ...selection,
        filter: [
          { column: "not-a-column", type: "string", operator: "=", value: "x" },
        ],
      }),
    ).rejects.toBeDefined();
    expect(mocks.queryClickhouse).not.toHaveBeenCalled();
  });
});

describe("Topics published scatter map", () => {
  const mapInput = { projectId, runId: "run-a" };
  const firstAssignment = {
    projectId,
    facetVersionId,
    runId: "run-a",
    origin: "initial",
    coordinates: [10, 11],
    summaryId: "summary-a",
    topicId: "topic-a",
  };
  beforeEach(() => {
    mocks.readTopicRunSummaryIds.mockResolvedValue(["summary-b", "summary-a"]);
    mocks.readTopicMapAssignments.mockResolvedValue([
      firstAssignment,
      {
        ...firstAssignment,
        summaryId: "summary-b",
        topicId: null,
        coordinates: [20, 21],
      },
    ]);
    mocks.getLatestFacetSummaries.mockResolvedValue([
      summary,
      { ...summary, id: "summary-b", traceId: "trace-b" },
    ]);
    mocks.readTopicAssignments.mockResolvedValue([]);
  });

  it("reads historical coordinates from the persisted cohort without transient execution state", async () => {
    mocks.getLatestFacetSummaries.mockResolvedValue([
      {
        ...summary,
        summary: "Latest refund summary",
        processedAt: "2026-09-17T00:00:00Z",
      },
      { ...summary, id: "summary-b", traceId: "trace-b" },
    ]);
    const map = await caller("VIEWER").map(mapInput);
    expect(map.status).toBe("ready");
    expect(map.points).toEqual([
      {
        summaryId: "summary-b",
        traceId: "trace-b",
        summary: summary.summary,
        topicId: null,
        outcome: "outlier",
        x: 20,
        y: 21,
      },
      {
        summaryId: "summary-a",
        traceId: "trace-a",
        summary: "Latest refund summary",
        topicId: "topic-a",
        outcome: "assigned",
        x: 10,
        y: 11,
      },
    ]);
    expect(mocks.readTopicMapAssignments).toHaveBeenCalledWith(
      projectId,
      "run-a",
    );
    expect(JSON.stringify(map)).not.toContain("embedding");
  });

  it("keeps assigned traces outside the discovery cohort explicitly unpositioned", async () => {
    mocks.getLatestFacetSummaries.mockResolvedValue([
      summary,
      { ...summary, id: "summary-b", traceId: "trace-b" },
      { ...summary, id: "summary-c", traceId: "trace-c" },
      {
        ...summary,
        id: "summary-d",
        traceId: "trace-d",
        state: "not_applicable",
        summary: "",
      },
    ]);
    const map = await caller().map(mapInput);
    expect(map.points.map((point) => point.summaryId)).toEqual([
      "summary-b",
      "summary-a",
    ]);
    expect(map.unpositionedCount).toBe(2);
    expect(mocks.readTopicAssignments).not.toHaveBeenCalled();
  });

  it("does not shift coordinates when a discovery summary is missing or belongs to another facet", async () => {
    mocks.getLatestFacetSummaries.mockResolvedValue([
      summary,
      { ...summary, id: "summary-b", facetVersionId: "another-facet" },
    ]);
    const map = await caller().map(mapInput);
    expect(map.missingSummaryCount).toBe(1);
    expect(map.points).toMatchObject([
      { summaryId: "summary-a", x: 10, y: 11, outcome: "assigned" },
    ]);
  });

  it.each([
    { rows: [] },
    { rows: [firstAssignment] },
    {
      rows: [
        firstAssignment,
        {
          ...firstAssignment,
          summaryId: "summary-b",
          coordinates: [Infinity, 3],
        },
      ],
    },
    {
      rows: [
        firstAssignment,
        {
          ...firstAssignment,
          summaryId: "summary-b",
          origin: "online",
          coordinates: [20, 21],
        },
      ],
    },
  ])(
    "returns unavailable for missing, invalid, or foreign-origin coordinates",
    async ({ rows }) => {
      mocks.readTopicMapAssignments.mockResolvedValue(rows);
      const map = await caller().map(mapInput);
      expect(map.status).toBe("unavailable");
      expect(map.points).toEqual([]);
      expect(mocks.getLatestFacetSummaries).not.toHaveBeenCalled();
    },
  );

  it("does not read unpublished coordinates or accept another project's map", async () => {
    mocks.getTopicRun.mockResolvedValue({ ...run, publishedAt: null });
    expect((await caller().map(mapInput)).status).toBe("unavailable");
    mocks.getTopicRun.mockResolvedValue({
      ...run,
      projectId: "another-project",
    });
    await expect(caller().map(mapInput)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mocks.readTopicMapAssignments).not.toHaveBeenCalled();
    expect(mocks.getLatestFacetSummaries).not.toHaveBeenCalled();
  });

  it("reads saved coordinates after discovery execution metadata expires and rejects foreign projects", async () => {
    mocks.readTopicExecutionSummary.mockResolvedValue(null);
    expect((await caller().map(mapInput)).status).toBe("ready");
    expect(mocks.readTopicExecutionSummary).not.toHaveBeenCalled();
    await expect(
      caller().map({ ...mapInput, projectId: "foreign-project" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("Topics local execution access and publication", () => {
  it.each(["process", "update"] as const)(
    "rejects a foreign facet before creating or enqueuing %s work",
    async (operation) => {
      mocks.getTopicFacetVersion.mockResolvedValue(null);
      const request = operation === "process" ? input : execution().input;
      await expect(caller().trigger(request)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
      expect(mocks.createTopicExecution).not.toHaveBeenCalled();
      expect(mocks.enqueueTopicExecution).not.toHaveBeenCalled();
    },
  );

  it("updates topics without selecting traces or requiring a previous execution", async () => {
    const request = { ...execution().input, minimumTraceCount: 31 };
    await caller().trigger(request);
    expect(mocks.createTopicExecution).toHaveBeenCalledWith(
      request,
      expect.any(String),
      "user-a",
    );
    expect(mocks.queryClickhouse).not.toHaveBeenCalled();
    expect(mocks.getTopicRun).not.toHaveBeenCalled();
  });

  it("scopes compatible summary counts to authorized project facets", async () => {
    const request = {
      projectId,
      facetVersionIds: [facetVersionId],
      embeddingConfig: input.embeddingConfig,
    };
    mocks.getTopicSummaryCounts.mockResolvedValue({ [facetVersionId]: 42 });
    expect(await caller("VIEWER").summaryCounts(request)).toEqual({
      [facetVersionId]: 42,
    });
    expect(mocks.getTopicSummaryCounts).toHaveBeenCalledWith(
      projectId,
      [facetVersionId],
      input.embeddingConfig,
    );
    mocks.getTopicSummaryCounts.mockClear();
    mocks.getTopicFacetVersion.mockResolvedValue(null);
    await expect(caller().summaryCounts(request)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(mocks.getTopicSummaryCounts).not.toHaveBeenCalled();
  });

  it("returns a completed duplicate request without queueing it again", async () => {
    expect((await caller().trigger(input)).id).toBe("execution-a");
    expect(mocks.enqueueTopicExecution).not.toHaveBeenCalled();
  });

  it("allows a viewer to read published results without returning vectors, but forbids execution", async () => {
    mocks.readTopicExecutionSummary.mockResolvedValue({
      ...execution(),
      input,
    });
    const response = await caller("VIEWER").results({
      projectId,
      executionId: "execution-a",
      facetVersionId,
    });
    expect(response.rows).toMatchObject([
      { id: summary.id, outcome: "assigned", topicId: "topic-a" },
    ]);
    expect(response.run?.topics).toHaveLength(1);
    expect(response.rows[0]).not.toHaveProperty("embedding");
    expect(response.run?.topics[0]).not.toHaveProperty("centroid");
    expect(mocks.getLatestFacetSummaries).toHaveBeenCalledWith(
      projectId,
      "facet-a",
      facetVersionId,
    );
    expect(mocks.readTopicAssignments).toHaveBeenCalledWith(
      projectId,
      ["summary-a"],
      "run-a",
    );
    await expect(caller("VIEWER").trigger(input)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.createTopicExecution).not.toHaveBeenCalled();
  });

  it("withholds candidate topics and assignments until the map is published", async () => {
    mocks.getTopicRun.mockResolvedValue({
      ...run,
      status: "running",
      publishedAt: null,
    });
    mocks.listTopicRuns.mockResolvedValue([
      { ...run, status: "running", publishedAt: null },
    ]);
    const response = await caller().results({
      projectId,
      executionId: "execution-a",
      facetVersionId,
    });
    expect(response.run?.topics ?? []).toEqual([]);
    expect(response.rows).toMatchObject([
      { outcome: "awaiting_map", topicId: null },
    ]);
    expect((await caller().runs({ projectId }))[0]?.topics ?? []).toEqual([]);
  });

  it("joins only fresh classifications to complete current summaries", async () => {
    const summaries = [
      summary,
      { ...summary, id: "stale" },
      { ...summary, id: "terminal", state: "not_applicable" },
    ];
    mocks.getLatestFacetSummaries.mockResolvedValue(summaries);
    mocks.readTopicAssignments.mockResolvedValue(
      summaries.map((row) => ({
        summaryId: row.id,
        summaryProcessedAt:
          row.id === "stale" ? "2026-09-15T00:00:00Z" : row.processedAt,
        topicId: null,
        distance: 0.2,
      })),
    );
    const result = await caller().results({
      projectId,
      executionId: "execution-a",
      facetVersionId,
    });
    expect(result.rows).toMatchObject([
      { id: summary.id, outcome: "outlier", topicId: null, distance: 0.2 },
      { id: "stale", outcome: "awaiting_map", topicId: null, distance: null },
      {
        id: "terminal",
        outcome: "not_applicable",
        topicId: null,
        distance: null,
      },
    ]);
  });

  it("rejects results and transcript inspection outside the execution's facet versions", async () => {
    mocks.readTopicSummaries.mockResolvedValue([
      { ...summary, id: "other-summary", facetVersionId: "other-facet" },
    ]);
    await expect(
      caller().results({
        projectId,
        executionId: "execution-a",
        facetVersionId: "other-facet",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      caller().inspect({
        projectId,
        executionId: "execution-a",
        summaryId: "other-summary",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.readTopicMapAssignments).not.toHaveBeenCalled();
  });

  it("regenerates inspection input from the source trace", async () => {
    const projection = { text: "A refund request" };
    mocks.loadTopicTranscript.mockResolvedValue({
      transcript: projection,
    });
    const response = await caller().inspect({
      projectId,
      executionId: "execution-a",
      summaryId: "summary-a",
    });
    expect(mocks.loadTopicTranscript).toHaveBeenCalledWith({
      projectId,
      traceId: "trace-a",
    });
    expect(mocks.readTopicMapAssignments).not.toHaveBeenCalled();
    expect(response.projection).toEqual(projection);
    expect(response).not.toHaveProperty("projectionStatus");
    expect(response).not.toHaveProperty("embedding");
  });

  it("returns the current source transcript and keeps summaries inspectable after source deletion", async () => {
    mocks.loadTopicTranscript.mockResolvedValue({
      transcript: { text: "Changed trace" },
    });
    const request = {
      projectId,
      executionId: "execution-a",
      summaryId: "summary-a",
    };
    expect((await caller().inspect(request)).projection?.text).toBe(
      "Changed trace",
    );
    mocks.loadTopicTranscript.mockRejectedValue(
      new Error("Trace no longer exists"),
    );
    const unavailable = await caller().inspect(request);
    expect(unavailable.projection).toBeNull();
    expect(unavailable).not.toHaveProperty("inputHash");
  });

  it("does not retry terminal partial facets", async () => {
    mocks.readTopicExecutionSummary.mockResolvedValue({
      ...execution(),
      status: "completed_with_errors",
    });
    await expect(
      caller().retry({ projectId, executionId: "execution-a" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.writeTopicExecution).not.toHaveBeenCalled();
    expect(mocks.enqueueTopicExecution).not.toHaveBeenCalled();
  });

  it("loads failed trace details separately from compact execution polling", async () => {
    const failed = execution();
    failed.status = "completed_with_errors";
    failed.facets[0]!.counts.failed = 1;
    failed.traceErrors = [
      { traceId: "trace-failed", error: "Trace no longer exists" },
    ];
    const { traceErrors, ...compact } = failed;
    mocks.readTopicExecutionTraceErrors.mockResolvedValue({
      errors: traceErrors,
      expired: false,
    });
    mocks.readTopicExecutionSummary.mockResolvedValue(compact);
    const request = { projectId, executionId: failed.id };

    expect(await caller("VIEWER").execution(request)).not.toHaveProperty(
      "traceErrors",
    );
    expect(mocks.readTopicExecutionTraceErrors).not.toHaveBeenCalled();
    expect(await caller("VIEWER").traceErrors(request)).toEqual({
      errors: traceErrors,
      expired: false,
    });
    expect(mocks.readTopicExecutionTraceErrors).toHaveBeenCalledWith(
      projectId,
      failed.id,
    );

    mocks.readTopicExecutionTraceErrors.mockResolvedValue({
      errors: [],
      expired: true,
    });
    expect(await caller("VIEWER").traceErrors(request)).toEqual({
      errors: [],
      expired: true,
    });

    mocks.readTopicExecutionSummary.mockResolvedValue(null);
    await expect(caller("VIEWER").traceErrors(request)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    mocks.readTopicExecutionTraceErrors.mockClear();
    await expect(
      caller("VIEWER").traceErrors({ ...request, projectId: "foreign" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      caller("VIEWER", false).traceErrors(request),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.readTopicExecutionTraceErrors).not.toHaveBeenCalled();
  });

  it("recovers an interrupted journal only after its queue owner is gone", async () => {
    const interrupted = execution();
    interrupted.status = "running";
    interrupted.facets[0]!.outcome = "pending";
    mocks.readTopicExecutionSummary.mockResolvedValue(interrupted);
    mocks.getTopicExecutionQueueState.mockResolvedValue("failed");
    expect(
      await caller().execution({ projectId, executionId: interrupted.id }),
    ).toMatchObject({ status: "failed", phase: "interrupted" });
    await caller().retry({ projectId, executionId: interrupted.id });
    expect(mocks.enqueueTopicExecution).toHaveBeenCalledWith(
      projectId,
      interrupted.id,
      interrupted.input.operation,
    );
    expect(mocks.writeTopicExecution).not.toHaveBeenCalled();
  });

  it("resumes finalization when all facets were saved before an interruption", async () => {
    const interrupted = { ...execution(), status: "running" as const };
    mocks.readTopicExecutionSummary.mockResolvedValue(interrupted);
    mocks.getTopicExecutionQueueState.mockResolvedValue("failed");
    await caller().retry({ projectId, executionId: interrupted.id });
    expect(mocks.enqueueTopicExecution).toHaveBeenCalledWith(
      projectId,
      interrupted.id,
      interrupted.input.operation,
    );
    expect(mocks.writeTopicExecution).not.toHaveBeenCalled();
  });

  it("shows a queued retry without overwriting worker-owned journal progress", async () => {
    const interrupted = execution();
    interrupted.status = "failed";
    interrupted.error = "Previous worker stopped";
    interrupted.facets[0]!.outcome = "pending";
    mocks.readTopicExecutionSummary.mockResolvedValue(interrupted);
    mocks.getTopicExecutionQueueState.mockResolvedValue("waiting");
    expect(
      await caller().execution({ projectId, executionId: interrupted.id }),
    ).toMatchObject({ status: "queued", phase: "queued", error: null });
    await expect(
      caller().retry({ projectId, executionId: interrupted.id }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.writeTopicExecution).not.toHaveBeenCalled();
    expect(mocks.enqueueTopicExecution).not.toHaveBeenCalled();
  });

  it("reconciles orphaned executions in history so status agrees with the detail view", async () => {
    const interrupted = { ...execution(), status: "running" as const };
    mocks.listTopicExecutions.mockResolvedValue([interrupted]);
    mocks.getTopicExecutionQueueState.mockResolvedValue("missing");
    expect(await caller().executions({ projectId })).toMatchObject([
      { status: "failed", phase: "interrupted" },
    ]);
    expect(mocks.writeTopicExecution).not.toHaveBeenCalled();
  });

  it("does not resume a queued or running execution still owned by a worker", async () => {
    for (const status of ["queued", "running"] as const) {
      const owned = execution();
      owned.status = status;
      owned.facets[0]!.outcome = "pending";
      mocks.readTopicExecutionSummary.mockResolvedValue(owned);
      mocks.getTopicExecutionQueueState.mockResolvedValue("active");
      await expect(
        caller().retry({ projectId, executionId: owned.id }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(mocks.writeTopicExecution).not.toHaveBeenCalled();
    expect(mocks.enqueueTopicExecution).not.toHaveBeenCalled();
  });

  it("rejects a different project and a disabled feature flag before storage access", async () => {
    await expect(
      caller().executions({ projectId: "foreign-project" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      caller("ADMIN", false).executions({ projectId }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mocks.listTopicExecutions).not.toHaveBeenCalled();
  });

  it("compares only summary identities assigned in both compatible published maps", async () => {
    mocks.getLatestFacetSummaries.mockResolvedValue([
      summary,
      { ...summary, id: "summary-b" },
    ]);
    mocks.getTopicRun.mockImplementation(
      async (_project: string, id: string) => ({
        ...run,
        id,
      }),
    );
    mocks.readTopicAssignments
      .mockResolvedValueOnce([
        {
          summaryId: "summary-a",
          summaryProcessedAt: summary.processedAt,
          topicId: "topic-a",
        },
        {
          summaryId: "summary-b",
          summaryProcessedAt: summary.processedAt,
          topicId: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          summaryId: "summary-a",
          summaryProcessedAt: summary.processedAt,
          topicId: null,
        },
      ]);
    expect(
      await caller().compare({
        projectId,
        runId: run.id,
        otherRunId: "other-run",
      }),
    ).toEqual({
      compared: 1,
      total: 2,
      flows: [{ from: "Outlier", to: "Refunds", count: 1 }],
    });
    expect(mocks.readTopicExecutionSummary).not.toHaveBeenCalled();
    for (const incompatible of [
      { facetVersionId: "foreign-facet" },
      { projectId: "foreign-project" },
      { publishedAt: null },
    ]) {
      mocks.getTopicRun
        .mockResolvedValueOnce(run)
        .mockResolvedValueOnce({ ...run, ...incompatible });
      await expect(
        caller().compare({ projectId, runId: run.id, otherRunId: "other-run" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
  });

  it("compares only complete summaries with fresh assignments in both maps", async () => {
    const summaries = ["fresh", "stale-current", "stale-other", "terminal"].map(
      (id) => ({
        ...summary,
        id,
        state: id === "terminal" ? "not_applicable" : "complete",
      }),
    );
    mocks.getLatestFacetSummaries.mockResolvedValue(summaries);
    mocks.getTopicRun.mockImplementation(async (_projectId, id) => ({
      ...run,
      id,
    }));
    mocks.readTopicAssignments.mockImplementation(
      async (_projectId, _ids, runId) =>
        summaries.map((row) => ({
          summaryId: row.id,
          summaryProcessedAt:
            row.id === (runId === run.id ? "stale-current" : "stale-other")
              ? "2026-09-15T00:00:00Z"
              : row.processedAt,
          topicId: runId === run.id ? "topic-a" : null,
        })),
    );
    expect(
      await caller().compare({
        projectId,
        runId: run.id,
        otherRunId: "other-run",
      }),
    ).toEqual({
      compared: 1,
      total: 4,
      flows: [{ from: "Outlier", to: "Refunds", count: 1 }],
    });
  });
});

describe("Topics transcript preview and facet configuration", () => {
  it("lets a viewer regenerate an arbitrary trace without an execution", async () => {
    const transcript = {
      text: "Shared transcript",
      coverage: { omittedBlockCount: 0, truncatedBlockCount: 0 },
    };
    mocks.loadTopicTranscript.mockResolvedValue({ transcript });
    expect(
      await caller("VIEWER").transcript({
        projectId,
        traceId: "trace:with/slashes",
      }),
    ).toEqual(transcript);
    expect(mocks.loadTopicTranscript).toHaveBeenCalledWith({
      projectId,
      traceId: "trace:with/slashes",
    });
    expect(mocks.getTopicFacetVersion).not.toHaveBeenCalled();
  });

  it("rejects a foreign project before reading transcripts or summaries", async () => {
    await expect(
      caller().transcript({ projectId: "foreign", traceId: "trace-a" }),
    ).rejects.toThrow();
    await expect(
      caller().traceSummaries({ projectId: "foreign", traceId: "trace-a" }),
    ).rejects.toThrow();
    expect(mocks.loadTopicTranscript).not.toHaveBeenCalled();
    expect(mocks.listTopicSummaries).not.toHaveBeenCalled();
  });

  it("reads the latest saved result per facet version without loading source traces or exposing vectors", async () => {
    const base = {
      id: "latest",
      facetId: "intent",
      facetVersionId,
      facetVersion: 1,
      summary: "Cancel the subscription.",
      state: "complete",
      processedAt: "2026-09-16T00:00:00Z",
      metadata: {},
      embedding: [1, 2, 3],
    };
    mocks.listTopicSummaries.mockResolvedValue([
      base,
      {
        ...base,
        id: "issue",
        facetId: "issues",
        facetVersionId: "issues-v2",
        facetVersion: 2,
        summary: "",
        state: "not_applicable",
        metadata: {},
      },
    ]);
    mocks.listTopicFacets.mockResolvedValue([
      { id: "intent", name: "Intent" },
      { id: "issues", name: "Issues" },
    ]);
    const saved = await caller("VIEWER").traceSummaries({
      projectId,
      traceId: "trace-a",
    });
    expect(mocks.listTopicSummaries).toHaveBeenCalledWith(projectId, {
      traceIds: ["trace-a"],
    });
    expect(mocks.listTopicFacets).toHaveBeenCalledWith(projectId);
    expect(saved).toHaveLength(2);
    expect(saved[0]).toMatchObject({
      id: "latest",
      facetName: "Intent",
      summary: "Cancel the subscription.",
    });
    expect(saved[1]).toMatchObject({
      facetName: "Issues",
      state: "not_applicable",
    });
    expect(saved[0]).not.toHaveProperty("embedding");
    expect(mocks.loadTopicTranscript).not.toHaveBeenCalled();
  });

  it("stores facet prompts independently of execution processing settings", async () => {
    const facet = {
      projectId,
      facetId: "facet-a",
      name: "Issues",
      description: "",
      prompt: "Describe visible issues",
    };
    await caller().saveFacet(facet);
    expect(mocks.createTopicFacetVersion).toHaveBeenCalledWith(facet);
    await caller().trigger({
      ...input,
      processingConfig: { ...input.processingConfig, maxInputTokens: 2000 },
    });
    expect(
      mocks.createTopicExecution.mock.calls[0][0].processingConfig
        .maxInputTokens,
    ).toBe(2000);
    expect(mocks.createTopicFacetVersion).toHaveBeenCalledTimes(1);
  });
});

describe("Topics current results", () => {
  it("keeps the latest processed facet version when a newer unprocessed version exists", async () => {
    mocks.listTopicFacets.mockResolvedValue([
      {
        id: "intent",
        name: "Intent",
        versions: [{ id: "intent-v3", version: 3 }],
      },
    ]);
    const latest = [
      {
        ...summary,
        id: "terminal-v2",
        traceId: "trace-a",
        facetVersionId: "intent-v2",
        facetVersion: 2,
        state: "not_applicable",
      },
      {
        ...summary,
        id: "waiting-v2",
        traceId: "trace-b",
        facetVersionId: "intent-v2",
        facetVersion: 2,
      },
    ];
    mocks.getLatestFacetSummaries.mockImplementation(
      async (_projectId, _facetId, versionId) =>
        versionId
          ? latest.filter((row) => row.facetVersionId === versionId)
          : latest,
    );
    mocks.getPublishedTopicRun.mockResolvedValue(null);
    mocks.readLatestTopicAssignments.mockResolvedValue([
      {
        traceId: "trace-a",
        summaryId: "assigned-v1",
        summaryProcessedAt: summary.processedAt,
        topicId: "topic-a",
        topicVersionId: "old-topic",
      },
    ]);
    mocks.readTopicSummaries.mockResolvedValue([
      {
        ...summary,
        id: "assigned-v1",
        facetVersionId: "intent-v1",
        facetVersion: 1,
      },
    ]);
    mocks.getTopicDefinitions.mockResolvedValue([]);
    const [result] = await caller().currentResults({ projectId });
    expect(result).toMatchObject({
      usableCount: 0,
      awaitingCount: 1,
      topics: [],
      rows: [
        expect.objectContaining({
          traceId: "trace-a",
          outcome: "not_applicable",
          topicId: null,
        }),
        expect.objectContaining({
          traceId: "trace-b",
          outcome: "awaiting_map",
          topicId: null,
        }),
      ],
    });
  });

  it("uses the current map's name for retained topics even when an older map receives a later assignment", async () => {
    mocks.listTopicFacets.mockResolvedValue([
      {
        id: "intent",
        name: "Intent",
        versions: [{ id: facetVersionId, version: 1 }],
      },
    ]);
    mocks.getLatestFacetSummaries.mockResolvedValue(
      ["retained", "retired"].map((traceId) => ({
        ...summary,
        id: `summary-${traceId}`,
        traceId,
      })),
    );
    mocks.getPublishedTopicRun.mockResolvedValue({
      ...run,
      config: {},
      topics: [
        {
          topicId: "retained",
          name: "Specific refund issues",
          description: "Current description",
        },
      ],
    });
    mocks.readLatestTopicAssignments.mockResolvedValue(
      ["retained", "retired"].map((topicId) => ({
        traceId: topicId,
        summaryId: `summary-${topicId}`,
        topicId,
        topicVersionId: `old-${topicId}`,
        summaryProcessedAt: summary.processedAt,
        runId: "old-map",
        assignedAt: "2026-09-17T00:00:00Z",
      })),
    );
    mocks.getTopicDefinitions.mockResolvedValue(
      ["retained", "retired"].map((topicId) => ({
        topicId,
        topicVersionId: `old-${topicId}`,
        name: `Old ${topicId}`,
        description: `Historical ${topicId}`,
      })),
    );
    const [result] = await caller().currentResults({ projectId });
    expect(result.topics).toEqual(
      expect.arrayContaining([
        {
          id: "retained",
          name: "Specific refund issues",
          description: "Current description",
          count: 1,
        },
        {
          id: "retired",
          name: "Old retired",
          description: "Historical retired",
          count: 1,
        },
      ]),
    );
    expect(result.rows.find((row) => row.traceId === "retained")).toMatchObject(
      { topicName: "Old retained" },
    );
  });

  it("ignores assignments for replaced summaries and derives terminal or waiting results from current summaries", async () => {
    mocks.listTopicFacets.mockResolvedValue([
      {
        id: "intent",
        name: "Intent",
        versions: [{ id: "intent-v2", version: 2 }],
      },
    ]);
    mocks.getPublishedTopicRun.mockResolvedValue(null);
    const assigned = {
      ...summary,
      id: "assigned",
      traceId: "trace-a",
      facetVersion: 2,
      facetVersionId: "intent-v2",
      summary: "Older assigned summary",
    };
    const pending = {
      ...summary,
      id: "assigned",
      traceId: "trace-a",
      facetVersion: 2,
      facetVersionId: "intent-v2",
      state: "complete",
      processedAt: "2026-09-17T00:00:00Z",
    };
    const cleared = {
      ...summary,
      id: "cleared",
      traceId: "trace-b",
      facetVersion: 2,
      facetVersionId: "intent-v2",
      state: "not_applicable",
      summary: "",
    };
    const waiting = {
      ...summary,
      id: "waiting",
      traceId: "trace-c",
      facetVersion: 2,
      facetVersionId: "intent-v2",
      state: "complete",
    };
    mocks.getLatestFacetSummaries.mockResolvedValue([
      pending,
      cleared,
      waiting,
    ]);
    mocks.readLatestTopicAssignments.mockResolvedValue([
      {
        traceId: "trace-a",
        summaryId: "assigned",
        topicId: "stable-topic",
        topicVersionId: "version-old",
        summaryProcessedAt: assigned.processedAt,
        runId: "map-old",
        assignedAt: "2026-09-16T00:00:00Z",
      },
    ]);
    mocks.getTopicDefinitions.mockResolvedValue([
      {
        topicId: "stable-topic",
        topicVersionId: "version-old",
        name: "Refunds",
        description: "Refund requests",
        centroid: [1, 2],
      },
    ]);
    const result = await caller("VIEWER").currentResults({ projectId });
    expect(mocks.readLatestTopicAssignments).toHaveBeenCalledWith(
      projectId,
      "intent",
    );
    expect(mocks.getTopicDefinitions).toHaveBeenCalledWith(projectId, [
      "version-old",
    ]);
    expect(result[0]).toMatchObject({
      facetId: "intent",
      awaitingCount: 2,
      usableCount: 2,
      topics: [],
      rows: expect.arrayContaining([
        expect.objectContaining({
          traceId: "trace-a",
          summary: pending.summary,
          outcome: "awaiting_map",
          topicId: null,
        }),
        expect.objectContaining({
          traceId: "trace-b",
          outcome: "not_applicable",
          topicId: null,
        }),
        expect.objectContaining({
          traceId: "trace-c",
          outcome: "awaiting_map",
          topicId: null,
        }),
      ]),
    });
    expect(JSON.stringify(result)).not.toContain("centroid");
    await expect(
      caller().currentResults({ projectId: "foreign" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
