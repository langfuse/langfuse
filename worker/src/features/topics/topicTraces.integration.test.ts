import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TopicAssignment, TopicSummary } from "@langfuse/shared/topics";
import {
  ensureDefaultTopicFacets,
  writeTopicAssignments,
  writeTopicSummaries,
} from "@langfuse/shared/topics/server";
import {
  listCurrentTopicTraces,
  type TopicTraceCondition,
  type TopicTraceStatus,
} from "@langfuse/shared/src/server";
import { clickhouseClient } from "@langfuse/shared/src/server/clickhouse";
import { prisma } from "@langfuse/shared/src/db";

describe("listCurrentTopicTraces", () => {
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

  const list = (
    conditions: TopicTraceCondition[] = [],
    overrides: Partial<Parameters<typeof listCurrentTopicTraces>[0]> = {},
  ) =>
    listCurrentTopicTraces({
      projectId,
      window,
      facetIds: [issues, intent],
      projectedFacetIds: [issues, intent],
      conditions,
      orderBy: "timestamp.desc",
      limit: 50,
      includeTotal: false,
      truncateSummaries: false,
      ...overrides,
    });
  const ids = (result: Awaited<ReturnType<typeof list>>) =>
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
    const runs = await Promise.all(
      ["completed", "running"].map((status) =>
        prisma.topicClusteringRun.create({
          data: { projectId, facetId: issues, facetVersion: 1, status },
        }),
      ),
    );
    publishedRunId = runs[0].id;

    const assigned = summary(traces.assigned, issues, 6);
    const staleOld = summary(traces.stale, issues, 5);
    const stale = { ...staleOld, processedAt: "2026-10-06T00:00:00.000Z" };
    const outlier = summary(traces.outlier, issues, 4);
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

  it("resolves each facet's current result like the Topics page", async () => {
    const result = await list([], { includeTotal: true });
    expect(ids(result)).toEqual([
      traces.assigned,
      traces.stale,
      traces.outlier,
      traces.insufficient,
      traces.unpublished,
    ]);
    expect(result.total).toBe(5);
    const statuses = Object.fromEntries(
      result.rows.map((row) => [
        row.traceId,
        row.results.map((facet) => [facet.facetId, facet.status]),
      ]),
    );
    expect(statuses).toEqual({
      [traces.assigned]: expect.arrayContaining([
        [issues, "assigned"],
        [intent, "not_applicable"],
      ]),
      [traces.stale]: [[issues, "awaiting_map"]],
      [traces.outlier]: [[issues, "outlier"]],
      [traces.insufficient]: [[issues, "insufficient_input"]],
      [traces.unpublished]: [[issues, "awaiting_map"]],
    });
    const assigned = result.rows[0].results.find(
      (facet) => facet.facetId === issues,
    );
    expect(assigned).toMatchObject({
      topicId: "topic-refunds",
      topicVersionId: "topic-refunds-v1",
      runId: publishedRunId,
      processedAt: new Date("2026-10-07T00:00:00.000Z"),
    });
    const stale = result.rows[1].results[0];
    expect(stale).toMatchObject({ topicId: null, runId: null });
  });

  it("filters by facet-scoped status, including not processed", async () => {
    const status = (
      facetId: string,
      operator: "any of" | "none of",
      values: TopicTraceStatus[],
    ): TopicTraceCondition => ({
      column: "topicStatus",
      facetId,
      match: { operator, values },
    });
    expect(ids(await list([status(issues, "any of", ["assigned"])]))).toEqual([
      traces.assigned,
    ]);
    expect(ids(await list([status(issues, "none of", ["assigned"])]))).toEqual([
      traces.stale,
      traces.outlier,
      traces.insufficient,
      traces.unpublished,
    ]);
    expect(
      ids(await list([status(intent, "any of", ["not_processed"])])),
    ).toHaveLength(4);
    expect(
      ids(
        await list([
          status(issues, "any of", ["assigned"]),
          status(intent, "any of", ["not_applicable"]),
        ]),
      ),
    ).toEqual([traces.assigned]);
    expect(
      ids(await list([status(intent, "none of", ["not_processed"])])),
    ).toEqual([traces.assigned]);
  });

  it("never matches a topic through an assignment of an older summary", async () => {
    expect(
      ids(
        await list([
          {
            column: "topicId",
            match: { operator: "any of", values: ["topic-refunds"] },
          },
        ]),
      ),
    ).toEqual([traces.assigned]);
  });

  it("filters trace attributes and summaries", async () => {
    expect(
      ids(
        await list([
          {
            column: "sessionId",
            match: { operator: "any of", values: ["SESSION-1"] },
          },
        ]),
      ),
    ).toEqual([traces.insufficient]);
    expect(
      ids(
        await list([
          {
            column: "traceId",
            match: {
              operator: "any of",
              values: [traces.outlier, traces.assigned],
            },
          },
        ]),
      ),
    ).toEqual([traces.assigned, traces.outlier]);
    expect(
      ids(
        await list([
          {
            column: "summary",
            facetId: issues,
            match: { operator: "contains", value: "refund request" },
          },
          {
            column: "timestamp",
            match: { operator: ">=", value: new Date("2026-10-04") },
          },
        ]),
      ),
    ).toEqual([traces.assigned, traces.stale, traces.outlier]);
  });

  it("pages with a keyset cursor and projects facets", async () => {
    const first = await list([], { limit: 2 });
    expect(ids(first)).toEqual([traces.assigned, traces.stale]);
    expect(first.next).toBeDefined();
    const second = await list([], { limit: 2, cursor: first.next });
    expect(ids(second)).toEqual([traces.outlier, traces.insufficient]);
    const last = await list([], { limit: 2, cursor: second.next });
    expect(ids(last)).toEqual([traces.unpublished]);
    expect(last.next).toBeUndefined();

    const ascending = await list([], { orderBy: "timestamp.asc", limit: 1 });
    expect(ids(ascending)).toEqual([traces.unpublished]);

    const projected = await list([], {
      projectedFacetIds: [intent],
      limit: 1,
    });
    expect(projected.rows[0].results.map((facet) => facet.facetId)).toEqual([
      intent,
    ]);

    expect(await list([], { facetIds: [], projectedFacetIds: [] })).toEqual({
      rows: [],
    });
  });
});
