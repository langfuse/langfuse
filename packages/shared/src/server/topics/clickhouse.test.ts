import { beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import type {
  TopicAssignment,
  TopicDefinition,
  TopicSummary,
} from "../../topics";
import { topicSourceKey } from "../../topics";
import {
  listTopicSummaries,
  readTopicAssignments,
  readTopicMapAssignments,
  readTopicRunTraceIds,
  writeTopicAssignments,
  readLatestTopicAssignments,
  getLatestFacetSummaries,
  getTopicSummaryCounts,
  writeTopicSummaries,
  getTopicDefinitions,
  writeTopicDefinitions,
} from "./clickhouse";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  exec: vi.fn(),
  query: vi.fn(),
  publishedRuns: vi.fn(),
}));
vi.mock("../../db", () => ({
  prisma: { topicClusteringRun: { findMany: mocks.publishedRuns } },
}));
vi.mock("../clickhouse/client", () => ({
  clickhouseClient: () => ({ insert: mocks.insert, exec: mocks.exec }),
  convertDateToClickhouseDateTime: (date: Date) => date.toISOString(),
}));
vi.mock("../clickhouse/queryTags", () => ({
  buildClickHouseLogComment: () => "{}",
}));
vi.mock("../repositories/clickhouse", () => ({ queryClickhouse: mocks.query }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.query.mockResolvedValue([]);
  mocks.exec.mockImplementation(async () => ({ stream: Readable.from([]) }));
  mocks.publishedRuns.mockResolvedValue([{ id: "published-run" }]);
});

const clickhouseNumberMap = (values: Record<string, number>) =>
  Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, String(value)]),
  );

const summaryFixture: TopicSummary = {
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
    representativeSummaries: [],
    metadata: {},
  };

  it.each([
    { count: 10_001, dimensions: 1 },
    { count: 1024, dimensions: 1024 },
  ])(
    "bounds binary definition batches by rows and bytes: %j",
    async ({ count, dimensions }) => {
      const batches: Buffer[][] = [];
      mocks.exec.mockImplementation(async ({ values }) => {
        const batch: Buffer[] = [];
        for await (const value of values) batch.push(value);
        batches.push(batch);
        return { stream: Readable.from([]) };
      });
      await writeTopicDefinitions(
        Array.from({ length: count }, (_, i) => ({
          ...topic,
          topicVersionId: `definition-${i}`,
          centroid: Array.from({ length: dimensions }, () => 0.123456789012345),
        })),
      );
      expect(batches).toHaveLength(2);
      expect(batches.flat()).toHaveLength(count);
      for (const batch of batches) {
        expect(batch.length).toBeLessThanOrEqual(10_000);
        expect(
          batch.reduce((bytes, row) => bytes + row.length, 0),
        ).toBeLessThanOrEqual(8 * 1024 * 1024);
      }
      for (const [request] of mocks.exec.mock.calls) {
        expect(request.query).toContain("FORMAT RowBinary");
        expect(request.clickhouse_settings).toMatchObject({
          async_insert: 1,
          wait_for_async_insert: 1,
        });
      }
    },
  );

  it("propagates a failure while consuming the insert response", async () => {
    mocks.exec.mockResolvedValue({
      stream: Readable.from(
        (async function* () {
          yield Buffer.from("");
          throw new Error("Insert response failed");
        })(),
      ),
    });
    await expect(writeTopicDefinitions([topic])).rejects.toThrow(
      "Insert response failed",
    );
  });

  it("rejects a definition larger than an insert batch", async () => {
    await expect(
      writeTopicDefinitions([
        { ...topic, description: "x".repeat(8 * 1024 * 1024) },
      ]),
    ).rejects.toThrow("maximum insert row size");
    expect(mocks.exec).not.toHaveBeenCalled();
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
    expect(mocks.exec).not.toHaveBeenCalled();
  });
});

