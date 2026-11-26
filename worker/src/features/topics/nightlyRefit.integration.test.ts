import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { TopicSummary } from "@langfuse/shared/topics";
import {
  createTopicFacet,
  createTopicRun,
  enqueueTopicRuleRefit,
  getAllEnabledTopicsModels,
  saveTopicRule,
  writeTopicSummaries,
} from "@langfuse/shared/topics/server";
import { recordIncrement } from "@langfuse/shared/src/server";
import { clickhouseClient } from "@langfuse/shared/src/server/clickhouse";
import { prisma } from "@langfuse/shared/src/db";
import { nightlyRefitSlot, scheduleNightlyTopicRefits } from "./nightlyRefit";
import { env } from "../../env";

// The refit's queue handoff and model settings are not under test; its run rows are.
vi.mock("@langfuse/shared/topics/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/topics/server")>()),
  enqueueTopicRuleRefit: vi.fn(),
  getAllEnabledTopicsModels: vi.fn(),
}));
vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/src/server")>()),
  recordIncrement: vi.fn(),
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

describe("nightly Topics refits against storage", () => {
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
    triggerType: "rule",
    ruleIds: [],
    executionId: null,
    environment: "default",
    traceName: "trace",
    unitStartTime,
    state: "complete",
    summary: "summary",
    embedding,
    transcriptId: "transcript",
    transcriptVersion: "v1",
    transcriptBytes: 0,
    summaryModel: "summary",
    embeddingModel: embeddingConfig.embeddingModel,
    providedUsageDetails: {},
    usageDetails: {},
    providedCostDetails: {},
    costDetails: {},
    createdAt: new Date().toISOString(),
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
      vi.mocked(getAllEnabledTopicsModels).mockResolvedValueOnce(
        new Map([
          [
            projectId,
            {
              projectId,
              embedding: { model: "embed", dimensions: DIMENSIONS },
            },
          ],
        ]) as Awaited<ReturnType<typeof getAllEnabledTopicsModels>>,
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
    vi.mocked(getAllEnabledTopicsModels).mockResolvedValueOnce(
      new Map([
        [
          projectId,
          { projectId, embedding: { model: "embed", dimensions: DIMENSIONS } },
        ],
      ]) as Awaited<ReturnType<typeof getAllEnabledTopicsModels>>,
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
  it("fails a fit left open by an earlier slot and counts it as interrupted", async () => {
    const facet = await createTopicFacet({
      projectId,
      name: "Interrupted",
      description: "",
      prompt: "Describe the request.",
    });
    const rule = await saveTopicRule({
      projectId,
      facetIds: [facet.id],
      filter: [],
    });
    const open = await createTopicRun({
      projectId,
      facetId: facet.id,
      facetVersion: 1,
      ruleId: rule.id,
      config: {
        embeddingModel: "embed",
        dimensions: DIMENSIONS,
        refresh: true,
      },
    });
    const slot = nightlyRefitSlot(
      projectId,
      new Date(Date.now() + 86_400_000),
      env.LANGFUSE_TOPICS_NIGHTLY_REFIT_HOUR_UTC,
    );
    await prisma.topicClusteringRun.update({
      where: { id: open.id },
      data: {
        status: "running",
        createdAt: new Date(slot.getTime() - 86_400_000),
      },
    });
    vi.mocked(getAllEnabledTopicsModels).mockResolvedValueOnce(
      new Map([
        [
          projectId,
          { projectId, embedding: { model: "embed", dimensions: DIMENSIONS } },
        ],
      ]) as Awaited<ReturnType<typeof getAllEnabledTopicsModels>>,
    );

    await scheduleNightlyTopicRefits(new Date(slot.getTime() + 60_000));

    expect(
      await prisma.topicClusteringRun.findUnique({
        where: { id: open.id },
        select: { status: true },
      }),
    ).toEqual({ status: "failed" });
    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.topics.rule_fits",
      1,
      {
        outcome: "interrupted",
        trigger: "manual",
        owner: "platform",
      },
    );
  });
});
