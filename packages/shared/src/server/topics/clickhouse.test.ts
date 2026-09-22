import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TopicAssignment, TopicSummary } from "../../topics";
import {
  listTopicSummaries,
  readTopicSummaries,
  readTopicAssignments,
  readTopicMapAssignments,
  readTopicRunSummaryIds,
  writeTopicAssignments,
  readLatestTopicAssignments,
  getLatestFacetSummaries,
  writeTopicSummaries,
  topicSummaryId,
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
  mocks.publishedRuns.mockResolvedValue([{ id: "published-run" }]);
});

const summaryFixture: TopicSummary = {
  id: topicSummaryId({
    projectId: "project-a",
    facetVersionId: "facet-v1",
    traceId: "trace-a",
    sessionId: null,
  }),
  projectId: "project-a",
  facetId: "facet-a",
  facetVersionId: "facet-v1",
  facetVersion: 1,
  traceId: "trace-a",
  sessionId: null,
  triggerType: "manual_poc",
  unitStartTime: "2026-09-16T00:00:00.000Z",
  executionId: "execution-a",
  state: "complete",
  summary: "Requests an invoice",
  embedding: [0.1, 0.2],
  transcriptId: "poc",
  transcriptVersion: "poc",
  summaryModel: "gpt-4.1-nano",
  embeddingModel: "text-embedding-3-small",
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
  facetVersionId: summaryFixture.facetVersionId,
  facetVersion: 1,
  traceId: "trace-a",
  sessionId: null,
  unitStartTime: summaryFixture.unitStartTime,
  summaryId: summaryFixture.id,
  summaryProcessedAt: summaryFixture.processedAt,
  coordinates: null,
  runId: null,
  topicId: null,
  topicVersionId: null,
  distance: null,
  runnerUpDistance: null,
  origin: "online",
  assignedAt: "2026-09-17T01:00:00.000Z",
};

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
    mocks.query.mockResolvedValue([]);
    await getLatestFacetSummaries("project-a", "facet-a", "version-a");
    const { query, params } = mocks.query.mock.calls[0][0];
    expect(params).toEqual({
      projectId: "project-a",
      facetId: "facet-a",
      facetVersionId: "version-a",
    });
    expect(query).toContain("project_id = {projectId:String}");
    expect(query).toContain("facet_id = {facetId:String}");
    expect(query).toContain("facet_version_id = {facetVersionId:String}");
    expect(query).toContain(
      "LIMIT 1 BY project_id, facet_version_id, trace_id, if(trace_id = '', session_id, '')",
    );
    expect(query).toContain("ORDER BY processed_at DESC");
  });

  it("resolves current state from the newest processed facet version per source", async () => {
    mocks.query.mockResolvedValue([]);
    await getLatestFacetSummaries("project-a", "facet-a");
    const { query, params } = mocks.query.mock.calls[0][0];
    expect(params).toEqual({ projectId: "project-a", facetId: "facet-a" });
    expect(query).not.toContain("facet_version_id = {facetVersionId:String}");
    expect(query).toContain("ORDER BY facet_version DESC, processed_at DESC");
    expect(query).toContain(
      "LIMIT 1 BY project_id, trace_id, if(trace_id = '', session_id, '')",
    );
  });

  it("batches large trace and summary lookups without dropping any selected IDs", async () => {
    mocks.query.mockResolvedValue([]);
    const traceIds = Array.from(
      { length: 1001 },
      (_, index) => `trace-${index}`,
    );
    for (const [filter, column] of [
      [{ traceIds }, "trace_id"],
      [{ ids: traceIds }, "id"],
    ] as const) {
      await listTopicSummaries("project-a", filter);
      expect(
        mocks.query.mock.calls.flatMap(([request]) => request.params.ids),
      ).toEqual(traceIds);
      expect(
        mocks.query.mock.calls.every(
          ([request]) => request.params.ids.length <= 1000,
        ),
      ).toBe(true);
      expect(mocks.query.mock.calls[0][0].query).toContain(
        `${column} IN ({ids:Array(String)})`,
      );
      mocks.query.mockClear();
    }
    const summaryIds = Array.from(
      { length: 20001 },
      (_, index) => `summary-${index}`,
    );
    await readTopicAssignments("project-a", summaryIds, "run-a");
    expect(
      mocks.query.mock.calls.flatMap(([request]) => request.params.summaryIds),
    ).toEqual(summaryIds);
    expect(mocks.query.mock.calls[0][0].query).toContain(
      "ORDER BY assigned_at DESC, origin DESC",
    );
    expect(mocks.query.mock.calls[0][0].query).toContain(
      "LIMIT 1 BY project_id, facet_version_id, trace_id, if(trace_id = '', session_id, '')",
    );
  });

  it("reads a bounded trace cohort across versions of only the selected project and facet", async () => {
    mocks.query.mockResolvedValue([]);
    await listTopicSummaries("project-a", {
      facetId: "facet-a",
      traceIds: ["trace-a"],
    });
    const { query, params } = mocks.query.mock.calls[0][0];
    expect(params).toEqual({
      projectId: "project-a",
      facetId: "facet-a",
      ids: ["trace-a"],
    });
    expect(query).toContain("project_id = {projectId:String}");
    expect(query).toContain("facet_id = {facetId:String}");
    expect(query).toContain("trace_id IN ({ids:Array(String)})");
    expect(query).not.toContain("AND facet_version_id =");
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
        provided_usage_details: summary.providedUsageDetails,
        usage_details: summary.usageDetails,
        provided_cost_details: summary.providedCostDetails,
        cost_details: summary.costDetails,
      });
      for (const column of [
        "id",
        "revision",
        "result_version",
        "input_hash",
        "invocation_hash",
      ])
        expect(inserted).not.toHaveProperty(column);
      mocks.query.mockResolvedValue([
        {
          ...summary,
          traceId: identity.traceId ?? "",
          sessionId: identity.sessionId ?? "",
          unitStartTimeMs: Date.parse(summary.unitStartTime).toString(),
          processedAtMs: Date.parse(summary.processedAt).toString(),
          providedUsageDetails: Object.fromEntries(
            Object.entries(summary.providedUsageDetails).map(([key, value]) => [
              key,
              String(value),
            ]),
          ),
          usageDetails: Object.fromEntries(
            Object.entries(summary.usageDetails).map(([key, value]) => [
              key,
              String(value),
            ]),
          ),
          providedCostDetails: Object.fromEntries(
            Object.entries(summary.providedCostDetails).map(([key, value]) => [
              key,
              String(value),
            ]),
          ),
          costDetails: Object.fromEntries(
            Object.entries(summary.costDetails).map(([key, value]) => [
              key,
              String(value),
            ]),
          ),
          metadataJson: "{}",
        },
      ]);
      expect(await readTopicSummaries("project-a", [summary.id])).toEqual([
        summary,
      ]);
      expect(mocks.query.mock.calls[0][0].query).toContain(
        "session_id AS sessionId",
      );
      expect(mocks.query.mock.calls[0][0].query).toContain(
        "trigger_type AS triggerType",
      );
    },
  );

  it("scopes source references by project and facet version while ignoring trace parent sessions", () => {
    expect(
      topicSummaryId({ ...summaryFixture, sessionId: "parent-session" }),
    ).toBe(summaryFixture.id);
    expect(
      topicSummaryId({ ...summaryFixture, facetVersionId: "facet-v2" }),
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

  it("batches assignment rows without dropping any results", async () => {
    const rows = Array.from({ length: 10_001 }, (_, index) => {
      const row = { ...assignmentFixture, traceId: `trace-${index}` };
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
  });

  it.each([
    { traceId: "trace-a", sessionId: "session-a" },
    { traceId: null, sessionId: "session-a" },
  ] as const)(
    "roundtrips an ad-hoc outlier's source and summary timestamp: %j",
    async (source) => {
      const row: TopicAssignment = { ...assignmentFixture, ...source };
      row.summaryId = topicSummaryId(row);
      await writeTopicAssignments([row]);
      const inserted = mocks.insert.mock.calls[0][0].values[0];
      expect(inserted).toMatchObject({
        trace_id: row.traceId ?? "",
        session_id: row.sessionId ?? "",
        clustering_run_id: "",
        topic_id: "",
        topic_version_id: "",
        summary_processed_at: row.summaryProcessedAt,
        coordinates: [],
      });
      for (const column of [
        "id",
        "execution_id",
        "summary_revision",
        "run_sequence",
        "outcome",
        "result_version",
      ])
        expect(inserted).not.toHaveProperty(column);
      await expect(
        writeTopicAssignments([{ ...row, topicId: "stale-topic" }]),
      ).rejects.toThrow("Invalid Topics assignment");
      mocks.query.mockResolvedValue([
        {
          ...row,
          traceId: row.traceId ?? "",
          sessionId: row.sessionId ?? "",
          runId: "",
          topicId: "",
          topicVersionId: "",
          coordinates: [],
          unitStartTimeMs: Date.parse(row.unitStartTime).toString(),
          summaryProcessedAtMs: Date.parse(row.summaryProcessedAt).toString(),
          assignedAtMs: Date.parse(row.assignedAt).toString(),
        },
      ]);
      expect(await readLatestTopicAssignments("project-a", "facet-a")).toEqual([
        row,
      ]);
    },
  );

  it("allows ad-hoc topic classifications without a clustering run", async () => {
    const row: TopicAssignment = {
      ...assignmentFixture,
      topicId: "topic-a",
      topicVersionId: "topic-v1",
    };
    await writeTopicAssignments([row]);
    expect(mocks.insert.mock.calls[0][0].values[0]).toMatchObject({
      clustering_run_id: "",
      topic_id: "topic-a",
      topic_version_id: "topic-v1",
    });
    await expect(
      writeTopicAssignments([{ ...row, coordinates: [0, 0] }]),
    ).rejects.toThrow("Invalid Topics assignment");
  });

  it("loads original map coordinates before choosing the latest assignment", async () => {
    mocks.query.mockResolvedValue([]);
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
      "length(coordinates) = 2",
    ]) {
      expect(query.indexOf(filter)).toBeGreaterThan(0);
      expect(query.indexOf(filter)).toBeLessThan(query.indexOf("LIMIT 1 BY"));
    }
  });

  it("reads the latest published or ad-hoc classification for each source", async () => {
    mocks.query.mockResolvedValue([]);
    await readLatestTopicAssignments("project-a", "facet-a");
    expect(mocks.publishedRuns).toHaveBeenCalledWith({
      where: {
        projectId: "project-a",
        facetVersion: { facetId: "facet-a" },
        status: "completed",
        publishedAt: { not: null },
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
  });
});
