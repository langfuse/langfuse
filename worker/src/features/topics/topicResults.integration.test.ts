import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TopicAssignment, TopicSummary } from "@langfuse/shared/topics";
import {
  ensureDefaultTopicFacets,
  writeTopicAssignments,
  writeTopicSummaries,
} from "@langfuse/shared/topics/server";
import {
  getTopicResultCounts,
  listCurrentTopicAssignments,
  listCurrentTopicSummaries,
  type TopicResultCondition,
  type TopicResultCursor,
} from "@langfuse/shared/src/server";
import { clickhouseClient } from "@langfuse/shared/src/server/clickhouse";
import { prisma } from "@langfuse/shared/src/db";

describe("current Topics summaries and assignments", () => {
  const orgId = randomUUID();
  const projectId = randomUUID();
  const window = {
    from: new Date("2026-10-01T00:00:00.000Z"),
    to: new Date("2026-10-08T00:00:00.000Z"),
  };
  const traces = {
    assigned: `t1-${randomUUID()}`,
    stale: `t2-${randomUUID()}`,
    outlier: `t3-${randomUUID()}`,
    insufficient: `t4-${randomUUID()}`,
    unpublished: `t5-${randomUUID()}`,
    internal: `t6-${randomUUID()}`,
  };
  let issues = "";
  let intent = "";
  let publishedRunId = "";

  const summary = (
    traceId: string,
    facetId: string,
    day: number,
    overrides: Partial<TopicSummary> = {},
  ): TopicSummary => ({
    projectId,
    facetId,
    facetVersion: 1,
    traceId,
    sessionId: null,
    triggerType: "manual_poc",
    environment: "production",
    traceName: "checkout",
    unitStartTime: `2026-10-0${day}T12:00:00.000Z`,
    state: "complete",
    summary: `Refund REQUEST for trace ${traceId}`,
    embedding: [1, ...Array<number>(255).fill(0)],
    transcriptId: "t",
    transcriptVersion: "v",
    summaryModel: "test",
    embeddingModel: "test",
    providedUsageDetails: {},
    usageDetails: {},
    providedCostDetails: {},
    costDetails: {},
    processedAt: `2026-10-0${day}T13:00:00.000Z`,
    metadata: {},
    ...overrides,
  });

  const assignment = (
    source: TopicSummary,
    overrides: Partial<TopicAssignment> = {},
  ): TopicAssignment => ({
    projectId,
    facetId: source.facetId,
    facetVersion: source.facetVersion,
    traceId: source.traceId,
    sessionId: source.sessionId,
    environment: source.environment,
    traceName: source.traceName,
    unitStartTime: source.unitStartTime,
    summaryProcessedAt: source.processedAt,
    runId: publishedRunId,
    topicId: "topic-refunds",
    topicVersionId: "topic-refunds-v1",
    distance: 0.1,
    runnerUpDistance: 0.2,
    origin: "initial",
    coordinates: null,
    assignedAt: "2026-10-07T00:00:00.000Z",
    ...overrides,
  });

  const base = {
    projectId,
    window,
    orderBy: "timestamp.desc" as const,
    limit: 50,
  };
  const summaries = (
    conditions: TopicResultCondition[] = [],
    overrides: Partial<Parameters<typeof listCurrentTopicSummaries>[0]> = {},
  ) =>
    listCurrentTopicSummaries({
      ...base,
      facetIds: [issues, intent],
      conditions,
      truncateSummaries: false,
      ...overrides,
    });
  const keys = (result: { rows: { traceId: string; facetId: string }[] }) =>
    result.rows.map((row) => [row.traceId, row.facetId]);
  const traceIds = (result: { rows: { traceId: string }[] }) =>
    result.rows.map((row) => row.traceId);

  beforeAll(async () => {
    await prisma.organization.create({
      data: {
        id: orgId,
        name: "Topic traces test",
        projects: { create: [{ id: projectId, name: "Topic traces" }] },
      },
    });
    const facets = await ensureDefaultTopicFacets(projectId);
    [issues, intent] = facets.map((facet) => facet.id);
    // The first run is published: the newest completed one.
    const runs = await Promise.all(
      ["completed", "running", "completed"].map((status, index) =>
        prisma.topicClusteringRun.create({
          data: {
            projectId,
            facetId: issues,
            facetVersion: 1,
            status,
            createdAt: new Date(Date.UTC(2026, 9, 7 - index)),
          },
        }),
      ),
    );
    publishedRunId = runs[0].id;

    const assigned = summary(traces.assigned, issues, 6);
    const staleOld = summary(traces.stale, issues, 5);
    const stale = { ...staleOld, processedAt: "2026-10-06T00:00:00.000Z" };
    const outlier = summary(traces.outlier, issues, 4, {
      summary: "Long summary. ".repeat(50),
    });
    const unpublished = summary(traces.unpublished, issues, 2);
    await writeTopicSummaries([
      assigned,
      summary(traces.assigned, intent, 6, {
        state: "not_applicable",
        summary: "",
      }),
      staleOld,
      stale,
      outlier,
      summary(traces.insufficient, issues, 3, {
        state: "insufficient_input",
        summary: "",
        sessionId: "session-1",
        traceName: "Überprüfung",
      }),
      unpublished,
      summary(traces.internal, issues, 1, {
        environment: "llm-as-a-judge",
      }),
    ]);
    await writeTopicAssignments([
      assignment(assigned),
      assignment(staleOld),
      assignment(outlier, { topicId: null, topicVersionId: null }),
      assignment(unpublished, { runId: runs[1].id }),
      // Assignments of an older completed run are retired: neither listed nor counted.
      assignment(unpublished, {
        runId: runs[2].id,
        topicId: "topic-retired",
        topicVersionId: "topic-retired-v1",
      }),
      assignment(outlier, {
        runId: runs[2].id,
        topicId: "topic-retired",
        topicVersionId: "topic-retired-v1",
        assignedAt: "2026-10-06T00:00:00.000Z",
      }),
    ]);
  });

  afterAll(async () => {
    for (const table of ["topic_facet_summaries", "topic_assignments"])
      await clickhouseClient().command({
        query: `DELETE FROM ${table} WHERE project_id = {projectId:String}`,
        query_params: { projectId },
        clickhouse_settings: { mutations_sync: "1" },
      });
    await prisma.organization.deleteMany({ where: { id: orgId } });
  });

  it("lists each trace's current summary per facet", async () => {
    const result = await summaries();
    expect(keys(result)).toEqual([
      [traces.assigned, [issues, intent].sort().reverse()[0]],
      [traces.assigned, [issues, intent].sort()[0]],
      [traces.stale, issues],
      [traces.outlier, issues],
      [traces.insufficient, issues],
      [traces.unpublished, issues],
    ]);
    expect(
      result.rows.find((row) => row.traceId === traces.stale),
    ).toMatchObject({
      processedAt: new Date("2026-10-06T00:00:00.000Z"),
      state: "complete",
    });
    expect(
      result.rows.find((row) => row.traceId === traces.insufficient),
    ).toMatchObject({ state: "insufficient_input", traceName: "Überprüfung" });
  });

  it("truncates long summaries and flags them", async () => {
    const rows = (await summaries([], { truncateSummaries: true })).rows;
    const long = rows.find((row) => row.traceId === traces.outlier);
    expect(long).toMatchObject({ summaryTruncated: true });
    expect(long?.summary).toHaveLength(500);
    expect(
      rows.filter((row) => row.summaryTruncated).map((row) => row.traceId),
    ).toEqual([traces.outlier]);
  });

  it("filters summaries by their current assignment only", async () => {
    const byAssignment = (condition: TopicResultCondition) =>
      summaries([condition]).then(keys);
    expect(
      await byAssignment({
        column: "topicId",
        match: { operator: "any of", values: ["topic-refunds"] },
      }),
    ).toEqual([[traces.assigned, issues]]);
    expect(
      await byAssignment({
        column: "assignmentStatus",
        match: { operator: "any of", values: ["awaiting_map", "outlier"] },
      }),
    ).toEqual([
      [traces.stale, issues],
      [traces.outlier, issues],
      [traces.unpublished, issues],
    ]);
  });

  it("lists assignments of the published run for the current summary", async () => {
    const result = await listCurrentTopicAssignments({
      ...base,
      facetIds: [issues, intent],
      conditions: [],
    });
    expect(result.rows).toEqual([
      expect.objectContaining({
        traceId: traces.assigned,
        facetId: issues,
        status: "assigned",
        topicId: "topic-refunds",
        topicVersionId: "topic-refunds-v1",
        runId: publishedRunId,
        assignedAt: new Date("2026-10-07T00:00:00.000Z"),
      }),
      expect.objectContaining({
        traceId: traces.outlier,
        status: "outlier",
        topicId: null,
      }),
    ]);
  });

  it("filters summary attributes", async () => {
    expect(
      traceIds(
        await summaries([
          {
            column: "state",
            match: { operator: "any of", values: ["complete"] },
          },
          {
            column: "timestamp",
            match: { operator: ">=", value: new Date("2026-10-04") },
          },
          {
            column: "traceId",
            match: { operator: "none of", values: [traces.stale] },
          },
        ]),
      ),
    ).toEqual([traces.assigned, traces.outlier]);
    expect(
      keys(
        await summaries([
          {
            column: "state",
            match: { operator: "any of", values: ["not_applicable"] },
          },
        ]),
      ),
    ).toEqual([[traces.assigned, intent]]);
  });

  it("pages trace and facet rows with a keyset cursor", async () => {
    const first = await summaries([], { limit: 1 });
    const second = await summaries([], { limit: 1, cursor: first.next });
    expect([...keys(first), ...keys(second)]).toEqual(
      keys(await summaries([], { limit: 2 })),
    );
    expect(second.rows[0].traceId).toBe(traces.assigned);
    const last = await summaries([], {
      limit: 1,
      orderBy: "timestamp.asc",
    });
    expect(traceIds(last)).toEqual([traces.unpublished]);
    expect(await summaries([], { facetIds: [] })).toEqual({ rows: [] });
  });

  it("lists unassigned summaries with their current assignment", async () => {
    const result = await summaries([{ column: "assigned", match: false }], {
      includeAssignment: true,
    });
    expect(
      result.rows.map((row) => [row.traceId, row.assignment?.status]),
    ).toEqual([
      [traces.assigned, "not_applicable"],
      [traces.stale, "awaiting_map"],
      [traces.outlier, "outlier"],
      [traces.insufficient, "insufficient_input"],
      [traces.unpublished, "awaiting_map"],
    ]);
  });

  it("counts traces per facet and topic in the window", async () => {
    const [issuesCounts, intentCounts] = await getTopicResultCounts({
      projectId,
      window,
      facets: [
        { facetId: issues, version: 1, runId: publishedRunId },
        { facetId: intent, version: 1, runId: null },
      ],
    });
    expect(issuesCounts).toMatchObject({
      total: 5,
      usable: 4,
      insufficientInput: 1,
      assigned: 2,
      outliers: 1,
      topics: [{ topicId: "topic-refunds", count: 2 }],
    });
    expect(intentCounts).toMatchObject({ total: 1, notApplicable: 1 });
  });

  it("returns short pages with a cursor when the candidate budget runs out", async () => {
    const awaiting: TopicResultCondition[] = [
      {
        column: "assignmentStatus",
        match: { operator: "any of", values: ["awaiting_map"] },
      },
    ];
    const pages: string[][][] = [];
    let cursor: TopicResultCursor | undefined;
    do {
      const page = await summaries(awaiting, {
        limit: 10,
        cursor,
        scan: { batchSize: 1, maxBatches: 1 },
      });
      pages.push(keys(page));
      cursor = page.next;
    } while (cursor && pages.length < 20);
    // Budgeted pages can be empty, but together they list every row exactly once.
    expect(pages.some((page) => page.length === 0)).toBe(true);
    expect(pages.flat()).toEqual(keys(await summaries(awaiting)));
  });
});
