import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TopicAssignment, TopicSummary } from "../../topics";
import {
  listTopicSummaries,
  readTopicSummaries,
  readTopicAssignments,
  writeTopicAssignments,
  readLatestTopicAssignments,
  getLatestFacetSummaries,
  writeTopicSummaries,
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

describe("Topics summary provenance storage", () => {
  it("accumulates the latest terminal result per unit without letting pending replacements hide it", async () => {
    mocks.query.mockResolvedValue([]);
    await getLatestFacetSummaries("project-a", "facet-a", "version-a");
    const { query, params } = mocks.query.mock.calls[0][0];
    expect(params).toEqual({
      projectId: "project-a",
      facetId: "facet-a",
      facetVersionId: "version-a",
    });
    const checkpointSelection = query.indexOf("LIMIT 1 BY project_id, id");
    const completedSelection = query.indexOf("WHERE state != 'summarized'");
    const unitSelection = query.indexOf(
      "LIMIT 1 BY projectId, facetId, unitType, traceId",
    );
    expect(checkpointSelection).toBeGreaterThan(0);
    expect(completedSelection).toBeGreaterThan(checkpointSelection);
    expect(unitSelection).toBeGreaterThan(completedSelection);
    expect(query).toContain(
      "ORDER BY toUInt64(revision) DESC, processedAtMs DESC, id DESC",
    );
  });

  it("batches large trace and summary lookups without dropping any selected IDs", async () => {
    mocks.query.mockResolvedValue([]);
    const traceIds = Array.from(
      { length: 1001 },
      (_, index) => `trace-${index}`,
    );
    await listTopicSummaries("project-a", { traceIds });
    expect(
      mocks.query.mock.calls.flatMap(([request]) => request.params.traceIds),
    ).toEqual(traceIds);
    expect(
      mocks.query.mock.calls.every(
        ([request]) => request.params.traceIds.length <= 1000,
      ),
    ).toBe(true);
    mocks.query.mockClear();
    const summaryIds = Array.from(
      { length: 20001 },
      (_, index) => `summary-${index}`,
    );
    await readTopicAssignments("project-a", summaryIds, "run-a");
    expect(
      mocks.query.mock.calls.flatMap(([request]) => request.params.summaryIds),
    ).toEqual(summaryIds);
    expect(mocks.query.mock.calls[0][0].query).toContain(
      "ORDER BY assigned_at DESC, id DESC, result_version DESC",
    );
    expect(mocks.query.mock.calls[0][0].query).toContain(
      "LIMIT 1 BY project_id, clustering_run_id, facet_summary_id",
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
      traceIds: ["trace-a"],
    });
    expect(query).toContain("project_id = {projectId:String}");
    expect(query).toContain("facet_id = {facetId:String}");
    expect(query).toContain("unit_id IN ({traceIds:Array(String)})");
    expect(query).not.toContain("AND facet_version_id =");
    await expect(
      listTopicSummaries("project-a", { facetId: "facet-a" }),
    ).rejects.toThrow("explicit bounded cohort");
  });

  it("writes and reads trace identity and manual-trigger provenance", async () => {
    const summary: TopicSummary = {
      id: "summary-a",
      projectId: "project-a",
      facetId: "facet-a",
      facetVersionId: "facet-v1",
      facetVersion: 1,
      traceId: "trace-a",
      unitType: "trace",
      triggerType: "manual_poc",
      traceTimestamp: "2026-09-16T00:00:00.000Z",
      revision: "1",
      executionId: "execution-a",
      resultVersion: 2,
      state: "complete",
      summary: "Requests an invoice",
      embedding: [0.1, 0.2],
      inputHash: "input",
      snapshotHash: "snapshot",
      invocationHash: "invocation",
      summaryModel: "gpt-4.1-nano",
      embeddingModel: "text-embedding-3-small",
      inputTokens: 10,
      outputTokens: 5,
      embeddingTokens: 5,
      summaryCostUsd: 0.001,
      embeddingCostUsd: 0.0001,
      processedAt: "2026-09-16T00:01:00.000Z",
      metadata: {},
    };
    await writeTopicSummaries([summary]);
    const inserted = mocks.insert.mock.calls[0][0].values[0];
    expect(inserted).toMatchObject({
      project_id: "project-a",
      unit_id: "trace-a",
      unit_type: "trace",
      trigger_type: "manual_poc",
    });
    mocks.query.mockResolvedValue([
      {
        ...summary,
        traceTimestampMs: Date.parse(summary.traceTimestamp).toString(),
        processedAtMs: Date.parse(summary.processedAt).toString(),
        metadataJson: "{}",
      },
    ]);
    expect(await readTopicSummaries("project-a", ["summary-a"])).toEqual([
      summary,
    ]);
    expect(mocks.query.mock.calls[0][0].query).toContain(
      "unit_type AS unitType",
    );
    expect(mocks.query.mock.calls[0][0].query).toContain(
      "trigger_type AS triggerType",
    );
  });
});

