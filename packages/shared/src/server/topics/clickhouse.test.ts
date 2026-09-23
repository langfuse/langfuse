import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  TopicAssignment,
  TopicDefinition,
  TopicSummary,
} from "../../topics";
import {
  listTopicSummaries,
  readTopicSummaries,
  readTopicAssignments,
  readTopicMapAssignments,
  readTopicRunSummaryIds,
  writeTopicAssignments,
  readLatestTopicAssignments,
  getLatestFacetSummaries,
  getTopicSummaryCounts,
  writeTopicSummaries,
  topicSummaryId,
  getTopicDefinitions,
  writeTopicDefinitions,
} from "./clickhouse";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  query: vi.fn(),
  publishedRuns: vi.fn(),
}));
vi.mock("../../db", () => ({
  prisma: { topicClusteringRun: { findMany: mocks.publishedRuns } },
}));
vi.mock("../clickhouse/client", () => ({
  clickhouseClient: () => ({ insert: mocks.insert }),
  convertDateToClickhouseDateTime: (date: Date) => date.toISOString(),
}));
vi.mock("../clickhouse/queryTags", () => ({
  buildClickHouseLogComment: () => "{}",
}));
vi.mock("../repositories/clickhouse", () => ({ queryClickhouse: mocks.query }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.query.mockResolvedValue([]);
  mocks.publishedRuns.mockResolvedValue([{ id: "published-run" }]);
});

const clickhouseNumberMap = (values: Record<string, number>) =>
  Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, String(value)]),
  );

const summaryFixture: TopicSummary = {
  id: topicSummaryId({
    projectId: "project-a",
    facetId: "facet-a",
    facetVersion: 1,
    traceId: "trace-a",
    sessionId: null,
  }),
  projectId: "project-a",
  facetId: "facet-a",
  facetVersion: 1,
  traceId: "trace-a",
  sessionId: null,
  triggerType: "manual_poc",
  environment: "production",
  traceName: "billing-assistant",
  unitStartTime: "2026-09-16T00:00:00.000Z",
  state: "complete",
  summary: "Requests an invoice",
  embedding: [0.1, 0.2],
  transcriptId: "poc",
  transcriptVersion: "poc",
  summaryModel: "gpt-4.1-nano",
  embeddingModel: "cohere.embed-v4:0",
  providedUsageDetails: {
    summary_input: 10,
    summary_output: 5,
    embedding_input: 5,
  },
  usageDetails: {
    summary_input: 10,
    summary_output: 5,
    embedding_input: 5,
    total: 20,
  },
  providedCostDetails: { summary_input: 0.0008 },
  costDetails: {
    summary_input: 0.0008,
    summary_output: 0.0002,
    embedding_input: 0.0001,
    total: 0.0011,
  },
  processedAt: "2026-09-16T00:01:00.000Z",
  metadata: {},
};

const assignmentFixture: TopicAssignment = {
  projectId: "project-a",
  facetId: "facet-a",
  facetVersion: 1,
  traceId: "trace-a",
  sessionId: null,
  environment: summaryFixture.environment,
  traceName: summaryFixture.traceName,
  unitStartTime: summaryFixture.unitStartTime,
  summaryId: summaryFixture.id,
  summaryProcessedAt: summaryFixture.processedAt,
  coordinates: null,
  runId: "published-run",
  topicId: null,
  topicVersionId: null,
  distance: null,
  runnerUpDistance: null,
  origin: "online",
  assignedAt: "2026-09-17T01:00:00.000Z",
};

