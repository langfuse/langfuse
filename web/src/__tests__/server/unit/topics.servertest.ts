import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { canViewTopics } from "@/src/features/topics/topicsAccess";
import { TOPICS_BACKFILL_TRACE_LIMIT } from "@/src/features/topics/backfill-limit";
import type { Session } from "next-auth";
import type * as topicsServer from "@langfuse/shared/topics/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  topicProcessingConfigSchema,
  topicEmbeddingConfigSchema,
  DEFAULT_TOPIC_FACETS,
  TOPICS_ANALYSIS_SAMPLING_SEED,
  TOPICS_SLICE_MAX_TRACES,
  type TopicExecution,
  type TopicExecutionInput,
} from "@langfuse/shared/topics";

const mocks = vi.hoisted(() => ({
  getTopicResultCounts: vi.fn(),
  listCurrentTopicSummaries: vi.fn(),
  createTopicExecution: vi.fn(),
  readTopicExecutionSummary: vi.fn(),
  readTopicExecutionTraceErrors: vi.fn(),
  getTopicExecutionCosts: vi.fn(),
  getTopicSummaryCounts: vi.fn(),
  readTopicExecutionForRequest: vi.fn(),
  listTopicExecutions: vi.fn(),
  listTopicFacets: vi.fn(),
  readLatestTopicAssignments: vi.fn(),
  getLatestFacetSummaries: vi.fn(),
  hasStoredTopicSummaries: vi.fn(),
  getPublishedTopicRun: vi.fn(),
  getTopicRuleMap: vi.fn(),
  getTopicFacetVersion: vi.fn(),
  createTopicFacet: vi.fn(),
  createTopicFacetVersion: vi.fn(),
  listTopicRules: vi.fn(),
  getTopicRule: vi.fn(),
  saveTopicRule: vi.fn(),
  getTopicRun: vi.fn(),
  getTopicRuns: vi.fn(),
  readTopicMapAssignments: vi.fn(),
  getTopicsModels: vi.fn(),
  isTopicsProjectEnabled: vi.fn(),
  checkTopicsModelSettings: vi.fn(),
  saveTopicsSetup: vi.fn(),
  setTopicsAutomaticProcessing: vi.fn(),
  enqueueTopicExecution: vi.fn(),
  enqueueTopicSnapshotSetup: vi.fn(),
  readTopicSnapshotSummarizing: vi.fn(),
  writeTopicExecution: vi.fn(),
  writeTopicSnapshotSummarizing: vi.fn(),
  getTopicExecutionQueueState: vi.fn(),
  queryClickhouse: vi.fn(),
  auditLog: vi.fn(),
}));
vi.mock("@langfuse/shared/topics/server", async (importOriginal) => {
  const {
    selectTopicTraceRows,
    topicAnalysisCohort,
    countTopicCohortTraces,
    topicMatchingTraceIdsQuery,
  } = await importOriginal<typeof topicsServer>();
  return {
    ...mocks,
    selectTopicTraceRows,
    topicAnalysisCohort,
    countTopicCohortTraces,
    topicMatchingTraceIdsQuery,
  };
});
vi.mock(
  "@langfuse/shared/src/server/repositories/clickhouse",
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    queryClickhouse: mocks.queryClickhouse,
  }),
);
vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getTopicResultCounts: mocks.getTopicResultCounts,
  listCurrentTopicSummaries: mocks.listCurrentTopicSummaries,
}));
vi.mock("@/src/features/audit-logs/auditLog", () => ({
  auditLog: mocks.auditLog,
}));
vi.mock("@/src/features/posthog-analytics/server/backendActivity", () => ({
  recordBackendActivity: vi.fn(async () => undefined),
}));

import { topicsRouter } from "@/src/features/topics/server/topicsRouter";
import {} from "@/src/features/topics/server/slices";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