describe("Topics summary storage", () => {
  it("keeps trace and session lookups distinct and ignores a trace's parent session", async () => {
    await listTopicSummaries("project-a", {
      facetId: "facet-a",
      facetVersion: 2,
      sources: [
        { traceId: "source-a", sessionId: "parent-a" },
        { traceId: "source-a", sessionId: "parent-b" },
        { traceId: null, sessionId: "source-a" },
      ],
    });
    expect(mocks.query).toHaveBeenCalledOnce();
    const { query, params } = mocks.query.mock.calls[0][0];
    expect(params).toEqual({
      projectId: "project-a",
      facetId: "facet-a",
      facetVersion: 2,
      traceIds: ["source-a", ""],
      sessionIds: ["", "source-a"],
    });
    expect(query).toContain("project_id = {projectId:String}");
    expect(query).toContain("facet_id = {facetId:String}");
    expect(query).toContain("facet_version = {facetVersion:UInt32}");
    expect(query).toContain(
      "(trace_id, if(trace_id = '', session_id, '')) IN arrayZip",
    );
  });

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
      return row;
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

  it("batches source lookups within the selected project and facet version", async () => {
    const traceIds = Array.from(
      { length: 1001 },
      (_, index) => `trace-${index}`,
    );
    const sources = traceIds.map((traceId) => ({ traceId, sessionId: null }));
    const facet = { facetId: "facet-a", version: 2 };
    for (const read of [
      () =>
        listTopicSummaries("project-a", {
          facetId: facet.facetId,
          facetVersion: facet.version,
          traceIds: [...traceIds, traceIds[0]],
        }),
      () =>
        readTopicAssignments(
          "project-a",
          facet,
          [...sources, sources[0]],
          "run-a",
        ),
    ]) {
      await read();
      expect(
        mocks.query.mock.calls.flatMap(([request]) => request.params.traceIds),
      ).toEqual(traceIds);
      expect(
        mocks.query.mock.calls.map(
          ([request]) => request.params.traceIds.length,
        ),
      ).toEqual([1000, 1]);
      for (const [{ query, params }] of mocks.query.mock.calls) {
        expect(params).toMatchObject({
          projectId: "project-a",
          facetId: "facet-a",
          facetVersion: 2,
        });
        expect(query).toContain("project_id = {projectId:String}");
        expect(query).toContain("facet_id = {facetId:String}");
        expect(query).toContain("facet_version = {facetVersion:UInt32}");
        expect(query).toContain(
          "LIMIT 1 BY project_id, facet_id, facet_version, trace_id, if(trace_id = '', session_id, '')",
        );
        expect(query).not.toContain("SHA256");
      }
      mocks.query.mockClear();
    }
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
      expect(
        await listTopicSummaries("project-a", {
          facetId: summary.facetId,
          facetVersion: summary.facetVersion,
          sources: [summary],
        }),
      ).toEqual([{ ...summary, traceName: inserted.trace_name }]);
    },
  );

  it("scopes source references by project and facet version while ignoring trace parent sessions", () => {
    expect(
      topicSourceKey({ ...summaryFixture, sessionId: "parent-session" }),
    ).toBe(topicSourceKey(summaryFixture));
    expect(topicSourceKey({ ...summaryFixture, facetVersion: 2 })).not.toBe(
      topicSourceKey(summaryFixture),
    );
    expect(
      topicSourceKey({ ...summaryFixture, facetId: "another-facet" }),
    ).not.toBe(topicSourceKey(summaryFixture));
    expect(
      topicSourceKey({ ...summaryFixture, projectId: "another-project" }),
    ).not.toBe(topicSourceKey(summaryFixture));
    const session = { ...summaryFixture, traceId: null, sessionId: "trace-a" };
    expect(topicSourceKey(session)).not.toBe(topicSourceKey(summaryFixture));
    expect(
      topicSourceKey({ ...session, sessionId: "another-session" }),
    ).not.toBe(topicSourceKey(session));
  });
});

describe("Topics classifications", () => {
  it("derives original map membership from project-scoped assignments", async () => {
    mocks.query.mockResolvedValueOnce([{ traceId: "discovery-trace" }]);
    expect(
      await readTopicRunTraceIds(
        "project-a",
        { facetId: "facet-a", version: 1 },
        "run-a",
      ),
    ).toEqual(["discovery-trace"]);
    const discoveryQuery = mocks.query.mock.calls[0][0];
    expect(discoveryQuery.params).toEqual({
      projectId: "project-a",
      runId: "run-a",
      facetId: "facet-a",
      facetVersion: 1,
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
    await readTopicMapAssignments(
      "project-a",
      { facetId: "facet-a", version: 1 },
      "run-a",
    );
    const { query, params } = mocks.query.mock.calls[0][0];
    expect(params).toEqual({
      projectId: "project-a",
      runId: "run-a",
      facetId: "facet-a",
      facetVersion: 1,
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
