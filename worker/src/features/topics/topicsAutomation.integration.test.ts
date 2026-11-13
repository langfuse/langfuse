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
import { nightlyRefitSlot, scheduleNightlyTopicRefits } from "./nightlyRefit";
import { env } from "../../env";

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
    owner: { batchActionId?: string; ruleId?: string } = {},
    existingFacet?: Awaited<ReturnType<typeof createTopicFacet>>,
  ) {
    const facet =
      existingFacet ??
      (await createTopicFacet({
        projectId,
        name,
        description: "",
        prompt: "Describe the request.",
      }));
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

  it("assigns online traces to a snapshot only until its facet version has a continuous map", async () => {
    const assignOnce = async (unitStartTime: string) => {
      const row = summary(facet.id, unitStartTime, vector(1, 0.01));
      await writeTopicSummaries([row]);
      const timeRange = {
        from: new Date(unitStartTime),
        to: new Date(Date.parse(unitStartTime) + 1),
      };
      await processTopicsAutomation({
        projectId,
        traceIds: [row.traceId!],
        facets: [{ facetId: facet.id, version: 1 }],
        embeddingConfig,
        timeRange,
      });
      return async (runId: string) =>
        (
          await readTopicAssignments(
            projectId,
            { facetId: facet.id, version: 1 },
            [row],
            runId,
            timeRange,
          )
        ).length;
    };
    // A run from before runs had owners ranks like a snapshot.
    const { facet } = await publishedMap("Snapshot");
    const { pending: snapshot } = await publishedMap(
      "Snapshot",
      { batchActionId: "manual-execution" },
      facet,
    );
    const beforeMap = await assignOnce("2026-10-14T10:00:00.000Z");
    expect(await beforeMap(snapshot.id)).toBe(1);

    const { pending: map } = await publishedMap(
      "Snapshot",
      { ruleId: "rule" },
      facet,
    );
    await publishedMap("Snapshot", { batchActionId: "later-execution" }, facet);
    const afterMap = await assignOnce("2026-10-14T11:00:00.000Z");
    expect(await afterMap(map.id)).toBe(1);
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

    // The rule was saved after today's slot, so the next day's slot fits it first.
    const later = new Date(now.getTime() + 86_400_000);
    await expect(schedule(now)).resolves.toBe(0);
    // A paused rule selects no new traces, so its map is not refit either.
    const setStatus = (status: "ACTIVE" | "INACTIVE") =>
      prisma.evaluationRule.update({
        where: { id: rule.id },
        data: { status },
      });
    await setStatus("INACTIVE");
    await expect(schedule(later)).resolves.toBe(0);
    await setStatus("ACTIVE");
    await expect(schedule(later)).resolves.toBe(1);
    await expect(schedule(later)).resolves.toBe(0);
    const [first, ...others] = await runs("pending");
    expect(others).toEqual([]);
    expect(first).toMatchObject({ ruleId: rule.id, batchActionId: null });
    // Nightly fits queue behind a setup's first fit.
    expect(enqueueTopicRuleRefit).toHaveBeenCalledWith(
      projectId,
      first.id,
      expect.any(Number),
    );

    await prisma.topicClusteringRun.update({
      where: { id: first.id },
      data: { status: "completed", finishedAt: now },
    });
    await expect(
      schedule(new Date(later.getTime() + 86_400_000)),
    ).resolves.toBe(0);
    expect(await runs("skipped")).toEqual([
      expect.objectContaining({ ruleId: rule.id, batchActionId: null }),
    ]);
  });

  it("skips the slot after a fit started from an hour before it, such as a manual refresh", async () => {
    const facet = await createTopicFacet({
      projectId,
      name: "Refresh",
      description: "",
      prompt: "Describe the request.",
    });
    const rule = await saveTopicRule({
      projectId,
      facetIds: [facet.id],
      filter: [],
    });
    const refresh = await createTopicRun({
      projectId,
      facetId: facet.id,
      facetVersion: 1,
      ruleId: rule.id,
      config: { embeddingModel: "embed", dimensions: DIMENSIONS },
    });
    const slot = nightlyRefitSlot(
      projectId,
      new Date(Date.now() + 86_400_000),
      env.LANGFUSE_TOPICS_NIGHTLY_REFIT_HOUR_UTC,
    );
    await prisma.topicClusteringRun.update({
      where: { id: refresh.id },
      data: { createdAt: new Date(slot.getTime() - 30 * 60_000) },
    });
    vi.mocked(getEnabledTopicsModels).mockResolvedValueOnce(
      new Map([
        [
          projectId,
          { projectId, embedding: { model: "embed", dimensions: DIMENSIONS } },
        ],
      ]) as Awaited<ReturnType<typeof getEnabledTopicsModels>>,
    );

    // A later tick of the same slot, more than an hour after the refresh started.
    await scheduleNightlyTopicRefits(new Date(slot.getTime() + 2 * 3_600_000));

    expect(
      await prisma.topicClusteringRun.findMany({
        where: { projectId, facetId: facet.id },
        select: { id: true, status: true },
      }),
    ).toEqual([{ id: refresh.id, status: "pending" }]);
  });
});
