import { beforeEach, describe, expect, it, vi } from "vitest";
import { LangfuseNotFoundError, type FilterState } from "@langfuse/shared";

const mocks = vi.hoisted(() => ({
  isTopicsProjectEnabled: vi.fn(),
  listTopicFacets: vi.fn(),
  listTopicRules: vi.fn(),
  getPublishedTopicRun: vi.fn(),
  hasStoredTopicSummaries: vi.fn(),
  readLatestTopicAssignments: vi.fn(),
  getLatestFacetSummaries: vi.fn(),
  getTopicRuns: vi.fn(),
  getTopicTraceUnitTimeRange: vi.fn(),
}));
vi.mock("@langfuse/shared/topics/server", () => mocks);
const readers = vi.hoisted(() => ({
  listCurrentTopicSummaries: vi.fn(),
  listCurrentTopicAssignments: vi.fn(),
  getTopicResultCounts: vi.fn(),
}));
vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...readers,
}));

import {
  getPublicTopic,
  getPublicTopicFacet,
  listPublicTopicAssignments,
  listPublicTopicFacets,
  listPublicTopicRules,
  listPublicTopics,
  listPublicTopicSummaries,
} from "@/src/features/topics/server/publicApi";
import { StructuredPublicApiError } from "@/src/features/public-api/types/structuredPublicApiError";

const projectId = "project-a";
const unitStartTime = "2026-10-19T10:00:00.000Z";
const window = {
  fromTimestamp: new Date("2026-10-13T00:00:00Z"),
  toTimestamp: new Date("2026-10-20T00:00:00Z"),
};

const facet = (id: string, name: string, isBuiltIn = true) => ({
  id,
  projectId,
  name,
  description: `${name} facet`,
  isBuiltIn,
  versions: [
    {
      projectId,
      facetId: id,
      version: 2,
      prompt: `${name} prompt`,
      createdAt: "2026-10-01T00:00:00.000Z",
    },
  ],
});

const definition = (topicId: string, name: string, runId: string) => ({
  topicVersionId: `${topicId}-${runId}`,
  projectId,
  topicId,
  createdByRunId: runId,
  createdAt: "2026-10-18T00:00:00.000Z",
  tags: [],
  name,
  description: `${name} description`,
  centroid: [],
  radius: 0,
  representativeSummaries: [],
});

const issuesRun = {
  id: "run-2",
  projectId,
  facetId: "issues",
  facetVersion: 2,
  status: "completed",
  createdAt: "2026-10-18T00:00:00.000Z",
  startedAt: null,
  finishedAt: "2026-10-18T03:00:00.000Z",
  config: {},
  error: null,
  topics: [
    definition("timeouts", "Tool call timeouts", "run-2"),
    // Reused unchanged from the previous run.
    definition("refunds", "Refund loops", "run-1"),
  ],
};
const oldRun = {
  ...issuesRun,
  id: "run-1",
  topics: [definition("retired", "Retired topic", "run-1")],
};

const summary = (traceId: string, state: string) => ({
  projectId,
  facetId: "issues",
  facetVersion: 2,
  traceId,
  sessionId: null,
  unitStartTime,
  processedAt: "2026-10-19T11:00:00.000Z",
  state,
  summary: `${traceId} summary`,
});

const assignment = (
  traceId: string,
  topic: { topicId: string; runId: string } | null,
) => ({
  projectId,
  facetId: "issues",
  facetVersion: 2,
  traceId,
  sessionId: null,
  unitStartTime,
  summaryProcessedAt: "2026-10-19T11:00:00.000Z",
  runId: topic?.runId ?? "run-2",
  topicId: topic?.topicId ?? null,
  topicVersionId: topic ? `${topic.topicId}-${topic.runId}` : null,
  assignedAt: "2026-10-19T12:00:00.000Z",
});