describe("Topics assignment outcomes", () => {
  it("stores terminal no-map results without retaining topic identities", async () => {
    const row: TopicAssignment = {
      id: "assignment-a",
      projectId: "project-a",
      facetId: "facet-a",
      facetVersionId: "version-a",
      facetVersion: 1,
      traceId: "trace-a",
      unitType: "trace",
      traceTimestamp: "2026-09-17T00:00:00.000Z",
      summaryId: "summary-a",
      summaryRevision: "1",
      runId: null,
      runSequence: null,
      topicId: null,
      topicVersionId: null,
      outcome: "not_applicable",
      distance: null,
      runnerUpDistance: null,
      rejectionReason: "",
      origin: "online",
      assignedAt: "2026-09-17T01:00:00.000Z",
    };
    await writeTopicAssignments([row]);
    expect(mocks.insert.mock.calls[0][0].values[0]).toMatchObject({
      unit_type: "trace",
      clustering_run_id: "",
      run_sequence: "0",
      outcome: "not_applicable",
    });
    await expect(
      writeTopicAssignments([{ ...row, topicId: "stale-topic" }]),
    ).rejects.toThrow("Invalid Topics assignment");
    mocks.query.mockResolvedValue([
      {
        ...row,
        runId: "",
        runSequence: "0",
        topicId: "",
        topicVersionId: "",
        traceTimestampMs: Date.parse(row.traceTimestamp).toString(),
        assignedAtMs: Date.parse(row.assignedAt).toString(),
      },
    ]);
    expect(
      await readLatestTopicAssignments("project-a", { facetId: "facet-a" }),
    ).toEqual([row]);
  });

  it("chooses the newest assignment before applying a topic filter", async () => {
    mocks.query.mockResolvedValue([]);
    await readLatestTopicAssignments("project-a", {
      facetId: "facet-a",
      topicId: "old-topic",
      traceIds: ["trace-a"],
    });
    const { query, params } = mocks.query.mock.calls[0][0];
    expect(params).toEqual({
      projectId: "project-a",
      facetId: "facet-a",
      publishedRunIds: ["published-run"],
      topicId: "old-topic",
      traceIds: ["trace-a"],
    });
    expect(mocks.publishedRuns).toHaveBeenCalledWith({
      where: {
        projectId: "project-a",
        facetVersion: { facetId: "facet-a" },
        status: "completed",
        publishedAt: { not: null },
      },
      select: { id: true },
    });
    const latestSelection = query.indexOf(
      "LIMIT 1 BY project_id, facet_id, unit_type, unit_id",
    );
    expect(latestSelection).toBeGreaterThan(0);
    const publicationFilter = query.indexOf(
      "AND (clustering_run_id = '' OR clustering_run_id IN ({publishedRunIds:Array(String)}))",
    );
    expect(publicationFilter).toBeGreaterThan(0);
    expect(publicationFilter).toBeLessThan(latestSelection);
    expect(query.indexOf("WHERE topicId = {topicId:String}")).toBeGreaterThan(
      latestSelection,
    );
    expect(query).toContain(
      "ORDER BY assigned_at DESC, id DESC, result_version DESC",
    );
  });
});
