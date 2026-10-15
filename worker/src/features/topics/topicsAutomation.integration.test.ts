import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { TopicSummary } from "@langfuse/shared/topics";
import {
  createTopicFacet,
  createTopicRun,
  enqueueTopicExecution,
  readTopicAssignments,
  saveTopicRun,
  writeTopicSummaries,
} from "@langfuse/shared/topics/server";
import { clickhouseClient } from "@langfuse/shared/src/server/clickhouse";
import { prisma } from "@langfuse/shared/src/db";
import { processTopicsAutomation } from "./topicsAutomation";

// Discovery's queue handoff and model settings are not under test; its execution row is.
vi.mock("@langfuse/shared/topics/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/topics/server")>()),
  enqueueTopicExecution: vi.fn(),
  getEnabledTopicsModels: vi.fn(
    async (projectIds: string[]) =>
      new Map(
        projectIds.map((id) => [
          id,
          { embedding: { model: "embed", dimensions: 64 } },
        ]),
      ),
  ),
}));

const DIMENSIONS = 64;
const vector = (...head: number[]) => [
  ...head,
  ...Array<number>(DIMENSIONS - head.length).fill(0),
];
const embeddingConfig = {
  embeddingModel: "embed",
  embeddingDimensions: DIMENSIONS,
};

describe("automatic Topics assignment against storage", () => {
  const orgId = randomUUID();
  const projectId = randomUUID();

  const summary = (
    facetId: string,
    unitStartTime: string,
    embedding: number[],
  ): TopicSummary => ({
    projectId,
    facetId,
    facetVersion: 1,
    traceId: randomUUID(),
    sessionId: null,
    triggerType: "manual_poc",
    environment: "default",
    traceName: "trace",
    unitStartTime,
    state: "complete",
    summary: "summary",
    embedding,
    transcriptId: "transcript",
    transcriptVersion: "v1",
    summaryModel: "summary",
    embeddingModel: embeddingConfig.embeddingModel,
    providedUsageDetails: {},
    usageDetails: {},
    providedCostDetails: {},
    costDetails: {},
    processedAt: new Date().toISOString(),
    metadata: {},
  });

  beforeAll(async () => {
    await prisma.organization.create({
      data: {
        id: orgId,
        name: "Automatic Topics test",
        projects: { create: [{ id: projectId, name: "Automatic Topics" }] },
      },
    });
  });

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
    await prisma.organization.deleteMany({ where: { id: orgId } });
  });

  it("assigns a batch's stored summaries to the serving map once, even when the job repeats", async () => {
    const facet = await createTopicFacet({
      projectId,
      name: "Assignment",
      description: "",
      prompt: "Describe the request.",
    });
    const pending = await createTopicRun({
      projectId,
      facetId: facet.id,
      facetVersion: 1,
      config: { embeddingModel: "embed", dimensions: DIMENSIONS },
    });
    await saveTopicRun({
      ...pending,
      status: "completed",
      finishedAt: new Date().toISOString(),
      topics: [
        {
          projectId,
          topicVersionId: randomUUID(),
          topicId: randomUUID(),
          createdByRunId: pending.id,
          createdAt: new Date().toISOString(),
          tags: [],
          name: "Billing",
          description: "",
          centroid: vector(1),
          radius: 0.1,
          representativeSummaries: [],
          metadata: {},
        },
      ],
    });
    // The batch window ends 1 ms after its latest summary, as the enqueue computes it.
    const near = summary(facet.id, "2026-10-14T10:00:00.000Z", vector(1, 0.01));
    const far = summary(facet.id, "2026-10-14T10:05:00.000Z", vector(0, 1));
    await writeTopicSummaries([near, far]);
    const timeRange = {
      from: new Date(near.unitStartTime),
      to: new Date(Date.parse(far.unitStartTime) + 1),
    };
    const batch = {
      projectId,
      traceIds: [near.traceId!, far.traceId!],
      facets: [{ facetId: facet.id, version: 1 }],
      embeddingConfig,
      timeRange,
    };

    await processTopicsAutomation(batch);
    await processTopicsAutomation(batch);

    const assignments = await readTopicAssignments(
      projectId,
      { facetId: facet.id, version: 1 },
      [near, far],
      pending.id,
      timeRange,
    );
    expect(
      Object.fromEntries(
        assignments.map((row) => [row.traceId, row.topicId !== null]),
      ),
    ).toEqual({ [near.traceId!]: true, [far.traceId!]: false });
    const stored = await clickhouseClient().query({
      query: `SELECT count() AS count FROM topic_assignments
        WHERE project_id = {projectId:String} AND facet_id = {facetId:String}`,
      query_params: { projectId, facetId: facet.id },
      format: "JSONEachRow",
    });
    const [{ count }] = await stored.json<{ count: number | string }>();
    expect(Number(count)).toBe(2);
  });

  it("starts one discovery when concurrent jobs reach the threshold, and queues it again if its job is lost", async () => {
    const facet = await createTopicFacet({
      projectId,
      name: "Discovery",
      description: "",
      prompt: "Describe the request.",
    });
    const now = Date.now();
    const rows = Array.from({ length: 100 }, (_, index) =>
      summary(
        facet.id,
        new Date(now - (index + 1) * 60_000).toISOString(),
        vector(1, index / 100),
      ),
    );
    await writeTopicSummaries(rows);
    const batch = {
      projectId,
      traceIds: [rows[0].traceId!],
      facets: [{ facetId: facet.id, version: 1 }],
      embeddingConfig,
      timeRange: {
        from: new Date(rows[0].unitStartTime),
        to: new Date(Date.parse(rows[0].unitStartTime) + 1),
      },
    };

    const startedAt = new Date();

    await Promise.all([
      processTopicsAutomation(batch),
      processTopicsAutomation(batch),
    ]);

    const executions = await prisma.batchAction.findMany({
      where: {
        projectId,
        userId: "system:topics",
        createdAt: { gte: startedAt },
      },
    });
    expect(executions).toHaveLength(1);
    expect(executions[0].status).toBe("QUEUED");

    // Its job was lost: the next job queues the same execution again despite its pending run.
    vi.mocked(enqueueTopicExecution).mockClear();
    await processTopicsAutomation(batch);
    expect(vi.mocked(enqueueTopicExecution).mock.calls).toEqual([
      [projectId, executions[0].id],
    ]);
  });

  it("does not start discovery while a fit for the facet is still running", async () => {
    const facet = await createTopicFacet({
      projectId,
      name: "Running fit",
      description: "",
      prompt: "Describe the request.",
    });
    // A manual Update topics that has not published yet.
    await createTopicRun({
      projectId,
      facetId: facet.id,
      facetVersion: 1,
      config: {},
    });
    const now = Date.now();
    const rows = Array.from({ length: 100 }, (_, index) =>
      summary(
        facet.id,
        new Date(now - (index + 1) * 60_000).toISOString(),
        vector(1, index / 100),
      ),
    );
    await writeTopicSummaries(rows);
    const startedAt = new Date();

    await processTopicsAutomation({
      projectId,
      traceIds: [rows[0].traceId!],
      facets: [{ facetId: facet.id, version: 1 }],
      embeddingConfig,
      timeRange: {
        from: new Date(rows[0].unitStartTime),
        to: new Date(Date.parse(rows[0].unitStartTime) + 1),
      },
    });

    expect(
      await prisma.batchAction.count({
        where: {
          projectId,
          userId: "system:topics",
          createdAt: { gte: startedAt },
        },
      }),
    ).toBe(0);
  });
});
