import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { TopicSummary } from "@langfuse/shared/topics";
import {
  createTopicFacet,
  createTopicRun,
  enqueueTopicRuleRefit,
  getEnabledTopicsModels,
  readTopicAssignments,
  saveTopicRule,
  saveTopicRun,
  writeTopicSummaries,
} from "@langfuse/shared/topics/server";
import { clickhouseClient } from "@langfuse/shared/src/server/clickhouse";
import { prisma } from "@langfuse/shared/src/db";
import { processTopicsAutomation } from "./topicsAutomation";
import { scheduleNightlyTopicRefits } from "./nightlyRefit";

// The refit's queue handoff and model settings are not under test; its run rows are.
vi.mock("@langfuse/shared/topics/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/topics/server")>()),
  enqueueTopicRuleRefit: vi.fn(),
  getEnabledTopicsModels: vi.fn(),
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

  async function publishedMap(
    name: string,
    owner: { batchActionId?: string } = {},
  ) {
    const facet = await createTopicFacet({
      projectId,
      name,
      description: "",
      prompt: "Describe the request.",
    });
    const pending = await createTopicRun({
      projectId,
      facetId: facet.id,
      facetVersion: 1,
      config: { embeddingModel: "embed", dimensions: DIMENSIONS },
      ...owner,
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
    return { facet, pending };
  }

  it("assigns a batch's stored summaries to the serving map once, even when the job repeats", async () => {
    const { facet, pending } = await publishedMap("Assignment");
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

  it("never assigns online traces to a one-off snapshot", async () => {
    const { facet, pending } = await publishedMap("Snapshot", {
      batchActionId: "manual-execution",
    });
    const near = summary(facet.id, "2026-10-14T10:00:00.000Z", vector(1, 0.01));
    await writeTopicSummaries([near]);
    const timeRange = {
      from: new Date(near.unitStartTime),
      to: new Date(Date.parse(near.unitStartTime) + 1),
    };

    await processTopicsAutomation({
      projectId,
      traceIds: [near.traceId!],
      facets: [{ facetId: facet.id, version: 1 }],
      embeddingConfig,
      timeRange,
    });

    expect(
      await readTopicAssignments(
        projectId,
        { facetId: facet.id, version: 1 },
        [near],
        pending.id,
        timeRange,
      ),
    ).toEqual([]);
  });

  it("fits each rule facet once per nightly slot, tagged with the rule, and skips a quiet night", async () => {
    const facet = await createTopicFacet({
      projectId,
      name: "Refit",
      description: "",
      prompt: "Describe the request.",
    });
    const rule = await saveTopicRule({
      projectId,
      facetIds: [facet.id],
      filter: [],
    });
    const now = new Date();
    await writeTopicSummaries(
      Array.from({ length: 100 }, (_, index) =>
        summary(
          facet.id,
          new Date(now.getTime() - (index + 1) * 60_000).toISOString(),
          vector(1, index / 100),
        ),
      ),
    );
    const schedule = (at: Date) => {
      vi.mocked(getEnabledTopicsModels).mockResolvedValueOnce(
        new Map([
          [
            projectId,
            {
              projectId,
              embedding: { model: "embed", dimensions: DIMENSIONS },
            },
          ],
        ]) as Awaited<ReturnType<typeof getEnabledTopicsModels>>,
      );
      return scheduleNightlyTopicRefits(at);
    };
    const runs = (status: string) =>
      prisma.topicClusteringRun.findMany({
        where: { projectId, facetId: facet.id, status },
      });

    await expect(schedule(now)).resolves.toBe(1);
    await expect(schedule(now)).resolves.toBe(0);
    const [first, ...others] = await runs("pending");
    expect(others).toEqual([]);
    expect(first).toMatchObject({ ruleId: rule.id, batchActionId: null });
    expect(enqueueTopicRuleRefit).toHaveBeenCalledWith(projectId, first.id);

    await prisma.topicClusteringRun.update({
      where: { id: first.id },
      data: { status: "completed", finishedAt: now },
    });
    await expect(schedule(new Date(now.getTime() + 86_400_000))).resolves.toBe(
      0,
    );
    expect(await runs("skipped")).toEqual([
      expect.objectContaining({ ruleId: rule.id, batchActionId: null }),
    ]);
  });
});
