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
}));
vi.mock("@langfuse/shared/topics/server", () => mocks);
const listCurrentTopicTraces = vi.hoisted(() => vi.fn());
vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listCurrentTopicTraces,
}));

import {
  getPublicTopic,
  getPublicTopicFacet,
  listPublicTopicFacets,
  listPublicTopics,
  listPublicTopicTraces,
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
    mocks.listTopicRules.mockResolvedValue([{ facetIds: ["issues"] }]);
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
      listPublicTopicTraces({
        projectId,
        includeTotal: false,
        truncateSummaries: false,
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
    expect(listCurrentTopicTraces).not.toHaveBeenCalled();
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
    expect(mocks.getLatestFacetSummaries).toHaveBeenCalledTimes(1);
    expect(mocks.getLatestFacetSummaries).toHaveBeenCalledWith(
      projectId,
      "issues",
      undefined,
      { from: window.fromTimestamp, to: window.toTimestamp },
      undefined,
    );
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
        runId: "run-2",
        traceCount: 2,
      },
      expect.objectContaining({ id: "refunds", runId: "run-1", traceCount: 0 }),
    ]);
    expect(result.facets).toEqual([
      {
        facet: { id: "issues", name: "Issues", version: 2 },
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
    expect(mocks.getLatestFacetSummaries).toHaveBeenCalledTimes(1);
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

  it("gets current and retired topics by stable id", async () => {
    await expect(
      getPublicTopic({ projectId, topicId: "timeouts", ...window }),
    ).resolves.toMatchObject({
      id: "timeouts",
      inCurrentMap: true,
      traceCount: 2,
    });
    await expect(
      getPublicTopic({ projectId, topicId: "retired", ...window }),
    ).resolves.toMatchObject({
      id: "retired",
      versionId: "retired-run-1",
      runId: "run-1",
      name: "Retired topic",
      inCurrentMap: false,
      traceCount: 1,
    });
    await expect(
      getPublicTopic({ projectId, topicId: "unknown", ...window }),
    ).rejects.toThrow(LangfuseNotFoundError);
  });

  describe("topics for traces", () => {
    const traceQuery = {
      projectId,
      ...window,
      includeTotal: true,
      truncateSummaries: false,
      orderBy: "timestamp.desc" as const,
      limit: 2,
    };
    const timestamp = new Date("2026-10-19T10:00:00.000Z");
    const processedAt = new Date("2026-10-19T12:00:00.000Z");

    beforeEach(() => {
      listCurrentTopicTraces.mockResolvedValue({
        rows: [
          {
            traceId: "t1",
            traceName: "agent",
            environment: "production",
            timestamp,
            processedAt,
            results: [
              {
                facetId: "issues",
                facetVersion: 2,
                status: "assigned",
                summary: "t1 summary",
                summaryTruncated: false,
                processedAt,
                topicId: "timeouts",
                topicVersionId: "timeouts-run-2",
                runId: "run-2",
              },
            ],
          },
        ],
        next: { timestamp, traceId: "t1" },
        total: 3,
      });
      mocks.getTopicRuns.mockResolvedValue([issuesRun]);
    });

    it("translates facet-keyed filters and maps each requested facet", async () => {
      const result = await listPublicTopicTraces({
        ...traceQuery,
        facets: ["Issues", "custom"],
        filter: [
          {
            type: "categoryOptions",
            column: "topicName",
            key: "issues",
            operator: "any of",
            value: ["tool call TIMEOUTS"],
          },
          {
            type: "categoryOptions",
            column: "topicStatus",
            key: "ISSUES",
            operator: "any of",
            value: ["assigned"],
          },
        ],
      });

      expect(listCurrentTopicTraces).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId,
          window: { from: window.fromTimestamp, to: window.toTimestamp },
          facetIds: ["issues", "custom"],
          projectedFacetIds: ["issues", "custom"],
          conditions: [
            {
              column: "topicId",
              facetId: "issues",
              match: { operator: "any of", values: ["timeouts"] },
            },
            {
              column: "topicStatus",
              facetId: "issues",
              match: { operator: "any of", values: ["assigned"] },
            },
          ],
          limit: 2,
          includeTotal: true,
        }),
      );
      expect(result.data).toEqual([
        {
          traceId: "t1",
          traceName: "agent",
          environment: "production",
          timestamp,
          traceUrl: `/project/${projectId}/traces/t1`,
          processedAt,
          facets: [
            {
              facetId: "issues",
              facetName: "Issues",
              facetVersion: 2,
              state: "complete",
              summary: "t1 summary",
              summaryTruncated: false,
              processedAt,
              assignment: {
                status: "assigned",
                topic: {
                  id: "timeouts",
                  versionId: "timeouts-run-2",
                  name: "Tool call timeouts",
                },
              },
            },
            {
              facetId: "custom",
              facetName: "Custom Facet",
              facetVersion: null,
              state: "not_processed",
              summary: null,
              summaryTruncated: false,
              processedAt: null,
              assignment: null,
            },
          ],
        },
      ]);
      expect(result.meta.totalItems).toBe(3);
      expect(
        JSON.parse(
          Buffer.from(result.meta.cursor!, "base64url").toString("utf-8"),
        ),
      ).toEqual({ v: 1, timestamp: timestamp.toISOString(), traceId: "t1" });
    });

    it("projects active facets by default", async () => {
      await listPublicTopicTraces(traceQuery);
      expect(listCurrentTopicTraces).toHaveBeenCalledWith(
        expect.objectContaining({
          facetIds: ["issues"],
          projectedFacetIds: ["issues"],
          conditions: [],
        }),
      );
    });

    it.each<[string, FilterState[number], string[]]>([
      [
        "topic name",
        {
          type: "stringOptions",
          column: "topicName",
          operator: "any of",
          value: ["tool call timeouts"],
        },
        ["custom", "issues"],
      ],
      [
        "topic id",
        {
          type: "stringOptions",
          column: "topicId",
          operator: "none of",
          value: ["timeouts"],
        },
        ["custom", "issues"],
      ],
      [
        "topic id outside the published maps",
        {
          type: "stringOptions",
          column: "topicId",
          operator: "any of",
          value: ["retired"],
        },
        ["custom", "issues"],
      ],
    ])(
      "scans the facets owning an unkeyed %s filter",
      async (_, condition, facetIds) => {
        await listPublicTopicTraces({
          ...traceQuery,
          facets: ["custom"],
          filter: [condition],
        });
        expect(listCurrentTopicTraces).toHaveBeenCalledWith(
          expect.objectContaining({
            facetIds,
            projectedFacetIds: ["custom"],
          }),
        );
      },
    );

    it("returns no traces without reading when a topic name matches nothing", async () => {
      const result = await listPublicTopicTraces({
        ...traceQuery,
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
        meta: { cursor: null, totalItems: 0 },
      });
      expect(listCurrentTopicTraces).not.toHaveBeenCalled();
    });

    it.each<[string, FilterState[number]]>([
      [
        "an unknown column",
        {
          type: "stringOptions",
          column: "tags",
          operator: "any of",
          value: [],
        },
      ],
      [
        "an unknown facet key",
        {
          type: "categoryOptions",
          column: "topicStatus",
          key: "missing",
          operator: "any of",
          value: ["assigned"],
        },
      ],
      [
        "an unknown topic status",
        {
          type: "categoryOptions",
          column: "topicStatus",
          key: "issues",
          operator: "any of",
          value: ["summarized"],
        },
      ],
      ...[-1, 1.5].map((value): [string, FilterState[number]] => [
        `facet version ${value}`,
        {
          type: "numberObject",
          column: "facetVersion",
          key: "issues",
          operator: ">=",
          value,
        },
      ]),
      [
        "an unsupported type for the column",
        { type: "string", column: "userId", operator: "=", value: "u1" },
      ],
    ])("rejects %s", async (_, condition) => {
      await expect(
        listPublicTopicTraces({ ...traceQuery, filter: [condition] }),
      ).rejects.toMatchObject({ httpCode: 400, code: "invalid_query" });
      expect(listCurrentTopicTraces).not.toHaveBeenCalled();
    });

    it("rejects filters over the condition limit", async () => {
      await expect(
        listPublicTopicTraces({
          ...traceQuery,
          filter: Array.from({ length: 21 }, () => ({
            type: "stringOptions" as const,
            column: "traceId",
            operator: "any of" as const,
            value: ["t1"],
          })),
        }),
      ).rejects.toMatchObject({ httpCode: 400, code: "invalid_query" });
    });
  });
});
