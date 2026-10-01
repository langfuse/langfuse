import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type {
  TopicAssignment,
  TopicDefinition,
  TopicSummary,
} from "@langfuse/shared/topics";
import {
  getTopicDefinitions,
  writeTopicDefinitions,
  writeTopicSummaries,
  writeTopicAssignments,
  listTopicSummaries,
  getLatestFacetSummaries,
  getTopicClusteringSummaries,
  getTopicSummaryCounts,
} from "@langfuse/shared/topics/server";
import { clickhouseClient } from "@langfuse/shared/src/server/clickhouse";

describe("Topics definition persistence", () => {
  const projectId = randomUUID();

  afterAll(async () => {
    for (const table of [
      "topics",
      "topic_facet_summaries",
      "topic_assignments",
    ])
      await clickhouseClient().command({
        query: `DELETE FROM ${table} WHERE project_id = {projectId:String}`,
        query_params: { projectId },
        clickhouse_settings: { mutations_sync: "1" },
      });
  });

  it("partitions by source time while preserving replacement and published map identities", async () => {
    const summary: TopicSummary = {
      projectId,
      facetId: "facet",
      facetVersion: 1,
      traceId: randomUUID(),
      sessionId: null,
      triggerType: "manual_poc",
      environment: "default",
      traceName: "trace",
      unitStartTime: "2026-08-31T23:59:59.999Z",
      state: "complete",
      summary: "old",
      embedding: [1, ...Array<number>(255).fill(0)],
      transcriptId: "poc",
      transcriptVersion: "poc",
      summaryModel: "test",
      embeddingModel: "cohere.embed-v4:0",
      providedUsageDetails: {},
      usageDetails: {},
      providedCostDetails: {},
      costDetails: {},
      processedAt: "2026-09-01T00:00:00.000Z",
      metadata: {},
    };
    await writeTopicSummaries([
      summary,
      {
        ...summary,
        summary: "latest",
        sessionId: "parent-session",
        processedAt: "2026-10-01T00:00:00.000Z",
      },
    ]);
    const assignment: TopicAssignment = {
      projectId,
      facetId: summary.facetId,
      facetVersion: 1,
      traceId: summary.traceId,
      sessionId: null,
      environment: "default",
      traceName: "trace",
      unitStartTime: summary.unitStartTime,
      summaryProcessedAt: summary.processedAt,
      runId: "published",
      topicId: null,
      topicVersionId: null,
      distance: null,
      runnerUpDistance: null,
      origin: "initial",
      coordinates: [1, 2],
      assignedAt: "2026-09-01T00:00:00.000Z",
    };
    await writeTopicAssignments([
      assignment,
      {
        ...assignment,
        sessionId: "parent-session",
        assignedAt: "2026-10-01T00:00:00.000Z",
      },
      {
        ...assignment,
        origin: "online",
        coordinates: null,
        assignedAt: "2026-10-02T00:00:00.000Z",
      },
      {
        ...assignment,
        runId: "unpublished",
        assignedAt: "2026-10-03T00:00:00.000Z",
      },
    ]);
    const summaries = await clickhouseClient().query({
      query: `SELECT _partition_id AS partition, summary, session_id FROM topic_facet_summaries FINAL
        WHERE project_id = {projectId:String} AND unit_start_time >= '2026-08-01' AND unit_start_time < '2026-09-01'`,
      query_params: { projectId },
      format: "JSONEachRow",
    });
    expect(await summaries.json()).toEqual([
      { partition: "202608", summary: "latest", session_id: "parent-session" },
    ]);
    const assignments = await clickhouseClient().query({
      query: `SELECT _partition_id AS partition, clustering_run_id AS run, origin, coordinates FROM topic_assignments FINAL
        WHERE project_id = {projectId:String} AND unit_start_time >= '2026-08-01' AND unit_start_time < '2026-09-01'
        ORDER BY run, origin`,
      query_params: { projectId },
      format: "JSONEachRow",
    });
    expect(await assignments.json()).toEqual([
      {
        partition: "202608",
        run: "published",
        origin: "initial",
        coordinates: [1, 2],
      },
      {
        partition: "202608",
        run: "published",
        origin: "online",
        coordinates: [],
      },
      {
        partition: "202608",
        run: "unpublished",
        origin: "initial",
        coordinates: [1, 2],
      },
    ]);
    const filter = {
      facetId: summary.facetId,
      facetVersion: 1,
      traceIds: [summary.traceId!],
    };
    expect(
      (
        await listTopicSummaries(projectId, filter, {
          from: new Date(summary.unitStartTime),
          to: new Date(Date.parse(summary.unitStartTime) + 1),
        })
      ).map(({ summary }) => summary),
    ).toEqual(["latest"]);
    expect(
      await listTopicSummaries(projectId, filter, {
        from: new Date("2026-08-01T00:00:00.000Z"),
        to: new Date(summary.unitStartTime),
      }),
    ).toEqual([]);

    const oldRange = {
      from: new Date("2026-08-01T00:00:00.000Z"),
      to: new Date("2026-09-01T00:00:00.000Z"),
    };
    const newRange = {
      from: oldRange.to,
      to: new Date("2026-10-01T00:00:00.000Z"),
    };
    const moved: TopicSummary = {
      ...summary,
      unitStartTime: "2026-09-01T00:00:00.000Z",
      processedAt: "2026-10-02T00:00:00.000Z",
      state: "not_applicable",
      summary: "",
      embedding: [],
    };
    await writeTopicSummaries([moved, summary]);
    const embedding = {
      embeddingModel: "cohere.embed-v4:0" as const,
      embeddingDimensions: 256 as const,
    };
    expect(
      await Promise.all([
        listTopicSummaries(projectId, filter, oldRange),
        getLatestFacetSummaries(projectId, "facet", undefined, oldRange),
        getTopicClusteringSummaries(projectId, "facet", 1, embedding, oldRange),
        getTopicSummaryCounts(
          projectId,
          [{ facetId: "facet", version: 1 }],
          embedding,
          oldRange,
        ),
      ]),
    ).toEqual([[], [], [], [{ facetId: "facet", facetVersion: 1, count: 0 }]]);

    await writeTopicSummaries([
      { ...summary, facetVersion: 2, processedAt: "2026-10-03T00:00:00.000Z" },
    ]);
    expect(
      await getLatestFacetSummaries(projectId, "facet", undefined, newRange),
    ).toEqual([]);
    expect(
      await getLatestFacetSummaries(projectId, "facet", 1, newRange),
    ).toEqual([moved]);
  });

  it("round-trips Float64 geometry and normalized source references through ClickHouse", async () => {
    const topic: TopicDefinition = {
      projectId,
      topicVersionId: randomUUID(),
      topicId: randomUUID(),
      createdByRunId: randomUUID(),
      createdAt: "2026-09-24T21:21:07.329Z",
      name: "Rechnungen — 請求書 💶",
      description: "Résumé and invoice requests. ".repeat(10),
      // This value loses a Float64 bit in ClickHouse's JSON number parser.
      centroid: Array.from({ length: 1024 }, (_, i) =>
        i === 847 ? -0.003662027125082599 : Math.sin(i) / 32,
      ),
      radius: 0.003662027125082599,
      tags: ["billing", "請求書"],
      representativeSummaries: [
        {
          facetId: "facet-a",
          facetVersion: 257,
          traceId: "source/請求書",
          sessionId: null,
        },
        {
          facetId: "facet-a",
          facetVersion: 257,
          traceId: null,
          sessionId: "source/請求書",
        },
      ],
      metadata: { effectiveMemberCount: 15, lineage: [], source: "請求書" },
    };
    const other: TopicDefinition = {
      ...topic,
      topicVersionId: randomUUID(),
      topicId: randomUUID(),
      createdAt: "2026-09-24T21:21:07.330Z",
      centroid: [1, 0, -1],
      radius: 0,
      tags: [],
      representativeSummaries: [],
      metadata: {},
    };

    await writeTopicDefinitions([
      {
        ...topic,
        representativeSummaries: topic.representativeSummaries.map(
          (source) => ({
            ...source,
            sessionId: source.traceId ? "parent-session" : source.sessionId,
          }),
        ),
      },
      other,
    ]);
    const ids = [topic.topicVersionId, other.topicVersionId];
    const timeRange = {
      from: new Date(topic.createdAt),
      to: new Date(Date.parse(other.createdAt) + 1),
    };
    expect(await getTopicDefinitions(projectId, ids, timeRange)).toEqual([
      other,
      topic,
    ]);
    expect(await getTopicDefinitions(randomUUID(), ids, timeRange)).toEqual([]);
    expect(
      await getTopicDefinitions(projectId, ids, {
        from: timeRange.to,
        to: new Date("2026-10-01T00:00:00.000Z"),
      }),
    ).toEqual([]);
  });
});
