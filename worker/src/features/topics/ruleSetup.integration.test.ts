import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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
  createTopicRun,
  getTopicRun,
  readTopicRuleSetup,
  saveTopicRule,
  saveTopicRun,
  claimTopicRuleSetup,
  TOPIC_RULE_SETUP_DEADLINE_MS,
  writeTopicRuleSetup,
  writeTopicSummaries,
  type TopicRuleSetup,
} from "@langfuse/shared/topics/server";
import { seedTraceDispatch } from "../traceBatching/traceRuleRecording";
import { tickTopicRuleSetup } from "./ruleSetup";

// Queue handoffs and model settings are not under test; seeding has its own dispatch test.
vi.mock("@langfuse/shared/topics/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/topics/server")>()),
  enqueueTopicRuleRefit: vi.fn(),
  getEnabledTopicsModels: vi.fn(),
  isTopicsProjectEnabled: () => true,
}));
vi.mock("../traceBatching/traceRuleRecording", () => ({
  seedTraceDispatch: vi.fn(),
}));

const DIMENSIONS = 64;

describe("Topics rule setup", () => {
  const orgId = randomUUID();
  const projectId = randomUUID();
  let facetId: string;

  const setupKeys = (ruleId: string) => [
    `topics:rule-setup:{${projectId}}:${ruleId}`,
    `topics:rule-setup:{${projectId}}:${ruleId}:traces`,
  ];
  const newRule = () =>
    saveTopicRule({ projectId, facetIds: [facetId], filter: [] });
  const setupRecord = (
    ruleId: string,
    patch: Partial<TopicRuleSetup>,
  ): TopicRuleSetup => {
    const startedAt = new Date(Date.now() - 1_000);
    return {
      projectId,
      ruleId,
      phase: "selecting",
      startedAt: startedAt.toISOString(),
      deadlineAt: new Date(
        startedAt.getTime() + TOPIC_RULE_SETUP_DEADLINE_MS,
      ).toISOString(),
      days: null,
      seededCount: 0,
      error: null,
      facets: [],
      ...patch,
    };
  };
  const setupFacet = (
    patch: Partial<TopicRuleSetup["facets"][number]>,
  ): TopicRuleSetup["facets"][number] => ({
    facetId,
    facetVersion: 1,
    state: "short",
    existingCount: 0,
    settledCount: 0,
    completeCount: 0,
    grewAt: null,
    fit: null,
    runId: null,
    runStatus: null,
    ...patch,
  });

  beforeAll(async () => {
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
    facetId = (
      await createTopicFacet({
        projectId,
        name: "Intent",
        description: "",
        prompt: "Describe the request.",
      })
    ).id;
  });

  afterAll(async () => {
    await clickhouseClient().command({
      query: `DELETE FROM topic_facet_summaries WHERE project_id = {projectId:String}`,
      query_params: { projectId },
      clickhouse_settings: { mutations_sync: "1" },
    });
    await prisma.organization.deleteMany({ where: { id: orgId } });
  });

  it("seeds unsummarized traces, then fits a provisional small-sample map once they settle", async () => {
    const facet = { id: facetId };
    const rule = await newRule();
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
    await writeTopicRuleSetup(setupRecord(rule.id, {}));

    expect(await tickTopicRuleSetup(projectId, rule.id)).toBe(true);
    expect(vi.mocked(seedTraceDispatch)).toHaveBeenCalledWith(
      projectId,
      expect.arrayContaining(
        traceIds.map((traceId) => expect.objectContaining({ traceId })),
      ),
      [rule.id],
      expect.any(Number),
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
    await redis?.del(...setupKeys(rule.id));
  });

  it("claims one setup when two starts race", async () => {
    const rule = await newRule();
    const now = Date.now();
    const claims = await Promise.all([
      claimTopicRuleSetup(projectId, rule.id, new Date(now)),
      claimTopicRuleSetup(projectId, rule.id, new Date(now + 1)),
    ]);
    // Only the created claim enqueues the setup's job.
    expect(claims.filter(({ created }) => created)).toHaveLength(1);
    expect(claims[0].setup.startedAt).toBe(claims[1].setup.startedAt);
    await redis?.del(...setupKeys(rule.id));
  });

  it("reuses a fit's run when a tick repeats after creating it", async () => {
    const rule = await newRule();
    // Past the deadline, so the tick fits right away.
    const setup = setupRecord(rule.id, {
      phase: "summarizing",
      deadlineAt: new Date(Date.now() - 1).toISOString(),
      days: 7,
      facets: [setupFacet({})],
    });
    await writeTopicRuleSetup(setup);
    await tickTopicRuleSetup(projectId, rule.id);
    // As if the tick's write was lost after the run was created.
    await writeTopicRuleSetup(setup);
    await tickTopicRuleSetup(projectId, rule.id);

    expect(
      await prisma.topicClusteringRun.count({
        where: { projectId, ruleId: rule.id },
      }),
    ).toBe(1);
    await redis?.del(...setupKeys(rule.id));
  });

  it("ends done when fits were only skipped, and failed when one failed and none completed", async () => {
    const outcome = async (statuses: ("skipped" | "failed")[]) => {
      const rule = await newRule();
      const facets = [];
      for (const status of statuses) {
        const run = await createTopicRun({
          projectId,
          facetId,
          facetVersion: 1,
          ruleId: rule.id,
          config: {},
        });
        await saveTopicRun({
          ...run,
          status,
          error: status === "failed" ? "Embedding failed." : null,
          finishedAt: new Date().toISOString(),
        });
        facets.push(setupFacet({ runId: run.id, runStatus: "pending" }));
      }
      await writeTopicRuleSetup(
        setupRecord(rule.id, { phase: "fitting", facets }),
      );
      await tickTopicRuleSetup(projectId, rule.id);
      const setup = await readTopicRuleSetup(projectId, rule.id);
      await redis?.del(...setupKeys(rule.id));
      return { phase: setup?.phase, error: setup?.error };
    };

    expect(await outcome(["skipped", "skipped"])).toEqual({
      phase: "done",
      error: null,
    });
    expect(await outcome(["skipped", "failed"])).toEqual({
      phase: "failed",
      error: "Embedding failed.",
    });
  });
});