describe("unstable Topics public API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isTopicsProjectEnabled.mockReturnValue(true);
    mocks.listTopicFacets.mockResolvedValue([
      facet("issues", "Issues"),
      facet("custom", "Custom Facet", false),
    ]);
    mocks.listTopicRules.mockResolvedValue([
      {
        id: "rule-1",
        projectId,
        name: "Support",
        filter: [],
        sampling: 1,
        facetIds: ["issues"],
        updatedAt: "2026-10-01T00:00:00.000Z",
      },
    ]);
    mocks.getPublishedTopicRun.mockImplementation(async (_, facetId) =>
      facetId === "issues" ? issuesRun : null,
    );
    mocks.hasStoredTopicSummaries.mockResolvedValue(true);
    mocks.getLatestFacetSummaries.mockResolvedValue([
      summary("t1", "complete"),
      summary("t2", "complete"),
      summary("t3", "complete"),
      summary("t4", "complete"),
      summary("t5", "complete"),
      summary("t6", "not_applicable"),
      summary("t7", "insufficient_input"),
    ]);
    mocks.readLatestTopicAssignments.mockResolvedValue([
      assignment("t1", { topicId: "timeouts", runId: "run-2" }),
      assignment("t2", { topicId: "timeouts", runId: "run-2" }),
      assignment("t3", { topicId: "retired", runId: "run-1" }),
      assignment("t4", null),
    ]);
    mocks.getTopicRuns.mockResolvedValue([oldRun]);
    readers.getTopicResultCounts.mockImplementation(async ({ facets }) =>
      facets.map(({ facetId }: { facetId: string }) => ({
        facetId,
        total: facetId === "issues" ? 7 : 0,
        usable: 0,
        awaiting: facetId === "issues" ? 1 : 0,
        assigned: facetId === "issues" ? 3 : 0,
        outliers: facetId === "issues" ? 1 : 0,
        notApplicable: facetId === "issues" ? 1 : 0,
        insufficientInput: facetId === "issues" ? 1 : 0,
        topics:
          facetId === "issues"
            ? [
                {
                  topicId: "timeouts",
                  topicVersionId: "timeouts-run-2",
                  runId: "run-2",
                  count: 2,
                },
              ]
            : [],
      })),
    );
  });

  it("returns not found for projects without Topics before reading anything", async () => {
    mocks.isTopicsProjectEnabled.mockReturnValue(false);
    const calls = [
      listPublicTopicFacets({ projectId, page: 1, limit: 50 }),
      getPublicTopicFacet({ projectId, facetId: "issues" }),
      listPublicTopics({
        projectId,
        orderBy: "traceCount.desc",
        page: 1,
        limit: 50,
      }),
      getPublicTopic({ projectId, topicId: "timeouts" }),
      listPublicTopicRules({ projectId, page: 1, limit: 50 }),
      listPublicTopicSummaries({
        projectId,
        plan: null,
        truncateSummaries: false,
        orderBy: "timestamp.desc",
        limit: 50,
      }),
      listPublicTopicAssignments({
        projectId,
        plan: null,
        orderBy: "timestamp.desc",
        limit: 50,
      }),
    ];
    for (const call of calls)
      await expect(call).rejects.toThrow(
        new LangfuseNotFoundError("Topics is not available for this project."),
      );
    expect(mocks.listTopicFacets).not.toHaveBeenCalled();
    expect(mocks.getLatestFacetSummaries).not.toHaveBeenCalled();
    expect(mocks.listTopicRules).not.toHaveBeenCalled();
    expect(readers.listCurrentTopicSummaries).not.toHaveBeenCalled();
    expect(readers.listCurrentTopicAssignments).not.toHaveBeenCalled();
  });

  it("lists active facets by default and filters case-insensitively", async () => {
    const active = await listPublicTopicFacets({
      projectId,
      page: 1,
      limit: 50,
    });
    expect(active.data).toEqual([
      {
        id: "issues",
        name: "Issues",
        description: "Issues facet",
        isBuiltIn: true,
        active: true,
        ruleIds: ["rule-1"],
        version: 2,
        prompt: "Issues prompt",
        publishedRun: {
          id: "run-2",
          completedAt: new Date("2026-10-18T03:00:00.000Z"),
          topicCount: 2,
        },
      },
    ]);
    expect(active.meta).toEqual({
      page: 1,
      limit: 50,
      totalItems: 1,
      totalPages: 1,
    });

    const inactive = await listPublicTopicFacets({
      projectId,
      page: 1,
      limit: 50,
      filter: [
        { type: "boolean", column: "active", operator: "=", value: false },
        {
          type: "string",
          column: "name",
          operator: "contains",
          value: "FACET",
        },
      ],
    });
    expect(inactive.data.map(({ id, active }) => ({ id, active }))).toEqual([
      { id: "custom", active: false },
    ]);

    await expect(
      getPublicTopicFacet({ projectId, facetId: "custom" }),
    ).resolves.toMatchObject({ id: "custom", publishedRun: null });
    await expect(
      getPublicTopicFacet({ projectId, facetId: "missing" }),
    ).rejects.toThrow(LangfuseNotFoundError);
  });

  it("treats every facet as active when the project has no Topics rule", async () => {
    mocks.listTopicRules.mockResolvedValue([]);
    const facets = await listPublicTopicFacets({
      projectId,
      page: 1,
      limit: 50,
    });
    expect(facets.data.map(({ id, active }) => [id, active])).toEqual([
      ["issues", true],
      ["custom", true],
    ]);
    const topics = await listPublicTopics({
      projectId,
      ...window,
      orderBy: "traceCount.desc",
      page: 1,
      limit: 50,
    });
    expect(topics.facets.map(({ facet }) => facet.id)).toEqual([
      "issues",
      "custom",
    ]);
    expect(topics.data.map(({ id }) => id)).toEqual(["timeouts", "refunds"]);
  });

  it("rejects unknown filter columns with the allowed columns", async () => {
    const error = await listPublicTopicFacets({
      projectId,
      page: 1,
      limit: 50,
      filter: [
        { type: "string", column: "constructor", operator: "=", value: "x" },
      ],
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(StructuredPublicApiError);
    expect(error).toMatchObject({
      httpCode: 400,
      code: "invalid_query",
      details: {
        column: "constructor",
        allowedValues: ["id", "name", "description", "isBuiltIn", "active"],
      },
    });
  });

  it("lists current-map topics with trace counts and per-status facet counts", async () => {
    const result = await listPublicTopics({
      projectId,
      ...window,
      orderBy: "traceCount.desc",
      page: 1,
      limit: 50,
    });
    expect(readers.getTopicResultCounts).toHaveBeenCalledExactlyOnceWith({
      projectId,
      window: { from: window.fromTimestamp, to: window.toTimestamp },
      facets: [{ facetId: "issues", version: 2, runId: issuesRun.id }],
    });
    expect(result.window).toEqual({
      from: window.fromTimestamp,
      to: window.toTimestamp,
    });
    expect(result.data).toEqual([
      {
        id: "timeouts",
        versionId: "timeouts-run-2",
        name: "Tool call timeouts",
        description: "Tool call timeouts description",
        facet: { id: "issues", name: "Issues", version: 2 },
        ruleId: "rule-1",
        runId: "run-2",
        traceCount: 2,
      },
      expect.objectContaining({ id: "refunds", runId: "run-1", traceCount: 0 }),
    ]);
    expect(result.facets).toEqual([
      {
        facet: { id: "issues", name: "Issues", version: 2 },
        ruleId: "rule-1",
        publishedRunId: "run-2",
        counts: {
          assigned: 3,
          outlier: 1,
          awaitingMap: 1,
          notApplicable: 1,
          insufficientInput: 1,
        },
      },
    ]);

    const filtered = await listPublicTopics({
      projectId,
      ...window,
      orderBy: "name.asc",
      page: 1,
      limit: 50,
      filter: [
        {
          type: "stringOptions",
          column: "facetName",
          operator: "none of",
          value: ["issues"],
        },
      ],
    });
    expect(filtered.data).toEqual([]);
    expect(filtered.facets).toEqual([]);
    expect(readers.getTopicResultCounts).toHaveBeenCalledTimes(1);
  });

  it("rejects windows longer than 93 days", async () => {
    await expect(
      listPublicTopics({
        projectId,
        fromTimestamp: new Date("2026-01-01T00:00:00Z"),
        toTimestamp: new Date("2026-10-01T00:00:00Z"),
        orderBy: "traceCount.desc",
        page: 1,
        limit: 50,
      }),
    ).rejects.toMatchObject({ httpCode: 400, code: "invalid_query" });
    await expect(
      listPublicTopics({
        projectId,
        fromTimestamp: new Date(Date.now() - 100 * 86_400_000),
        orderBy: "traceCount.desc",
        page: 1,
        limit: 50,
      }),
    ).rejects.toMatchObject({ httpCode: 400, code: "invalid_query" });
    expect(mocks.getLatestFacetSummaries).not.toHaveBeenCalled();
  });

  it("gets topics of the current map by stable id", async () => {
    await expect(
      getPublicTopic({ projectId, topicId: "timeouts", ...window }),
    ).resolves.toMatchObject({
      id: "timeouts",
      inCurrentMap: true,
      traceCount: 2,
    });
    for (const topicId of ["retired", "unknown"])
      await expect(
        getPublicTopic({ projectId, topicId, ...window }),
      ).rejects.toThrow(LangfuseNotFoundError);
  });

  describe("summaries and assignments", () => {
    const listQuery = {
      projectId,
      plan: null,
      ...window,
      orderBy: "timestamp.desc" as const,
      limit: 2,
    };
    const timestamp = new Date("2026-10-19T10:00:00.000Z");
    const processedAt = new Date("2026-10-19T12:00:00.000Z");
    const next = { timestamp, traceId: "t1", facetId: "issues" };

    beforeEach(() => {
      readers.listCurrentTopicSummaries.mockResolvedValue({
        rows: [
          {
            traceId: "t1",
            facetId: "issues",
            facetVersion: 2,
            traceName: "agent",
            environment: "production",
            timestamp,
            state: "complete",
            summary: "t1 summary",
            summaryTruncated: false,
            processedAt,
          },
        ],
        next,
      });
      readers.listCurrentTopicAssignments.mockResolvedValue({
        rows: [
          {
            traceId: "t1",
            facetId: "issues",
            facetVersion: 2,
            timestamp,
            status: "assigned",
            topicId: "refunds",
            topicVersionId: "refunds-run-1",
            runId: "run-1",
            assignedAt: processedAt,
          },
        ],
      });
    });

    it("translates topic, rule and facet filters into the scanned facets", async () => {
      const result = await listPublicTopicSummaries({
        ...listQuery,
        truncateSummaries: true,
        filter: [
          {
            type: "stringOptions",
            column: "ruleId",
            operator: "any of",
            value: ["rule-1"],
          },
          {
            type: "stringOptions",
            column: "topicName",
            operator: "any of",
            value: ["TOOL CALL TIMEOUTS"],
          },
          {
            type: "stringOptions",
            column: "assignmentStatus",
            operator: "any of",
            value: ["assigned"],
          },
        ],
      });
      expect(readers.listCurrentTopicSummaries).toHaveBeenCalledWith({
        projectId,
        window: { from: window.fromTimestamp, to: window.toTimestamp },
        facetIds: ["issues"],
        conditions: [
          {
            column: "topicId",
            match: { operator: "any of", values: ["timeouts"] },
          },
          {
            column: "assignmentStatus",
            match: { operator: "any of", values: ["assigned"] },
          },
        ],
        orderBy: "timestamp.desc",
        limit: 2,
        cursor: undefined,
        truncateSummaries: true,
      });
      expect(result.data).toEqual([
        {
          traceId: "t1",
          traceName: "agent",
          environment: "production",
          timestamp,
          facetId: "issues",
          facetName: "Issues",
          facetVersion: 2,
          state: "complete",
          summary: "t1 summary",
          summaryTruncated: false,
          processedAt,
        },
      ]);
      expect(result.meta.cursor).toEqual(expect.any(String));
    });

    it("names an assignment's topic from the run that assigned it", async () => {
      mocks.getTopicRuns.mockResolvedValue([oldRun, issuesRun]);
      const result = await listPublicTopicAssignments(listQuery);
      expect(result.data).toEqual([
        {
          traceId: "t1",
          timestamp,
          facetId: "issues",
          facetName: "Issues",
          facetVersion: 2,
          ruleId: "rule-1",
          status: "assigned",
          topic: {
            id: "refunds",
            versionId: "refunds-run-1",
            name: "Refund loops",
          },
          runId: "run-1",
          assignedAt: processedAt,
        },
      ]);
      expect(result.meta).toEqual({ cursor: null });
    });

    it("reads a trace id lookup without a window at the traces' own time", async () => {
      const now = new Date("2026-10-20T00:00:00Z");
      vi.useFakeTimers({ now, toFake: ["Date"] });
      const traceRange = {
        from: new Date("2026-08-01T10:00:00Z"),
        to: new Date("2026-08-01T10:00:00.001Z"),
      };
      mocks.getTopicTraceUnitTimeRange.mockResolvedValue(traceRange);
      const filter: FilterState = [
        {
          type: "stringOptions",
          column: "traceId",
          operator: "any of",
          value: ["old-trace"],
        },
      ];
      try {
        const result = await listPublicTopicAssignments({
          ...listQuery,
          fromTimestamp: undefined,
          toTimestamp: undefined,
          filter,
        });
        expect(mocks.getTopicTraceUnitTimeRange).toHaveBeenCalledWith(
          projectId,
          ["old-trace"],
          { from: new Date(now.getTime() - 93 * 86_400_000), to: now },
        );
        expect(readers.listCurrentTopicAssignments).toHaveBeenCalledWith(
          expect.objectContaining({ window: traceRange }),
        );
        expect(result.window).toEqual(traceRange);
      } finally {
        vi.useRealTimers();
      }
    });

    it("caps the window at 30 days and floors it at the plan's data access", async () => {
      const now = new Date("2026-10-20T00:00:00Z");
      vi.useFakeTimers({ now, toFake: ["Date"] });
      try {
        await expect(
          listPublicTopicAssignments({
            ...listQuery,
            fromTimestamp: new Date("2026-09-19T00:00:00Z"),
            toTimestamp: now,
          }),
        ).rejects.toMatchObject({ httpCode: 400, code: "invalid_query" });

        const to = new Date("2026-10-01T00:00:00Z");
        const result = await listPublicTopicAssignments({
          ...listQuery,
          plan: "cloud:hobby",
          fromTimestamp: new Date("2026-09-10T00:00:00Z"),
          toTimestamp: to,
        });
        const hobbyFloor = new Date(now.getTime() - 30 * 86_400_000);
        expect(result.window).toEqual({ from: hobbyFloor, to });
        expect(readers.listCurrentTopicAssignments).toHaveBeenCalledWith(
          expect.objectContaining({ window: { from: hobbyFloor, to } }),
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it("rejects too many trace ids before looking up their time range", async () => {
      await expect(
        listPublicTopicSummaries({
          ...listQuery,
          fromTimestamp: undefined,
          toTimestamp: undefined,
          truncateSummaries: false,
          filter: [
            {
              type: "stringOptions",
              column: "traceId",
              operator: "any of",
              value: Array.from({ length: 101 }, (_, i) => `t${i}`),
            },
          ],
        }),
      ).rejects.toMatchObject({ httpCode: 400, code: "invalid_query" });
      expect(mocks.getTopicTraceUnitTimeRange).not.toHaveBeenCalled();
    });

    it("returns nothing without reading when a topic name matches nothing", async () => {
      const result = await listPublicTopicAssignments({
        ...listQuery,
        filter: [
          {
            type: "stringOptions",
            column: "topicName",
            operator: "any of",
            value: ["No such topic"],
          },
        ],
      });
      expect(result).toEqual({
        window: { from: window.fromTimestamp, to: window.toTimestamp },
        data: [],
        meta: { cursor: null },
      });
      expect(readers.listCurrentTopicAssignments).not.toHaveBeenCalled();
    });

    const condition = (
      column: string,
      operator: "any of" | "none of",
      value: string[],
    ): FilterState[number] => ({
      type: "stringOptions",
      column,
      operator,
      value,
    });

    it.each<[string, FilterState]>([
      ["an unknown column", [condition("tags", "any of", [])]],
      ["an unknown state", [condition("state", "any of", ["summarized"])]],
      [
        "a negated assignment status",
        [condition("assignmentStatus", "none of", ["assigned"])],
      ],
      [
        "an unsupported type for the column",
        [{ type: "string", column: "traceId", operator: "=", value: "t1" }],
      ],
      [
        "the dropped summary text filter",
        [
          {
            type: "string",
            column: "summary",
            operator: "contains",
            value: "x",
          },
        ],
      ],
      [
        "more than 100 trace ids",
        [
          condition(
            "traceId",
            "any of",
            Array.from({ length: 101 }, (_, i) => `t${i}`),
          ),
        ],
      ],
      [
        "too many conditions",
        Array.from({ length: 21 }, () =>
          condition("traceId", "any of", ["t1"]),
        ),
      ],
    ])("rejects %s", async (_, filter) => {
      await expect(
        listPublicTopicSummaries({
          ...listQuery,
          truncateSummaries: false,
          filter,
        }),
      ).rejects.toMatchObject({ httpCode: 400, code: "invalid_query" });
      expect(readers.listCurrentTopicSummaries).not.toHaveBeenCalled();
    });
  });
});