const projectId = "project-a";
const facetId = "facet-a";
const facetVersion = 1;
const selectedFacets = [{ facetId, version: facetVersion }];
const timeRange = {
  from: new Date("2026-09-16T00:00:00Z"),
  to: new Date("2026-09-23T00:00:00Z"),
};
const input: Extract<TopicExecutionInput, { operation: "process" }> = {
  projectId,
  requestId: "request-a",
  operation: "process",
  facets: selectedFacets,
  traceIds: ["trace-a"],
  reuseExistingSummaries: false,
  processingConfig: topicProcessingConfigSchema.parse({
    summaryModel: "us.openai.gpt-5.6-luna",
  }),
  embeddingConfig: topicEmbeddingConfigSchema.parse({
    embeddingModel: "eu.cohere.embed-v4:0",
  }),
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

function execution(): TopicExecution & {
  input: Extract<TopicExecutionInput, { operation: "update" }>;
} {
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
      timeRange,
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
  config: { timeRange },
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
  mocks.isTopicsProjectEnabled.mockReturnValue(true);
  mocks.listTopicRules.mockResolvedValue([]);
  mocks.queryClickhouse.mockResolvedValue([]);
  mocks.getTopicsModels.mockResolvedValue({
    summary: { model: "us.openai.gpt-5.6-luna" },
    embedding: { model: "eu.cohere.embed-v4:0", dimensions: 1024 },
  } as Awaited<ReturnType<typeof topicsServer.getTopicsModels>>);
  mocks.getTopicFacetVersion.mockResolvedValue({
    facetId,
    version: facetVersion,
    projectId,
  });
  mocks.readTopicExecutionSummary.mockResolvedValue(execution());
  mocks.getTopicExecutionCosts.mockResolvedValue({});
  mocks.getLatestFacetSummaries.mockResolvedValue([summary]);
  mocks.hasStoredTopicSummaries.mockResolvedValue(false);
  mocks.readTopicExecutionTraceErrors.mockResolvedValue({
    errors: [],
    expired: false,
  });
  mocks.readTopicExecutionForRequest.mockResolvedValue(null);
  mocks.createTopicExecution.mockResolvedValue(execution());
  mocks.getTopicRun.mockResolvedValue(run);
  mocks.getTopicRuns.mockResolvedValue([]);
});