describe("Topics definition storage", () => {
  const topic: TopicDefinition = {
    topicVersionId: "definition-a",
    topicId: "stable-a",
    projectId: "project-a",
    createdByRunId: "run-a",
    createdAt: "2026-09-16T00:00:00.000Z",
    tags: ["billing"],
    name: "Billing",
    description: "Invoice requests",
    centroid: [0.123456789012345, 1],
    radius: 0.123456789012345,
    representativeSummaryIds: ["summary-a"],
    metadata: {},
  };

  it("round-trips the immutable definition, creation provenance and double precision", async () => {
    await writeTopicDefinitions([topic]);
    const inserted = mocks.insert.mock.calls[0][0];
    expect(inserted.table).toBe("topics");
    expect(inserted.values[0]).toMatchObject({
      created_by_run_id: topic.createdByRunId,
      centroid: topic.centroid,
      radius: topic.radius,
    });
    const { createdAt, metadata, ...columns } = topic;
    mocks.query.mockResolvedValue([
      {
        ...columns,
        createdAtMs: String(Date.parse(createdAt)),
        metadataJson: JSON.stringify(metadata),
      },
    ]);
    expect(
      await getTopicDefinitions(topic.projectId, [topic.topicVersionId]),
    ).toEqual([topic]);
  });

  it("bounds exact definition lookups and scopes every batch to its project", async () => {
    const ids = Array.from({ length: 1001 }, (_, index) => `topic-${index}`);
    await getTopicDefinitions("project-a", [...ids, ids[0]]);
    expect(
      mocks.query.mock.calls.map(([query]) => query.params.ids.length),
    ).toEqual([1000, 1]);
    expect(
      mocks.query.mock.calls.flatMap(([query]) => query.params.ids),
    ).toEqual(ids);
    expect(
      mocks.query.mock.calls.every(
        ([query]) =>
          query.params.projectId === "project-a" &&
          query.query.includes("project_id = {projectId:String}"),
      ),
    ).toBe(true);
  });

  it("rejects invalid classifier values before sending any definitions", async () => {
    await expect(
      writeTopicDefinitions([topic, { ...topic, radius: NaN }]),
    ).rejects.toThrow("Invalid topic definition");
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});

describe("Topics summary storage", () => {
  it.each([
    { traceId: null, sessionId: null },
    { traceId: "", sessionId: "" },
  ])(
    "rejects missing source identity before inserting: %j",
    async (identity) => {
      await expect(
        writeTopicSummaries([
          { ...summaryFixture, ...identity } as unknown as TopicSummary,
        ]),
      ).rejects.toThrow("Invalid Topics summary");
      await expect(
        writeTopicAssignments([
          { ...assignmentFixture, ...identity } as unknown as TopicAssignment,
        ]),
      ).rejects.toThrow("Invalid Topics assignment");
      expect(mocks.insert).not.toHaveBeenCalled();
    },
  );

  it("rejects an unfinished summary before sending any rows to ClickHouse", async () => {
    await expect(
      writeTopicSummaries([
        summaryFixture,
        {
          ...summaryFixture,
          id: "unfinished-summary",
          state: "summarized",
          embedding: [],
        },
      ]),
    ).rejects.toThrow("Invalid Topics summary");
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("bounds embedding-heavy inserts by serialized bytes and waits for durable async writes", async () => {
    const rows = Array.from({ length: 512 }, (_, index) => {
      const row = {
        ...summaryFixture,
        traceId: `trace-${index}`,
        embedding: Array.from({ length: 1536 }, () => 0.123456789),
      };
      return { ...row, id: topicSummaryId(row) };
    });
    await writeTopicSummaries(rows);
    expect(mocks.insert.mock.calls.length).toBeGreaterThan(1);
    expect(
      mocks.insert.mock.calls.flatMap(([request]) =>
        request.values.map((row: { trace_id: string }) => row.trace_id),
      ),
    ).toEqual(rows.map((row) => row.traceId));
    for (const [request] of mocks.insert.mock.calls) {
      const bytes = request.values.reduce(
        (sum: number, row: unknown) =>
          sum + Buffer.byteLength(JSON.stringify(row)) + 1,
        0,
      );
      expect(bytes).toBeLessThanOrEqual(8 * 1024 * 1024);
      expect(request.clickhouse_settings).toMatchObject({
        async_insert: 1,
        wait_for_async_insert: 1,
      });
    }
  });

  it("selects the latest result per trace within its project and facet version", async () => {
    await getLatestFacetSummaries("project-a", "facet-a", 1);
    const { query, params } = mocks.query.mock.calls[0][0];
    expect(params).toEqual({
      projectId: "project-a",
      facetId: "facet-a",
      facetVersion: 1,
    });
    expect(query).toContain("project_id = {projectId:String}");
    expect(query).toContain("facet_id = {facetId:String}");
    expect(query).toContain("facet_version = {facetVersion:UInt32}");
    expect(query).toContain(
      "LIMIT 1 BY project_id, facet_id, facet_version, trace_id, if(trace_id = '', session_id, '')",
    );
    expect(query).toContain("ORDER BY processed_at DESC");
  });

  it("resolves current state from the newest processed facet version per source", async () => {
    await getLatestFacetSummaries("project-a", "facet-a");
    const { query, params } = mocks.query.mock.calls[0][0];
    expect(params).toEqual({ projectId: "project-a", facetId: "facet-a" });
    expect(query).not.toContain("facet_version = {facetVersion:UInt32}");
    expect(query).toContain("ORDER BY facet_version DESC, processed_at DESC");
    expect(query).toContain(
      "LIMIT 1 BY project_id, trace_id, if(trace_id = '', session_id, '')",
    );
  });

  it("counts only selected facet/version pairs after deduplicating summaries", async () => {
    mocks.query.mockResolvedValue([
      { facetId: "intent", facetVersion: 1, count: "3" },
      { facetId: "outcome", facetVersion: 2, count: "5" },
    ]);
    const facets = [
      { facetId: "intent", version: 1 },
      { facetId: "outcome", version: 2 },
    ];
    const counts = await getTopicSummaryCounts("project-a", facets, {
      embeddingModel: "cohere.embed-v4:0",
      embeddingDimensions: 256,
    });
    expect(counts).toEqual([
      { facetId: "intent", facetVersion: 1, count: 3 },
      { facetId: "outcome", facetVersion: 2, count: 5 },
    ]);
    const { query, params } = mocks.query.mock.calls[0][0];
    expect(params).toMatchObject({
      projectId: "project-a",
      facetIds: ["intent", "outcome"],
      facetVersions: [1, 2],
    });
    expect(query).toContain(
      "(facet_id, facet_version) IN arrayZip({facetIds:Array(String)}, {facetVersions:Array(UInt32)})",
    );
    expect(query.indexOf("LIMIT 1 BY")).toBeLessThan(
      query.indexOf("WHERE processing_state"),
    );
  });

  it("batches scoped trace and summary lookups without dropping any selected IDs", async () => {
    const traceIds = Array.from(
      { length: 1001 },
      (_, index) => `trace-${index}`,
    );
    for (const [filter, column] of [
      [{ traceIds, facetVersion: 1 }, "trace_id"],
      [{ ids: traceIds, facetVersion: undefined }, "id"],
    ] as const) {
      await listTopicSummaries("project-a", { ...filter, facetId: "facet-a" });
      expect(
        mocks.query.mock.calls.flatMap(([request]) => request.params.ids),
      ).toEqual(traceIds);
      expect(
        mocks.query.mock.calls.every(
          ([request]) => request.params.ids.length <= 1000,
        ),
      ).toBe(true);
      for (const [{ query, params }] of mocks.query.mock.calls) {
        expect(params).toEqual({
          projectId: "project-a",
          facetId: "facet-a",
          ids: expect.any(Array),
          ...(filter.facetVersion ? { facetVersion: filter.facetVersion } : {}),
        });
        expect(query).toContain("project_id = {projectId:String}");
        expect(query).toContain("facet_id = {facetId:String}");
        expect(query).toContain(`${column} IN ({ids:Array(String)})`);
        expect(
          query.includes("AND facet_version = {facetVersion:UInt32}"),
        ).toBe(Boolean(filter.facetVersion));
      }
      mocks.query.mockClear();
    }
    const summaryIds = Array.from(
      { length: 1001 },
      (_, index) => `summary-${index}`,
    );
    await readTopicAssignments("project-a", summaryIds, "run-a");
    expect(
      mocks.query.mock.calls.flatMap(([request]) => request.params.summaryIds),
    ).toEqual(summaryIds);
    expect(
      mocks.query.mock.calls.map(
        ([request]) => request.params.summaryIds.length,
      ),
    ).toEqual([1000, 1]);
    expect(mocks.query.mock.calls[0][0].query).toContain(
      "ORDER BY assigned_at DESC, origin DESC",
    );
    expect(mocks.query.mock.calls[0][0].query).toContain(
      "LIMIT 1 BY project_id, facet_id, facet_version, trace_id, if(trace_id = '', session_id, '')",
    );
  });

  it.each([
    { traceId: "trace-a", sessionId: null },
    { traceId: "trace-a", sessionId: "session-a" },
    { traceId: null, sessionId: "session-a" },
  ] as const)(
    "roundtrips summary identity and provenance: %j",
    async (identity) => {
      const summary: TopicSummary = {
        ...summaryFixture,
        ...identity,
        id: topicSummaryId({ ...summaryFixture, ...identity }),
      };
      await writeTopicSummaries([summary]);
      const inserted = mocks.insert.mock.calls[0][0].values[0];
      expect(inserted).toMatchObject({
        project_id: "project-a",
        trace_id: identity.traceId ?? "",
        session_id: identity.sessionId ?? "",
        trigger_type: "manual_poc",
        environment: summary.environment,
        trace_name: identity.traceId ? summary.traceName : "",
        provided_usage_details: summary.providedUsageDetails,
        usage_details: summary.usageDetails,
        provided_cost_details: summary.providedCostDetails,
        cost_details: summary.costDetails,
      });
      mocks.query.mockResolvedValue([
        {
          ...summary,
          traceId: identity.traceId ?? "",
          sessionId: identity.sessionId ?? "",
          traceName: inserted.trace_name,
          unitStartTimeMs: Date.parse(summary.unitStartTime).toString(),
          processedAtMs: Date.parse(summary.processedAt).toString(),
          providedUsageDetails: clickhouseNumberMap(
            summary.providedUsageDetails,
          ),
          usageDetails: clickhouseNumberMap(summary.usageDetails),
          providedCostDetails: clickhouseNumberMap(summary.providedCostDetails),
          costDetails: clickhouseNumberMap(summary.costDetails),
          metadataJson: "{}",
        },
      ]);
      expect(await readTopicSummaries("project-a", [summary.id])).toEqual([
        { ...summary, traceName: inserted.trace_name },
      ]);
    },
  );

  it("scopes source references by project and facet version while ignoring trace parent sessions", () => {
    expect(
      topicSummaryId({ ...summaryFixture, sessionId: "parent-session" }),
    ).toBe(summaryFixture.id);
    expect(topicSummaryId({ ...summaryFixture, facetVersion: 2 })).not.toBe(
      summaryFixture.id,
    );
    expect(
      topicSummaryId({ ...summaryFixture, facetId: "another-facet" }),
    ).not.toBe(summaryFixture.id);
    expect(
      topicSummaryId({ ...summaryFixture, projectId: "another-project" }),
    ).not.toBe(summaryFixture.id);
    const session = { ...summaryFixture, traceId: null, sessionId: "trace-a" };
    expect(topicSummaryId(session)).not.toBe(summaryFixture.id);
    expect(
      topicSummaryId({ ...session, sessionId: "another-session" }),
    ).not.toBe(topicSummaryId(session));
  });
});

describe("Topics classifications", () => {
  it("derives original map membership from project-scoped assignments", async () => {
    mocks.query.mockResolvedValueOnce([{ summaryId: "discovery-summary" }]);
    expect(await readTopicRunSummaryIds("project-a", "run-a")).toEqual([
      "discovery-summary",
    ]);
    const discoveryQuery = mocks.query.mock.calls[0][0];
    expect(discoveryQuery.params).toEqual({
      projectId: "project-a",
      runId: "run-a",
    });
    for (const filter of [
      "project_id = {projectId:String}",
      "clustering_run_id = {runId:String}",
      "origin = 'initial'",
    ])
      expect(discoveryQuery.query).toContain(filter);
  });

  it("batches valid assignments without dropping results and rejects invalid references", async () => {
    const rows = Array.from({ length: 10_001 }, (_, index) => {
      const row = {
        ...assignmentFixture,
        traceId: `trace-${index}`,
        topicId: "topic-a",
        topicVersionId: "topic-v1",
      };
      row.summaryId = topicSummaryId(row);
      return row;
    });
    await writeTopicAssignments(rows);
    expect(
      mocks.insert.mock.calls.map(([request]) => request.values.length),
    ).toEqual([10_000, 1]);
    expect(
      mocks.insert.mock.calls.flatMap(([request]) =>
        request.values.map((row: { trace_id: string }) => row.trace_id),
      ),
    ).toEqual(rows.map((row) => row.traceId));
    expect(mocks.insert.mock.calls[0][0].values[0]).toMatchObject({
      clustering_run_id: "published-run",
      topic_id: "topic-a",
      topic_version_id: "topic-v1",
    });
    for (const invalid of [
      { topicId: "topic-a" },
      { runId: null, coordinates: [0, 0] },
    ] satisfies Partial<TopicAssignment>[])
      await expect(
        writeTopicAssignments([{ ...assignmentFixture, ...invalid }]),
      ).rejects.toThrow("Invalid Topics assignment");
  });

  it.each([
    { traceId: "trace-a", sessionId: "session-a" },
    { traceId: null, sessionId: "session-a" },
  ] as const)(
    "serializes and reads a published map outlier's source metadata and summary timestamp: %j",
    async (source) => {
      const row: TopicAssignment = { ...assignmentFixture, ...source };
      row.summaryId = topicSummaryId(row);
      await writeTopicAssignments([row]);
      const inserted = mocks.insert.mock.calls[0][0].values[0];
      expect(inserted).toMatchObject({
        trace_id: row.traceId ?? "",
        session_id: row.sessionId ?? "",
        environment: row.environment,
        trace_name: row.traceId ? row.traceName : "",
        clustering_run_id: "published-run",
        topic_id: "",
        topic_version_id: "",
        summary_processed_at: row.summaryProcessedAt,
        coordinates: [],
      });
      mocks.query.mockResolvedValue([
        {
          ...row,
          traceId: row.traceId ?? "",
          sessionId: row.sessionId ?? "",
          traceName: inserted.trace_name,
          topicId: "",
          topicVersionId: "",
          coordinates: [],
          unitStartTimeMs: Date.parse(row.unitStartTime).toString(),
          summaryProcessedAtMs: Date.parse(row.summaryProcessedAt).toString(),
          assignedAtMs: Date.parse(row.assignedAt).toString(),
        },
      ]);
      expect(await readLatestTopicAssignments("project-a", "facet-a")).toEqual([
        { ...row, traceName: inserted.trace_name },
      ]);
      expect(mocks.publishedRuns).toHaveBeenCalledWith({
        where: {
          projectId: "project-a",
          facetId: "facet-a",
          status: "completed",
        },
        select: { id: true },
      });
      const { query, params } = mocks.query.mock.calls[0][0];
      expect(params).toEqual({
        projectId: "project-a",
        facetId: "facet-a",
        publishedRunIds: ["published-run"],
      });
      expect(query).toContain(
        "project_id = {projectId:String} AND facet_id = {facetId:String}",
      );
      expect(query).toContain(
        "AND (clustering_run_id = '' OR clustering_run_id IN ({publishedRunIds:Array(String)}))",
      );
      expect(query).toContain(
        "ORDER BY facet_version DESC, assigned_at DESC, clustering_run_id DESC, origin DESC",
      );
      expect(query).toContain(
        "LIMIT 1 BY project_id, facet_id, trace_id, if(trace_id = '', session_id, '')",
      );
    },
  );

  it("reads latest initial membership including rows with missing coordinates", async () => {
    await readTopicMapAssignments("project-a", "run-a");
    const { query, params } = mocks.query.mock.calls[0][0];
    expect(params).toEqual({
      projectId: "project-a",
      runId: "run-a",
    });
    for (const filter of [
      "project_id = {projectId:String}",
      "clustering_run_id = {runId:String}",
      "origin = 'initial'",
      "trace_id != ''",
    ]) {
      expect(query.indexOf(filter)).toBeGreaterThan(0);
      expect(query.indexOf(filter)).toBeLessThan(query.indexOf("LIMIT 1 BY"));
    }
    expect(query).not.toContain("length(coordinates)");
  });
});
