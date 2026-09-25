import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import type { Session } from "next-auth";
import type * as sharedServer from "@langfuse/shared/src/server";
import type * as topicsServer from "@langfuse/shared/topics/server";
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
  getTopicRun: vi.fn(),
  listTopicSummaries: vi.fn(),
  readTopicMapAssignments: vi.fn(),
  loadTopicTranscript: vi.fn<typeof topicsServer.loadTopicTranscript>(),
  isTopicsEnabled: vi.fn(),
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
const facetId = "facet-a";
const facetVersion = 1;
const selectedFacets = [{ facetId, version: facetVersion }];
const inspectInput = { projectId, facetId, facetVersion, traceId: "trace-a" };
const input: Extract<TopicExecutionInput, { operation: "process" }> = {
  projectId,
  requestId: "request-a",
  operation: "process",
  facets: selectedFacets,
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
      facets: selectedFacets,
      embeddingConfig: topicEmbeddingConfigSchema.parse({}),
      exploratory: false,
    },
    status: "completed",
    phase: "completed",
    createdAt: "2026-09-16T00:00:00Z",
    updatedAt: "2026-09-16T00:00:00Z",
    facets: [
      {
        facetId,
        facetVersion,
        outcome: "published",
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
  facetId,
  facetVersion,
  status: "completed",
  createdAt: "2026-09-16T00:00:00Z",
  topics: [
    {
      topicId: "topic-a",
      name: "Refunds",
      description: "Refund requests",
      radius: 0.2,
      centroid: [0.1, 0.9],
      representativeSummaries: [],
    },
  ],
};
const summary = {
  projectId,
  traceId: "trace-a",
  sessionId: "parent-session",
  facetId,
  facetVersion,
  state: "complete",
  summary: "Requests a refund",
  processedAt: "2026-09-16T00:00:00Z",
  unitStartTime: "2026-09-16T00:00:00Z",
  embedding: [0.1, 0.9],
  summaryModel: "gpt-4.1-nano",
  metadata: {},
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.queryClickhouse.mockResolvedValue([]);
  mocks.isTopicsEnabled.mockReturnValue(true);
  mocks.isTopicsProjectEnabled.mockReturnValue(true);
  mocks.getTopicFacetVersion.mockResolvedValue({
    facetId,
    version: facetVersion,
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
  mocks.listTopicSummaries.mockResolvedValue([summary]);
});

describe("Topics feature access", () => {
  it("rejects reads, inspection, and execution without an explicit opt-in", async () => {
    const disabled = caller("ADMIN", false);
    await expect(disabled.facets({ projectId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(disabled.inspect(inspectInput)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
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

  it("caps the preview query while preserving the full selected count", async () => {
    mocks.queryClickhouse.mockResolvedValue([
      {
        id: "trace-a",
        timestampMs: "1789430400000",
        name: "Agent",
        environment: "default",
        matchedTraceCount: "1001",
      },
    ]);
    const response = await caller().previewTraces({
      ...selection,
      limit: null,
    });
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
      facets: selectedFacets,
      processingConfig: { ...input.processingConfig, maxInputTokens: 2000 },
      selection: { ...criteria, limit: null, excludedTraceIds: ["trace-0"] },
    });
    const resolved = mocks.createTopicExecution.mock.calls[0][0];
    expect(resolved.processingConfig.maxInputTokens).toBe(2000);
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
        facets: selectedFacets,
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
      facets: selectedFacets,
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
      facets: selectedFacets,
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
    expect(mocks.enqueueTopicExecution).not.toHaveBeenCalled();
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
      {
        ...selection,
        filter: [
          {
            column: "not-a-column",
            type: "string" as const,
            operator: "=" as const,
            value: "x",
          },
        ],
      },
    ])
      await expect(caller().previewTraces(invalid)).rejects.toBeDefined();
    await expect(
      caller("ADMIN", false).previewTraces(selection),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mocks.queryClickhouse).not.toHaveBeenCalled();
  });
});

describe("Topics published scatter map", () => {
  const mapInput = { projectId, runId: "run-a" };
  const firstAssignment = {
    projectId,
    facetId,
    facetVersion,
    runId: "run-a",
    origin: "initial",
    coordinates: [10, 11],
    traceId: "trace-a",
    topicId: "topic-a",
  };
  beforeEach(() => {
    mocks.readTopicMapAssignments.mockResolvedValue([
      firstAssignment,
      {
        ...firstAssignment,
        traceId: "trace-b",
        topicId: null,
        coordinates: [20, 21],
      },
    ]);
    mocks.getLatestFacetSummaries.mockResolvedValue([
      summary,
      { ...summary, traceId: "trace-b" },
    ]);
  });

  it("reads historical coordinates from the persisted cohort without execution state", async () => {
    mocks.getLatestFacetSummaries.mockResolvedValue([
      {
        ...summary,
        summary: "Latest refund summary",
        processedAt: "2026-09-17T00:00:00Z",
      },
      { ...summary, traceId: "trace-b" },
    ]);
    const map = await caller("VIEWER").map(mapInput);
    expect(map.status).toBe("ready");
    expect(map.points).toEqual([
      {
        traceId: "trace-a",
        summary: "Latest refund summary",
        topicId: "topic-a",
        outcome: "assigned",
        x: 10,
        y: 11,
      },
      {
        traceId: "trace-b",
        summary: summary.summary,
        topicId: null,
        outcome: "outlier",
        x: 20,
        y: 21,
      },
    ]);
    expect(mocks.readTopicMapAssignments).toHaveBeenCalledWith(
      projectId,
      { facetId, version: facetVersion },
      "run-a",
    );
    expect(JSON.stringify(map)).not.toContain("embedding");
    await expect(
      caller().map({ ...mapInput, projectId: "foreign-project" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("serves completed maps with no topics and preserves their outlier assignments", async () => {
    mocks.getTopicRun.mockResolvedValue({ ...run, topics: [] });
    mocks.readTopicMapAssignments.mockResolvedValue([
      { ...firstAssignment, topicId: null },
    ]);
    const map = await caller().map(mapInput);
    expect(map.status).toBe("ready");
    expect(map.points).toMatchObject([
      { traceId: "trace-a", topicId: null, outcome: "outlier" },
    ]);
    expect(mocks.getLatestFacetSummaries).toHaveBeenCalledWith(
      projectId,
      facetId,
      facetVersion,
    );
  });

  it("preserves coordinates around missing cohort members and leaves other traces unpositioned", async () => {
    mocks.getLatestFacetSummaries.mockResolvedValue([
      summary,
      {
        ...summary,
        traceId: "trace-b",
        facetId: "another-facet",
      },
      { ...summary, traceId: "trace-c" },
      {
        ...summary,
        traceId: "trace-d",
        state: "not_applicable",
        summary: "",
      },
    ]);
    const map = await caller().map(mapInput);
    expect(map.unpositionedCount).toBe(2);
    expect(map.missingSummaryCount).toBe(1);
    expect(map.points).toMatchObject([
      { traceId: "trace-a", x: 10, y: 11, outcome: "assigned" },
    ]);
  });

  it.each([
    null,
    { facetId: "another-facet" },
    { facetVersion: 2 },
    { coordinates: null },
    { coordinates: [Infinity, 3] },
    { origin: "online", coordinates: [20, 21] },
  ])(
    "returns unavailable for a missing or invalid discovery cohort: %j",
    async (invalid) => {
      mocks.readTopicMapAssignments.mockResolvedValue(
        invalid
          ? [
              firstAssignment,
              { ...firstAssignment, traceId: "trace-b", ...invalid },
            ]
          : [],
      );
      const map = await caller().map(mapInput);
      expect(map.status).toBe("unavailable");
      expect(map.points).toEqual([]);
      expect(mocks.getLatestFacetSummaries).not.toHaveBeenCalled();
    },
  );

  it("does not read unfinished or skipped coordinates or accept another project's map", async () => {
    for (const status of ["pending", "running", "failed", "skipped"]) {
      mocks.getTopicRun.mockResolvedValue({ ...run, status });
      expect((await caller().map(mapInput)).status).toBe("unavailable");
    }
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
});

describe("Topics local execution access and publication", () => {
  it("rejects a foreign facet before creating or enqueuing work", async () => {
    mocks.getTopicFacetVersion.mockResolvedValue(null);
    await expect(caller().trigger(input)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(mocks.createTopicExecution).not.toHaveBeenCalled();
    expect(mocks.enqueueTopicExecution).not.toHaveBeenCalled();
  });

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
      facets: selectedFacets,
      embeddingConfig: input.embeddingConfig,
    };
    mocks.getTopicSummaryCounts.mockResolvedValue([
      { facetId, facetVersion, count: 42 },
    ]);
    expect(await caller("VIEWER").summaryCounts(request)).toEqual([
      { facetId, facetVersion, count: 42 },
    ]);
    expect(mocks.getTopicSummaryCounts).toHaveBeenCalledWith(
      projectId,
      selectedFacets,
      input.embeddingConfig,
    );
    expect(mocks.getTopicFacetVersion).toHaveBeenCalledWith(
      projectId,
      facetId,
      facetVersion,
    );
    mocks.getTopicSummaryCounts.mockClear();
    mocks.getTopicFacetVersion.mockResolvedValue(null);
    await expect(caller().summaryCounts(request)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(mocks.getTopicSummaryCounts).not.toHaveBeenCalled();
  });

  it.each([
    { ...summary, projectId: "foreign-project" },
    { ...summary, facetId: "another-facet" },
    { ...summary, facetVersion: 2 },
    { ...summary, traceId: "another-trace" },
    { ...summary, traceId: null, sessionId: "session-a" },
  ])("rejects a foreign or invalid trace summary", async (invalidSummary) => {
    mocks.listTopicSummaries.mockResolvedValue([invalidSummary]);
    await expect(caller().inspect(inspectInput)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mocks.loadTopicTranscript).not.toHaveBeenCalled();
  });

  const source = {
    unitStartTime: summary.unitStartTime,
    sessionId: summary.sessionId,
    environment: "production",
    traceName: "Refund request",
    transcript: { threads: [], truncated: true },
  } satisfies Awaited<ReturnType<typeof topicsServer.loadTopicTranscript>>;

  it("returns the current structured transcript including truncation", async () => {
    mocks.loadTopicTranscript.mockResolvedValue(source);
    expect(await caller().inspect(inspectInput)).toEqual({
      model: summary.summaryModel,
      transcript: source.transcript,
    });
    expect(mocks.loadTopicTranscript).toHaveBeenCalledWith({
      projectId,
      traceId: "trace-a",
    });
  });

  it("looks up a custom trace ID within its stored facet version", async () => {
    const traceId = "client/session:trace 1";
    mocks.listTopicSummaries.mockResolvedValue([{ ...summary, traceId }]);
    mocks.loadTopicTranscript.mockResolvedValue(source);
    await caller().inspect({ ...inspectInput, traceId });
    expect(mocks.listTopicSummaries).toHaveBeenCalledWith(projectId, {
      facetId,
      facetVersion,
      traceIds: [traceId],
    });
    expect(mocks.loadTopicTranscript).toHaveBeenCalledWith({
      projectId,
      traceId,
    });
    await expect(
      caller().inspect({ ...inspectInput, projectId: "foreign-project" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.listTopicSummaries).toHaveBeenCalledOnce();
  });

  it("reports the source unavailable when no conversation can be assembled", async () => {
    mocks.loadTopicTranscript.mockResolvedValue({
      ...source,
      transcript: null,
    });
    expect(await caller().inspect(inspectInput)).toEqual({
      model: summary.summaryModel,
      transcript: null,
    });
  });

  it("retains the stored summary when the source was deleted", async () => {
    mocks.loadTopicTranscript.mockRejectedValue(
      new Error("Trace no longer exists"),
    );
    expect(await caller().inspect(inspectInput)).toEqual({
      model: summary.summaryModel,
      transcript: null,
    });
  });

  it("does not retry terminal partial facets", async () => {
    mocks.readTopicExecutionSummary.mockResolvedValue({
      ...execution(),
      status: "completed_with_errors",
    });
    await expect(
      caller().retry({ projectId, executionId: "execution-a" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
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
    expect(mocks.readTopicExecutionTraceErrors).toHaveBeenCalledWith(compact);

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

  it("reconciles interrupted history and resumes published facets after their queue owner is gone", async () => {
    const interrupted = execution();
    interrupted.status = "running";
    mocks.readTopicExecutionSummary.mockResolvedValue(interrupted);
    mocks.listTopicExecutions.mockResolvedValue([interrupted]);
    mocks.getTopicExecutionQueueState.mockResolvedValue("failed");
    const request = { projectId, executionId: interrupted.id };
    expect(await caller().execution(request)).toMatchObject({
      status: "failed",
      phase: "interrupted",
    });
    expect(await caller().executions({ projectId })).toMatchObject([
      { status: "failed", phase: "interrupted" },
    ]);
    await caller().retry(request);
    expect(mocks.enqueueTopicExecution).toHaveBeenCalledWith(
      projectId,
      interrupted.id,
      interrupted.input.operation,
    );
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
    expect(mocks.enqueueTopicExecution).not.toHaveBeenCalled();
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
});

describe("Topics current results", () => {
  it("serves current and historical topic names to viewers without exposing vectors", async () => {
    mocks.listTopicFacets.mockResolvedValue([
      {
        id: "intent",
        name: "Intent",
        versions: [{ version: 1 }],
      },
    ]);
    const traces = ["retained", "retired-old", "retired-new"];
    mocks.getLatestFacetSummaries.mockResolvedValue(
      traces.map((traceId) => ({
        ...summary,
        facetId: "intent",
        traceId,
      })),
    );
    mocks.getPublishedTopicRun.mockResolvedValue({
      ...run,
      config: {},
      topics: [
        {
          ...run.topics[0],
          topicId: "retained",
          name: "Specific refund issues",
          description: "Current description",
        },
      ],
    });
    mocks.readLatestTopicAssignments.mockResolvedValue(
      traces.map((traceId) => ({
        traceId,
        projectId,
        facetId: "intent",
        facetVersion,
        sessionId: null,
        topicId: traceId.split("-")[0],
        topicVersionId: traceId,
        summaryProcessedAt: summary.processedAt,
        runId: "old-map",
        assignedAt:
          traceId === "retired-old"
            ? "2026-09-16T00:00:00Z"
            : "2026-09-17T00:00:00Z",
      })),
    );
    mocks.getTopicDefinitions.mockResolvedValue(
      traces.map((id) => ({
        ...run.topics[0],
        topicId: id.split("-")[0],
        topicVersionId: id,
        name: `Old ${id}`,
        description: `Historical ${id}`,
      })),
    );
    const [result] = await caller("VIEWER").currentResults({ projectId });
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
          name: "Old retired-new",
          description: "Historical retired-new",
          count: 2,
        },
      ]),
    );
    expect(result.rows.find((row) => row.traceId === "retained")).toMatchObject(
      {
        facetVersion,
        outcome: "assigned",
        topicId: "retained",
        topicName: "Old retained",
      },
    );
    expect(result.map?.topics).toHaveLength(1);
    expect(JSON.stringify(result)).not.toMatch(/embedding|centroid/);
    expect(mocks.getLatestFacetSummaries).toHaveBeenCalledWith(
      projectId,
      "intent",
    );
    expect(mocks.readLatestTopicAssignments).toHaveBeenCalledWith(
      projectId,
      "intent",
    );
    await expect(caller("VIEWER").trigger(input)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.createTopicExecution).not.toHaveBeenCalled();
  });

  it.each([2, 3])(
    "shows current processed summaries when configured version is %s, ignoring stale assignments",
    async (configuredVersion) => {
      mocks.listTopicFacets.mockResolvedValue([
        {
          id: "intent",
          name: "Intent",
          versions: [{ version: configuredVersion }],
        },
      ]);
      mocks.getPublishedTopicRun.mockResolvedValue(null);
      const facetSummary = { ...summary, facetId: "intent", facetVersion: 2 };
      const pending = {
        ...facetSummary,
        traceId: "trace-a",
        processedAt: "2026-09-17T00:00:00Z",
      };
      const cleared = {
        ...facetSummary,
        traceId: "trace-b",
        state: "not_applicable",
        summary: "",
      };
      const waiting = {
        ...facetSummary,
        traceId: "trace-c",
      };
      const outlier = { ...facetSummary, traceId: "trace-d" };
      const staleVersion = { ...facetSummary, traceId: "trace-e" };
      const latest = [pending, cleared, waiting, outlier, staleVersion];
      mocks.getLatestFacetSummaries.mockImplementation(
        async (_projectId, _facetId, version) =>
          version
            ? latest.filter((row) => row.facetVersion === version)
            : latest,
      );
      mocks.readLatestTopicAssignments.mockResolvedValue([
        {
          traceId: "trace-a",
          projectId,
          facetId: "intent",
          facetVersion: 2,
          sessionId: null,
          topicId: "stable-topic",
          topicVersionId: "version-old",
          summaryProcessedAt: summary.processedAt,
          runId: "map-old",
          assignedAt: "2026-09-16T00:00:00Z",
        },
        ...[cleared, outlier].map((row) => ({
          projectId: row.projectId,
          facetId: row.facetId,
          facetVersion: row.facetVersion,
          traceId: row.traceId,
          sessionId: null,
          summaryProcessedAt: row.processedAt,
          topicId: row === cleared ? "stable-topic" : null,
        })),
        {
          ...staleVersion,
          facetVersion: 1,
          summaryProcessedAt: staleVersion.processedAt,
          topicId: "stable-topic",
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
        awaitingCount: 3,
        usableCount: configuredVersion === 2 ? 4 : 0,
        topics: [],
        rows: expect.arrayContaining([
          expect.objectContaining({
            traceId: "trace-a",
            summary: pending.summary,
            facetVersion: 2,
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
          expect.objectContaining({
            traceId: "trace-d",
            outcome: "outlier",
            topicId: null,
          }),
          expect.objectContaining({
            traceId: "trace-e",
            outcome: "awaiting_map",
            topicId: null,
          }),
        ]),
      });
      expect(JSON.stringify(result)).not.toContain("centroid");
      await expect(
        caller().currentResults({ projectId: "foreign" }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    },
  );
});