describe("Topics feature access", () => {
  it("rejects reads and execution without an explicit opt-in", async () => {
    const disabled = caller("ADMIN", false);
    await expect(disabled.facets({ projectId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(disabled.trigger(input)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mocks.listTopicFacets).not.toHaveBeenCalled();
    expect(mocks.createTopicExecution).not.toHaveBeenCalled();
    expect(mocks.enqueueTopicExecution).not.toHaveBeenCalled();
  });
});

describe("Topics project allowlist", () => {
  // Every Topics API is behind the visibility gate: outside the allowlist it
  // answers NOT_FOUND before reading or writing anything.
  const outside = () => {
    mocks.isTopicsProjectEnabled.mockReturnValue(false);
    return caller();
  };
  const reads = [
    ["current results", () => outside().currentResults({ projectId })],
    ["topic map", () => outside().map({ projectId, runId: "run-a" })],
    [
      "summary counts",
      () =>
        outside().summaryCounts({
          projectId,
          facets: selectedFacets,
          timeRange,
        }),
    ],
    ["facets", () => outside().facets({ projectId })],
    ["rules", () => outside().rules({ projectId })],
    ["runs", () => outside().executions({ projectId })],
    ["model settings", () => outside().modelSettings({ projectId })],
    ["tracing filter options", () => outside().filterOptions({ projectId })],
    [
      "tracing column topics",
      () =>
        outside().forTraces({
          projectId,
          traces: [{ traceId: "trace-a", timestamp: new Date() }],
        }),
    ],
  ] as const;

  it.each(reads)("hides %s", async (_name, call) => {
    await expect(call()).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.queryClickhouse).not.toHaveBeenCalled();
    expect(mocks.getLatestFacetSummaries).not.toHaveBeenCalled();
    expect(mocks.readLatestTopicAssignments).not.toHaveBeenCalled();
    expect(mocks.readTopicMapAssignments).not.toHaveBeenCalled();
    expect(mocks.getTopicSummaryCounts).not.toHaveBeenCalled();
    expect(mocks.listTopicFacets).not.toHaveBeenCalled();
    expect(mocks.listTopicRules).not.toHaveBeenCalled();
    expect(mocks.listTopicExecutions).not.toHaveBeenCalled();
    expect(mocks.getTopicsModels).not.toHaveBeenCalled();
  });

  it("rejects triggers before reading or creating execution state", async () => {
    await expect(outside().trigger(input)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mocks.readTopicExecutionForRequest).not.toHaveBeenCalled();
    expect(mocks.getTopicFacetVersion).not.toHaveBeenCalled();
    expect(mocks.queryClickhouse).not.toHaveBeenCalled();
    expect(mocks.createTopicExecution).not.toHaveBeenCalled();
    expect(mocks.enqueueTopicExecution).not.toHaveBeenCalled();
  });

  it("rejects retries before reading or changing execution state", async () => {
    await expect(
      outside().retry({ projectId, executionId: "execution-a" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.readTopicExecutionSummary).not.toHaveBeenCalled();
    expect(mocks.getTopicExecutionQueueState).not.toHaveBeenCalled();
    expect(mocks.enqueueTopicExecution).not.toHaveBeenCalled();
  });

  it("rejects turning automatic processing on", async () => {
    await expect(
      outside().setAutomaticProcessing({ projectId, enabled: true }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.setTopicsAutomaticProcessing).not.toHaveBeenCalled();
  });
});

describe("Topics visibility gate", () => {
  const session = ({
    langfuseTopics = true,
    email,
    internalFeatures = true,
    role = "VIEWER",
  }: {
    langfuseTopics?: boolean;
    email?: string;
    internalFeatures?: boolean;
    role?: string | null;
  }) =>
    ({
      expires: "1",
      user: {
        id: "user-a",
        email,
        featureFlags: testFeatureFlags({ langfuseTopics, internalFeatures }),
        organizations: role
          ? [{ id: "org-a", role, projects: [{ id: projectId, role }] }]
          : [],
      },
    }) as unknown as Session;

  // Page, sidebar and API all call this one gate.
  it.each([
    ["a member on an allowlisted project", {}, true, true],
    ["a project outside the allowlist", {}, false, false],
    ["the feature preview turned off", { langfuseTopics: false }, true, false],
    [
      "ClickHouse staff in internal view",
      { email: "member@clickhouse.com", langfuseTopics: false },
      true,
      true,
    ],
    [
      "staff opting out of internal view",
      {
        email: "member@clickhouse.com",
        internalFeatures: false,
        langfuseTopics: false,
      },
      true,
      false,
    ],
    [
      "an explicit grant after opting out of internal view",
      { email: "member@clickhouse.com", internalFeatures: false },
      true,
      true,
    ],
    ["a role without topics:read", { role: "NONE" }, true, false],
    [
      "internal view without project membership",
      { email: "member@clickhouse.com", langfuseTopics: false, role: null },
      true,
      false,
    ],
    [
      "internal view on a non-allowlisted project",
      { email: "member@clickhouse.com" },
      false,
      false,
    ],
  ] as const)("%s", (_case, user, topicsEnabled, expected) => {
    expect(canViewTopics(session(user), { id: projectId, topicsEnabled })).toBe(
      expected,
    );
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
        {
          column: "traceName",
          type: "stringOptions",
          operator: "any of",
          value: ["Support agent"],
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
    expect(request.query).toContain("e.level in (");
    expect(request.query).toContain("e.tags) = true");
    expect(request.query).toContain("e.start_time >= {");
    expect(request.query).toContain("e.start_time < {");
    expect(request.query).toContain("e.trace_id != ''");
    expect(request.query).not.toMatch(
      /e\.(input|output|is_app_root|parent_span_id)\b|\bFINAL\b|\bSAMPLE\b/,
    );
    // A trace matches when any of its spans meets the filters, not only the root.
    expect(request.query).not.toMatch(/is_app_root = true\) = \{/);
    expect(request.params).toMatchObject({
      projectId,
      limit: 20,
      samplingSeed: "sample-seed",
    });
    expect(request.preferredClickhouseService).toBe("EventsReadOnly");
  });

  it("caps manual backfill selection while preserving the full matching count", async () => {
    mocks.queryClickhouse.mockResolvedValue([
      {
        id: "trace-a",
        timestampMs: "1789430400000",
        name: "Agent",
        environment: "default",
        matchedTraceCount: String(TOPICS_BACKFILL_TRACE_LIMIT + 1),
      },
    ]);
    const response = await caller().previewTraces({
      ...selection,
      limit: null,
    });
    expect(response.matchedTraceCount).toBe(1001);
    expect(response.selectedTraceCount).toBe(1000);
    expect(mocks.queryClickhouse.mock.calls[0][0].params.limit).toBe(20);
    await caller().previewTraces({ ...selection, limit: 500 });
    expect(mocks.queryClickhouse.mock.calls[1][0].params.limit).toBe(20);
  });

  it("caps filtered triggers before excluding unchecked traces", async () => {
    mocks.createTopicExecution.mockImplementation(async (resolved) => ({
      ...execution(),
      input: resolved,
      status: "queued",
    }));
    mocks.queryClickhouse.mockResolvedValue(
      Array.from({ length: TOPICS_BACKFILL_TRACE_LIMIT }, (_, index) => ({
        id: `trace-${index}`,
        timestampMs: "1789430400000",
        name: "Agent",
        environment: "default",
        matchedTraceCount: String(TOPICS_BACKFILL_TRACE_LIMIT + 1),
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
    expect(resolved.traceIds).toHaveLength(TOPICS_BACKFILL_TRACE_LIMIT - 1);
    expect(resolved.traceIds[0]).toBe("trace-1");
    expect(resolved.traceIds.at(-1)).toBe(
      `trace-${TOPICS_BACKFILL_TRACE_LIMIT - 1}`,
    );
    expect(mocks.enqueueTopicExecution).toHaveBeenCalledWith(
      projectId,
      "execution-a",
      resolved.traceIds,
    );
    expect(resolved).not.toHaveProperty("selection");
    expect(mocks.queryClickhouse.mock.calls[0][0].query).not.toMatch(
      /is_app_root = true\) = \{/,
    );
    expect(mocks.queryClickhouse.mock.calls[0][0].query).toContain("LIMIT");
    expect(mocks.queryClickhouse.mock.calls[0][0].params.limit).toBe(
      TOPICS_BACKFILL_TRACE_LIMIT,
    );
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

  it("rejects oversized manual backfill selections before querying or creating a run", async () => {
    for (const selectionInput of [
      { selection: { ...selection, limit: TOPICS_BACKFILL_TRACE_LIMIT + 1 } },
      {
        traceIds: Array.from(
          { length: TOPICS_BACKFILL_TRACE_LIMIT + 1 },
          (_, index) => `trace-${index}`,
        ),
      },
    ]) {
      await expect(
        caller().trigger({
          projectId,
          requestId: "oversized-request",
          operation: "process",
          facets: selectedFacets,
          ...selectionInput,
        }),
      ).rejects.toThrow(
        `Select at most ${TOPICS_BACKFILL_TRACE_LIMIT.toLocaleString("en-US")} traces`,
      );
    }
    await expect(
      caller().previewTraces({ ...selection, limit: 1001 }),
    ).rejects.toThrow("Select at most 1,000 traces");
    // High-volume projects keep one-off selections to at most 30 days.
    await expect(
      caller().previewTraces({
        ...selection,
        from: new Date(selection.to.getTime() - 31 * 86_400_000),
      }),
    ).rejects.toThrow("Select at most 30 days of traces");
    expect(mocks.queryClickhouse).not.toHaveBeenCalled();
    expect(mocks.createTopicExecution).not.toHaveBeenCalled();
  });

  it("rejects processing past traces through a rule before any storage access", async () => {
    await expect(
      caller().trigger({
        projectId,
        requestId: "rule-request",
        operation: "process",
        facets: selectedFacets,
        ruleId: "rule-a",
        selection: {
          filter: selection.filter,
          from: selection.from,
          to: selection.to,
          limit: selection.limit,
          sampling: selection.sampling,
          seed: selection.seed,
        },
      }),
    ).rejects.toThrow("Process past traces with a trace filter");
    expect(mocks.getTopicRule).not.toHaveBeenCalled();
    expect(mocks.queryClickhouse).not.toHaveBeenCalled();
    expect(mocks.createTopicExecution).not.toHaveBeenCalled();
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
        unitStartTime: summary.unitStartTime,
        topicId: "topic-a",
        outcome: "assigned",
        x: 10,
        y: 11,
      },
      {
        traceId: "trace-b",
        summary: summary.summary,
        unitStartTime: summary.unitStartTime,
        topicId: null,
        outcome: "outlier",
        x: 20,
        y: 21,
      },
    ]);
    // The map reads its run's own cohort window, whatever the page shows.
    expect(mocks.readTopicMapAssignments).toHaveBeenCalledWith(
      projectId,
      { facetId, version: facetVersion },
      "run-a",
      timeRange,
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
      timeRange,
      ["trace-a"],
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
  it("requires the project's Topics models before creating work", async () => {
    mocks.getTopicsModels.mockResolvedValue(null);
    await expect(caller().trigger(input)).rejects.toThrow(
      "Choose summary, embedding, and clustering models",
    );
    expect(mocks.createTopicExecution).not.toHaveBeenCalled();
    expect(mocks.enqueueTopicExecution).not.toHaveBeenCalled();
  });

  it("rejects a foreign facet before creating or enqueuing work", async () => {
    mocks.getTopicFacetVersion.mockResolvedValue(null);
    await expect(caller().trigger(input)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(mocks.createTopicExecution).not.toHaveBeenCalled();
    expect(mocks.enqueueTopicExecution).not.toHaveBeenCalled();
  });

  it("rejects topic updates spanning more than 93 days before creating work", async () => {
    await expect(
      caller().trigger({
        ...execution().input,
        timeRange: { from: new Date("2026-01-01T00:00:00Z"), to: timeRange.to },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.createTopicExecution).not.toHaveBeenCalled();
  });

  it("updates topics without selecting traces or requiring a previous execution", async () => {
    const request = { ...execution().input, minimumTraceCount: 31 };
    await caller().trigger(request);
    expect(mocks.createTopicExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        ...request,
        requestId: expect.any(String),
        embeddingConfig: {
          ...request.embeddingConfig,
          embeddingModel: "eu.cohere.embed-v4:0",
        },
      }),
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
      timeRange,
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
      timeRange,
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

  it("projects cost estimates into history and execution polling", async () => {
    const priced = { ...execution(), id: "priced", input };
    mocks.listTopicExecutions.mockResolvedValue([
      priced,
      { ...execution(), id: "zero", input },
      { ...execution(), id: "historical", input },
      execution(),
    ]);
    mocks.getTopicExecutionCosts.mockResolvedValue({ priced: 0.012, zero: 0 });

    expect(await caller("VIEWER").executions({ projectId })).toMatchObject([
      { id: "priced", estimatedCost: 0.012 },
      { id: "zero", estimatedCost: 0 },
      { id: "historical", estimatedCost: null },
      { id: "execution-a", estimatedCost: null },
    ]);
    expect(mocks.getTopicExecutionCosts).toHaveBeenCalledExactlyOnceWith(
      projectId,
      ["priced", "zero", "historical"],
    );

    mocks.readTopicExecutionSummary.mockResolvedValue(priced);
    expect(
      await caller("VIEWER").execution({ projectId, executionId: priced.id }),
    ).toMatchObject({ estimatedCost: 0.012 });
    expect(mocks.getTopicExecutionCosts).toHaveBeenLastCalledWith(projectId, [
      priced.id,
    ]);
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
    );
  });

  it("resumes a snapshot that failed before seeding through its summarizing setup", async () => {
    const failed = execution();
    failed.status = "failed";
    failed.phase = "failed";
    failed.facets[0]!.outcome = "pending";
    failed.input.analysis = {
      label: "Billing",
      filter: [],
      seed: "topics-analysis",
      summarize: { limit: 500, selection: "random" },
    };
    mocks.readTopicExecutionSummary.mockResolvedValue(failed);
    mocks.getTopicExecutionQueueState.mockResolvedValue("missing");
    mocks.readTopicSnapshotSummarizing.mockResolvedValue({
      traceIds: null,
      failedTicks: 3,
    });

    await caller().retry({ projectId, executionId: failed.id });

    expect(mocks.writeTopicExecution).toHaveBeenCalledWith(
      expect.objectContaining({ status: "queued", phase: "summarizing" }),
    );
    expect(mocks.enqueueTopicSnapshotSetup).toHaveBeenCalledWith(
      projectId,
      failed.id,
    );
    expect(mocks.enqueueTopicExecution).not.toHaveBeenCalled();
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
  const counts = (facetIds: string[]) =>
    facetIds.map((id) => ({
      facetId: id,
      total: 10,
      usable: 8,
      awaiting: 1,
      assigned: 6,
      outliers: 1,
      notApplicable: 1,
      insufficientInput: 1,
      topics: [
        {
          topicId: "topic-a",
          topicVersionId: "topic-a-v1",
          runId: "run-a",
          count: 5,
        },
      ],
    }));
  beforeEach(() => {
    mocks.hasStoredTopicSummaries.mockResolvedValue(true);
    mocks.getTopicResultCounts.mockImplementation(async ({ facets }) =>
      counts(facets.map((facet: { facetId: string }) => facet.facetId)),
    );
  });

  it("skips counting while the project has no stored summaries", async () => {
    mocks.listTopicFacets.mockResolvedValue([
      { id: facetId, name: "Intent", versions: [{ version: facetVersion }] },
    ]);
    mocks.hasStoredTopicSummaries.mockResolvedValue(false);
    expect(await caller("VIEWER").currentResults({ projectId })).toEqual({
      hasStoredSummaries: false,
      facets: [],
    });
    expect(mocks.getTopicResultCounts).not.toHaveBeenCalled();
  });

  it("lists only the facets enabled on the project's rule", async () => {
    mocks.listTopicFacets.mockResolvedValue([
      { id: facetId, name: "Intent", versions: [{ version: facetVersion }] },
      {
        id: "other-facet",
        name: "Sentiment",
        versions: [{ version: facetVersion }],
      },
    ]);
    mocks.listTopicRules.mockResolvedValue([{ facetIds: [facetId] }] as Awaited<
      ReturnType<typeof topicsServer.listTopicRules>
    >);
    mocks.getPublishedTopicRun.mockResolvedValue(null);
    const result = await caller("VIEWER").currentResults({ projectId });
    expect(result.facets.map((facet) => facet.facetId)).toEqual([facetId]);
  });

  it("shows only the setup rule the setup snapshot before its first refit, never another rule's map", async () => {
    mocks.listTopicFacets.mockResolvedValue([
      { id: facetId, name: "Intent", versions: [{ version: facetVersion }] },
    ]);
    // Oldest first: setup created rule-setup; rule-new came later.
    mocks.listTopicRules.mockResolvedValue([
      { id: "rule-setup", facetIds: [facetId] },
      { id: "rule-new", facetIds: [facetId] },
    ] as Awaited<ReturnType<typeof topicsServer.listTopicRules>>);
    mocks.getTopicRuleMap.mockResolvedValue(null);
    const mapOf = async (ruleId: string) =>
      (await caller("VIEWER").currentResults({ projectId, ruleId })).facets[0]
        ?.map?.runId ?? null;

    mocks.getPublishedTopicRun.mockResolvedValue({ ...run, ruleId: null });
    expect(await mapOf("rule-setup")).toBe(run.id);
    expect(await mapOf("rule-new")).toBeNull();
    mocks.getPublishedTopicRun.mockResolvedValue({ ...run, ruleId: "rule-b" });
    expect(await mapOf("rule-setup")).toBeNull();
  });

  it("counts over the published map's window and names its topics", async () => {
    mocks.listTopicFacets.mockResolvedValue([
      { id: facetId, name: "Intent", versions: [{ version: facetVersion }] },
    ]);
    mocks.getPublishedTopicRun.mockResolvedValue({
      ...run,
      topics: [{ ...run.topics[0], topicVersionId: "topic-a-v1" }],
    });
    const {
      facets: [result],
    } = await caller("VIEWER").currentResults({ projectId });
    expect(mocks.getTopicResultCounts).toHaveBeenCalledWith({
      projectId,
      window: { from: timeRange.from, to: expect.any(Date) },
      facets: [{ facetId, version: facetVersion, runId: run.id }],
    });
    expect(result).toMatchObject({
      counts: { total: 10, assigned: 6, outlier: 1, awaitingMap: 1 },
      topics: [{ id: "topic-a", name: "Refunds", count: 5 }],
      map: { runId: "run-a" },
    });
    expect(JSON.stringify(result)).not.toMatch(/embedding|centroid/);
  });
});

describe("Topics model settings", () => {
  const settings = {
    projectId,
    summary: null,
    embedding: { provider: "key", model: "text-embedding-3-small" },
    embeddingDimensions: 1024,
    clustering: null,
  };

  it("returns the slot check to a writer and rejects a viewer before testing", async () => {
    const errors = {
      embedding: "You are not allowed to generate embeddings from this model",
    };
    mocks.checkTopicsModelSettings.mockResolvedValue(errors);

    await expect(
      caller("VIEWER").testModelSettings(settings),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller().testModelSettings({ ...settings, projectId: "foreign" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.checkTopicsModelSettings).not.toHaveBeenCalled();

    await expect(caller().testModelSettings(settings)).resolves.toEqual(errors);
    expect(mocks.checkTopicsModelSettings).toHaveBeenCalledOnce();
    expect(mocks.checkTopicsModelSettings).toHaveBeenCalledWith(projectId, {
      summary: null,
      embedding: settings.embedding,
      embeddingDimensions: 1024,
      clustering: null,
    });
  });
});

describe("Topics setup", () => {
  const setup = {
    projectId,
    summary: { provider: "key", model: "gpt" },
    embedding: { provider: "key", model: "embed" },
    embeddingDimensions: 1024,
    clustering: { provider: "key", model: "cluster" },
    facets: DEFAULT_TOPIC_FACETS.map((facet) => ({
      name: facet.name,
      enabled: facet.name !== "Sentiment",
    })),
    filter: [
      {
        column: "name",
        type: "string" as const,
        operator: "=" as const,
        value: "billing",
      },
    ],
    traceIdleMs: 120_000,
  };

  it("saves setup for a writer and rejects a viewer before saving", async () => {
    mocks.saveTopicsSetup.mockResolvedValue({ id: "rule-a" });

    await expect(caller("VIEWER").saveSetup(setup)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller().saveSetup({ ...setup, projectId: "foreign" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.saveTopicsSetup).not.toHaveBeenCalled();

    await expect(caller().saveSetup(setup)).resolves.toEqual({ id: "rule-a" });
    expect(mocks.saveTopicsSetup).toHaveBeenCalledOnce();
    expect(mocks.saveTopicsSetup).toHaveBeenCalledWith(
      projectId,
      {
        summary: setup.summary,
        embedding: setup.embedding,
        embeddingDimensions: 1024,
        clustering: setup.clustering,
        facets: setup.facets,
        filter: setup.filter,
        traceIdleMs: 120_000,
      },
      "user-a",
    );
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: "job",
        resourceId: "rule-a",
        action: "create",
        session: expect.objectContaining({
          user: expect.objectContaining({ id: "user-a" }),
        }),
      }),
    );
  });

  it("rejects a filter ingestion cannot match on one observation", async () => {
    for (const filter of [
      [
        {
          column: "totalCost",
          type: "number" as const,
          operator: ">" as const,
          value: 1,
        },
      ],
      [
        {
          column: "name",
          type: "string" as const,
          operator: "does not contain" as const,
          value: "x",
        },
      ],
    ])
      await expect(
        caller().saveSetup({ ...setup, filter }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.saveTopicsSetup).not.toHaveBeenCalled();
  });

  it("rejects a setup with every facet turned off", async () => {
    await expect(
      caller().saveSetup({
        ...setup,
        facets: setup.facets.map((facet) => ({ ...facet, enabled: false })),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.saveTopicsSetup).not.toHaveBeenCalled();
  });
});

describe("Topics automatic processing", () => {
  const rule = {
    id: "rule-a",
    projectId,
    name: "Topics",
    filter: [],
    facetIds: [facetId],
    updatedAt: "2026-10-13T00:00:00Z",
  };

  it("turns processing on with sampling and audit-logs the sampling change", async () => {
    mocks.setTopicsAutomaticProcessing.mockResolvedValue({
      ruleBefore: { ...rule, sampling: 1 },
      ruleAfter: { ...rule, sampling: 0.25 },
    });

    await expect(
      caller().setAutomaticProcessing({
        projectId,
        enabled: true,
        sampling: 0.25,
      }),
    ).resolves.toEqual({ enabled: true, sampling: 0.25 });
    expect(mocks.setTopicsAutomaticProcessing).toHaveBeenCalledWith(
      projectId,
      { enabled: true, sampling: 0.25 },
      "user-a",
    );
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: "job",
        resourceId: "rule-a",
        action: "update",
        before: expect.objectContaining({ sampling: 1 }),
        after: expect.objectContaining({ sampling: 0.25 }),
      }),
    );
  });

  it("turns processing off without logging an unchanged sampling", async () => {
    mocks.setTopicsAutomaticProcessing.mockResolvedValue({
      ruleBefore: { ...rule, sampling: 1 },
      ruleAfter: { ...rule, sampling: 1 },
    });

    await expect(
      caller().setAutomaticProcessing({ projectId, enabled: false }),
    ).resolves.toEqual({ enabled: false, sampling: 1 });
    expect(mocks.auditLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ resourceType: "job" }),
    );
  });
});

describe("Topics write access", () => {
  const facetDraft = {
    name: "Intent",
    description: "",
    prompt: "Describe the original request.",
  };
  const slot = { provider: "key", model: "gpt" };
  const settings = {
    summary: slot,
    embedding: slot,
    embeddingDimensions: 1024,
    clustering: slot,
  };
  const writes: Record<
    string,
    (api: ReturnType<typeof caller>, projectId: string) => Promise<unknown>
  > = {
    saveFacet: (api, projectId) => api.saveFacet({ projectId, ...facetDraft }),
    saveRule: (api, projectId) =>
      api.saveRule({
        projectId,
        name: "Topics",
        filter: [],
        facetIds: [facetId],
      }),
    testModelSettings: (api, projectId) =>
      api.testModelSettings({ projectId, ...settings }),
    saveSetup: (api, projectId) =>
      api.saveSetup({
        projectId,
        ...settings,
        facets: DEFAULT_TOPIC_FACETS.map(({ name }) => ({
          name,
          enabled: true,
        })),
        filter: [],
        traceIdleMs: 120_000,
      }),
    setAutomaticProcessing: (api, projectId) =>
      api.setAutomaticProcessing({ projectId, enabled: true, sampling: 0.5 }),
    trigger: (api, projectId) => api.trigger({ ...input, projectId }),
    retry: (api, projectId) =>
      api.retry({ projectId, executionId: "execution-a" }),
  };
  const writeMocks = [
    mocks.createTopicFacet,
    mocks.createTopicFacetVersion,
    mocks.saveTopicRule,
    mocks.checkTopicsModelSettings,
    mocks.saveTopicsSetup,
    mocks.setTopicsAutomaticProcessing,
    mocks.createTopicExecution,
    mocks.enqueueTopicExecution,
    mocks.auditLog,
  ];

  it.each(Object.entries(writes))(
    "rejects %s for viewers and other projects before any write",
    async (_, write) => {
      await expect(write(caller("VIEWER"), projectId)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(write(caller(), "foreign")).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
      for (const mock of writeMocks) expect(mock).not.toHaveBeenCalled();
    },
  );
});

describe("Topics analyses", () => {
  const condition = (column: string, value: string) => ({
    column,
    type: "string" as const,
    operator: "=" as const,
    value,
  });

  it("previews and runs an analysis on the same seeded sample of summarized traces", async () => {
    const slice = {
      projectId,
      filter: [condition("environment", "production")],
      timeRange,
      facets: selectedFacets,
    };
    mocks.queryClickhouse.mockResolvedValue([{ count: "250" }]);
    mocks.getTopicSummaryCounts.mockResolvedValue([
      { facetId, facetVersion, count: 120 },
    ]);
    mocks.createTopicExecution.mockResolvedValue({
      ...execution(),
      status: "queued",
    });
    expect(await caller().previewAnalysis(slice)).toMatchObject({
      matchedTraceCount: 250,
      summarizedCount: 120,
      ready: true,
    });
    await caller().startAnalysis({ ...slice, label: "Production" });
    const sample = {
      seed: TOPICS_ANALYSIS_SAMPLING_SEED,
      limit: TOPICS_SLICE_MAX_TRACES,
    };
    expect(
      mocks.getTopicSummaryCounts.mock.calls.map((call) => call[4].sample),
    ).toEqual([sample, sample]);
    expect(mocks.getTopicSummaryCounts.mock.calls[0][4].traces.query).toMatch(
      /^SELECT DISTINCT id FROM \(/,
    );
    expect(mocks.createTopicExecution.mock.calls[0][0].analysis.seed).toBe(
      TOPICS_ANALYSIS_SAMPLING_SEED,
    );
    expect(mocks.queryClickhouse.mock.calls[0][0].query).toMatch(
      /^SELECT count\(\) AS count FROM \(SELECT DISTINCT id FROM/,
    );
  });

  it("rejects snapshot windows longer than 14 days before reading anything", async () => {
    const slice = {
      projectId,
      filter: [],
      timeRange: {
        from: new Date("2026-09-08T00:00:00Z"),
        to: new Date("2026-09-23T00:00:00Z"),
      },
      facets: selectedFacets,
    };
    await expect(caller().previewAnalysis(slice)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(
      caller().startAnalysis({ ...slice, label: "Fifteen days" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.getTopicSummaryCounts).not.toHaveBeenCalled();
    expect(mocks.createTopicExecution).not.toHaveBeenCalled();
  });

  it("previews and starts a snapshot when the unsummarized count fails", async () => {
    const slice = {
      projectId,
      filter: [condition("environment", "production")],
      timeRange,
      facets: selectedFacets,
    };
    // Only the unsummarized-trace scan (it reads last_ts) fails, as on a timeout.
    mocks.queryClickhouse.mockImplementation(async ({ query }) => {
      if (query.includes("last_ts")) throw new Error("Timeout exceeded");
      return [{ count: "250" }];
    });
    mocks.getTopicSummaryCounts.mockResolvedValue([
      { facetId, facetVersion, count: 120 },
    ]);
    mocks.createTopicExecution.mockResolvedValue({
      ...execution(),
      status: "queued",
    });
    expect(await caller().previewAnalysis(slice)).toMatchObject({
      summarizedCount: 120,
      unsummarizedCount: null,
    });
    await expect(
      caller().startAnalysis({ ...slice, label: "Production" }),
    ).resolves.toMatchObject({ id: execution().id });
  });

  it("serves an analysis from its own run and window, listing only its members", async () => {
    const base = execution();
    mocks.readTopicExecutionSummary.mockResolvedValue({
      ...base,
      input: {
        ...base.input,
        analysis: { label: "Refund errors", filter: [], seed: "seed" },
      },
    });
    mocks.listTopicFacets.mockResolvedValue([
      { id: facetId, name: "Intent", versions: [{ version: facetVersion }] },
    ]);
    mocks.getTopicRun.mockResolvedValue(run);
    mocks.getTopicResultCounts.mockResolvedValue([
      {
        facetId,
        total: 10,
        usable: 8,
        awaiting: 2,
        assigned: 3,
        outliers: 1,
        notApplicable: 0,
        insufficientInput: 0,
        topics: [{ topicId: "topic-a", count: 3 }],
      },
    ]);
    mocks.listCurrentTopicSummaries.mockResolvedValue({ rows: [] });

    const { facets } = await caller("VIEWER").analysisResults({
      projectId,
      executionId: "execution-a",
    });
    expect(mocks.getTopicResultCounts).toHaveBeenCalledWith({
      projectId,
      window: timeRange,
      facets: [{ facetId, version: facetVersion, runId: run.id }],
    });
    // Summaries are shared, so traces the analysis never clustered do not count.
    expect(facets[0].counts).toMatchObject({ total: 4, awaitingMap: 0 });

    await caller("VIEWER").traces({
      projectId,
      facetId,
      analysisId: "execution-a",
    });
    expect(mocks.listCurrentTopicSummaries).toHaveBeenCalledWith(
      expect.objectContaining({
        window: timeRange,
        publishedRunIds: [run.id],
        conditions: [
          {
            column: "assignmentStatus",
            match: { operator: "any of", values: ["assigned", "outlier"] },
          },
        ],
      }),
    );
  });
});
