import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  createEvent,
  createEventsCh,
  redis,
} from "@langfuse/shared/src/server";
import { clickhouseClient } from "@langfuse/shared/src/server/clickhouse";
import { prisma } from "@langfuse/shared/src/db";
import {
  createTopicFacet,
  enqueueTopicRuleRefit,
  getEnabledTopicsModels,
  getTopicRun,
  readTopicRuleSetup,
  saveTopicRule,
  writeTopicRuleSetup,
  writeTopicSummaries,
} from "@langfuse/shared/topics/server";
import { seedTraceDispatch } from "../traceBatching/traceRuleRecording";
import { tickTopicRuleSetup } from "./ruleSetup";

// Queue handoffs and model settings are not under test; seeding has its own dispatch test.
vi.mock("@langfuse/shared/topics/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/topics/server")>()),
  enqueueTopicRuleRefit: vi.fn(),
  getEnabledTopicsModels: vi.fn(),
}));
vi.mock("../traceBatching/traceRuleRecording", () => ({
  seedTraceDispatch: vi.fn(),
}));
vi.mock("../traceBatching/traceBatchSampling", () => ({
  isTraceDispatchEnabled: () => true,
}));

const DIMENSIONS = 64;

describe("Topics rule setup", () => {
  const orgId = randomUUID();
  const projectId = randomUUID();

  afterAll(async () => {
    await clickhouseClient().command({
      query: `DELETE FROM topic_facet_summaries WHERE project_id = {projectId:String}`,
      query_params: { projectId },
      clickhouse_settings: { mutations_sync: "1" },
    });
    await prisma.organization.deleteMany({ where: { id: orgId } });
  });

  it("seeds unsummarized traces, then fits a provisional small-sample map once they settle", async () => {
    await prisma.organization.create({
      data: {
        id: orgId,
        name: "Topics setup test",
        projects: { create: [{ id: projectId, name: "Topics setup" }] },
      },
    });
    vi.mocked(getEnabledTopicsModels).mockResolvedValue(
      new Map([
        [
          projectId,
          { projectId, embedding: { model: "embed", dimensions: DIMENSIONS } },
        ],
      ]) as Awaited<ReturnType<typeof getEnabledTopicsModels>>,
    );
    const facet = await createTopicFacet({
      projectId,
      name: "Intent",
      description: "",
      prompt: "Describe the request.",
    });
    const rule = await saveTopicRule({
      projectId,
      facetIds: [facet.id],
      filter: [],
    });
    const start = new Date(Date.now() - 2 * 60 * 60_000);
    const traceIds = ["a", "b", "c"].map((id) => `${projectId}-${id}`);
    await createEventsCh(
      traceIds.map((traceId) =>
        createEvent({
          project_id: projectId,
          trace_id: traceId,
          start_time: start,
          event_ts: start,
        }),
      ),
    );
    const startedAt = new Date(Date.now() - 1_000);
    await writeTopicRuleSetup({
      projectId,
      ruleId: rule.id,
      phase: "selecting",
      startedAt: startedAt.toISOString(),
      deadlineAt: new Date(startedAt.getTime() + 4 * 60_000).toISOString(),
      days: null,
      seededCount: 0,
      error: null,
      facets: [],
    });

    expect(await tickTopicRuleSetup(projectId, rule.id)).toBe(true);
    expect(vi.mocked(seedTraceDispatch)).toHaveBeenCalledWith(
      projectId,
      expect.arrayContaining(
        traceIds.map((traceId) => expect.objectContaining({ traceId })),
      ),
      [rule.id],
      expect.any(Number),
    );
    expect(await readTopicRuleSetup(projectId, rule.id)).toMatchObject({
      phase: "summarizing",
      // Three traces never fill the shortfall, so the window widens to the end.
      days: 30,
      seededCount: 3,
      facets: [{ facetId: facet.id, state: "short", existingCount: 0 }],
    });

    await writeTopicSummaries(
      traceIds.map((traceId) => ({
        projectId,
        facetId: facet.id,
        facetVersion: 1,
        traceId,
        sessionId: null,
        triggerType: "automatic" as const,
        environment: "default",
        traceName: "trace",
        unitStartTime: start.toISOString(),
        state: "complete" as const,
        summary: "summary",
        embedding: Array<number>(DIMENSIONS).fill(1),
        transcriptId: "transcript",
        transcriptVersion: "v1",
        summaryModel: "summary",
        embeddingModel: "embed",
        providedUsageDetails: {},
        usageDetails: {},
        providedCostDetails: {},
        costDetails: {},
        processedAt: new Date().toISOString(),
        metadata: {},
      })),
    );
    expect(await tickTopicRuleSetup(projectId, rule.id)).toBe(true);

    const setup = await readTopicRuleSetup(projectId, rule.id);
    expect(setup).toMatchObject({
      phase: "fitting",
      facets: [{ settledCount: 3, completeCount: 3, fit: "small_sample" }],
    });
    const run = await getTopicRun(projectId, setup!.facets[0].runId!);
    expect(run).toMatchObject({
      ruleId: rule.id,
      status: "pending",
      config: { exploratory: true, provisional: true },
    });
    expect(vi.mocked(enqueueTopicRuleRefit)).toHaveBeenCalledWith(
      projectId,
      run!.id,
    );
    await redis?.del(
      `topics:rule-setup:{${projectId}}:${rule.id}`,
      `topics:rule-setup:{${projectId}}:${rule.id}:traces`,
    );
  });
});
