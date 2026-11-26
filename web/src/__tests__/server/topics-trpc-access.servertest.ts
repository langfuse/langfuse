import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { LLMAdapter } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  DEFAULT_TOPIC_FACETS,
  topicEmbeddingConfigSchema,
} from "@langfuse/shared/topics";
import {
  createTopicExecution,
  createTopicFacet,
  getTopicRule,
  getTopicsModels,
  writeTopicRuleSetup,
  writeTopicSummaries,
} from "@langfuse/shared/topics/server";
// Only the LLM transport is faked, to see which connection a test call used.
const generateTopicText = vi.hoisted(() =>
  vi.fn(async () => ({
    output: { summary: "Account access", status: "applicable" },
    usage: {},
  })),
);
vi.mock("@langfuse/shared/src/server/topics/text", () => ({
  generateTopicText,
}));

import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { topicsProject as topicsFixture } from "@/src/__tests__/fixtures/topics";
import { createSession } from "@/src/__tests__/fixtures/session-factory";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

function caller(userId: string, memberships: [string, string, Role][]) {
  const session = createSession({
    user: {
      id: userId,
      featureFlags: testFeatureFlags(),
    },
    organizations: memberships.map(([orgId, projectId, role]) => ({
      id: orgId,
      role,
      projects: [{ id: projectId }],
    })),
  });
  return appRouter.createCaller({
    ...createInnerTRPCContext({ session, headers: {} }),
    prisma,
  }).topics;
}

function llmConnection(
  owner: { projectId: string } | { organizationId: string },
  provider = `openai-${randomUUID()}`,
) {
  return prisma.llmApiKeys.create({
    data: {
      ...owner,
      provider,
      baseURL: `https://${randomUUID()}.example.com`,
      adapter: LLMAdapter.OpenAI,
      secretKey: "encrypted",
      displaySecretKey: "...key",
    },
  });
}

/** The shared Topics fixture plus a project LLM connection, configured models and a billed snapshot. */
async function topicsProject(userId: string) {
  const base = await topicsFixture();
  const { projectId } = base;
  const llmKey = await llmConnection({ projectId });
  await prisma.topicConfig.create({
    data: {
      projectId,
      enabled: false,
      summaryLlmApiKeyId: llmKey.id,
      summaryModel: "summary-model",
      embeddingLlmApiKeyId: llmKey.id,
      embeddingModel: "embedding-model",
      embeddingDimensions: 1024,
      clusteringLlmApiKeyId: llmKey.id,
      clusteringModel: "clustering-model",
    },
  });
  const execution = await createTopicExecution(
    {
      projectId,
      requestId: randomUUID(),
      operation: "update",
      facets: [{ facetId: base.facetId, version: 1 }],
      timeRange: {
        from: new Date(Date.now() - 86_400_000),
        to: new Date(),
      },
      exploratory: false,
      embeddingConfig: topicEmbeddingConfigSchema.parse({}),
      analysis: { label: "Snapshot", filter: [], seed: "seed" },
    },
    undefined,
    userId,
  );
  // The snapshot's cost, on its own facet so the fixture trace stays base.facetId's only row.
  const costFacet = await createTopicFacet({
    projectId,
    name: `Cost facet ${randomUUID()}`,
    description: "",
    prompt: "Summarize the trace.",
  });
  const now = new Date().toISOString();
  await writeTopicSummaries([
    {
      projectId,
      facetId: costFacet.id,
      facetVersion: 1,
      traceId: randomUUID(),
      sessionId: null,
      triggerType: "snapshot",
      ruleIds: [],
      executionId: execution.id,
      environment: "production",
      traceName: "assistant",
      unitStartTime: now,
      state: "complete",
      summary: "Billed summary",
      embedding: [1, 0],
      transcriptId: "test",
      transcriptVersion: "test",
      transcriptBytes: 0,
      summaryModel: "summary-model",
      embeddingModel: "embedding-model",
      providedUsageDetails: {},
      usageDetails: {},
      providedCostDetails: {},
      costDetails: { total: 0.25 },
      createdAt: now,
      metadata: {},
    },
  ]);
  return {
    ...base,
    llmKeyId: llmKey.id,
    llmProvider: llmKey.provider,
    executionId: execution.id,
  };
}

/** Every `topics.*` procedure name, optionally of one type. */
function topicsProcedures(type?: "query" | "mutation") {
  const procedures = appRouter._def.procedures as unknown as Record<
    string,
    { _def: { type: string } }
  >;
  return Object.entries(procedures).flatMap(([path, procedure]) =>
    path.startsWith("topics.") && (!type || procedure._def.type === type)
      ? [path.slice("topics.".length)]
      : [],
  );
}

describe("Topics tRPC access", () => {
  let userId: string;
  let a: Awaited<ReturnType<typeof topicsProject>>;
  let b: Awaited<ReturnType<typeof topicsProject>>;

  beforeAll(async () => {
    userId = (
      await prisma.user.create({
        data: { email: `topics-access-${randomUUID()}@example.com` },
      })
    ).id;
    a = await topicsProject(userId);
    b = await topicsProject(userId);
  });

  it("lets VIEWER read but rejects every write without changing state", async () => {
    const viewer = caller(userId, [[a.orgId, a.projectId, "VIEWER"]]);
    const projectId = a.projectId;
    const before = await prisma.evaluator.count({
      where: { projectId, type: "FACET" },
    });

    await expect(viewer.facets({ projectId })).resolves.toHaveLength(before);
    // Every Topics mutation, so a new one cannot skip topics:CUD, plus the one query
    // that needs it. Inputs carry only projectId: the check must run before any handler work.
    const mutations = topicsProcedures("mutation");
    expect(mutations).toEqual(
      expect.arrayContaining(["saveRule", "startAnalysis", "startRuleSetup"]),
    );
    for (const name of [...mutations, "costEstimate"])
      await expect(
        (viewer as unknown as Record<string, (input: unknown) => unknown>)[
          name
        ]!({ projectId }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(
      await prisma.evaluator.count({ where: { projectId, type: "FACET" } }),
    ).toBe(before);
    expect(
      await prisma.topicConfig.findUniqueOrThrow({ where: { projectId } }),
    ).toMatchObject({ enabled: false });

    // Positive control: MEMBER holds topics:CUD.
    const member = caller(userId, [[a.orgId, a.projectId, "MEMBER"]]);
    await expect(
      member.saveFacet({
        projectId,
        name: `Member facet ${randomUUID()}`,
        prompt: "Summarize the trace.",
      }),
    ).resolves.toMatchObject({ projectId });
  });

  it("rejects another project's ids on every procedure, even when the caller administers both", async () => {
    const admin = caller(userId, [
      [a.orgId, a.projectId, "ADMIN"],
      [b.orgId, b.projectId, "ADMIN"],
    ]);
    const projectId = a.projectId;
    const notFound = { code: "NOT_FOUND" };
    const ruleNotInProject = {
      code: "NOT_FOUND",
      message: "Topic rule not found in this project.",
    };
    const bTrace = { traceId: b.traceId, timestamp: new Date() };
    const bSlice = {
      filter: [],
      timeRange: { from: new Date(Date.now() - 86_400_000), to: new Date() },
      facets: [{ facetId: b.facetId, version: 1 }],
    };
    const bFacetName = (
      await prisma.evaluator.findUniqueOrThrow({ where: { id: b.facetId } })
    ).name;
    await writeTopicRuleSetup({
      projectId: b.projectId,
      ruleId: b.ruleId,
      phase: "selecting",
      startedAt: new Date().toISOString(),
      deadlineAt: new Date(Date.now() + 3_600_000).toISOString(),
      days: null,
      seededCount: 0,
      error: null,
      facets: [],
    });
    const bRuleBefore = await getTopicRule(b.projectId, b.ruleId);
    const aConfigBefore = await prisma.topicConfig.findUniqueOrThrow({
      where: { projectId },
    });
    const bRunsBefore = await prisma.topicClusteringRun.count({
      where: { projectId: b.projectId },
    });

    // Positive controls: B's ids resolve in B, so the denials below are not vacuous.
    const own = { projectId: b.projectId };
    await expect(
      admin.execution({ ...own, executionId: b.executionId }),
    ).resolves.toMatchObject({ id: b.executionId });
    await expect(
      admin.analysisResults({ ...own, executionId: b.executionId }),
    ).resolves.toMatchObject({ execution: { id: b.executionId } });
    expect(
      (await admin.traces({ ...own, facetId: b.facetId })).rows.map(
        (row) => row.traceId,
      ),
    ).toEqual([b.traceId]);
    expect(
      JSON.stringify(await admin.forTrace({ ...own, ...bTrace })),
    ).toContain(b.facetId);
    expect(
      JSON.stringify(await admin.forTraces({ ...own, traces: [bTrace] })),
    ).toContain(b.traceId);
    await expect(
      admin.stripeMap({ ...own, facet: bFacetName }),
    ).resolves.not.toBeNull();
    await expect(
      admin.executionCosts({ ...own, executionIds: [b.executionId] }),
    ).resolves.toEqual({ [b.executionId]: 0.25 });
    await expect(
      admin.ruleSetupStatus({ ...own, ruleId: b.ruleId }),
    ).resolves.toMatchObject({ ruleId: b.ruleId });

    // One entry per procedure whose input can name a resource: project A with B's ids.
    const foreignIdCases: Record<string, () => Promise<unknown>> = {
      currentResults: async () => {
        expect(
          JSON.stringify(await admin.currentResults({ projectId })),
        ).not.toContain(b.facetId);
        await expect(
          admin.currentResults({ projectId, ruleId: b.ruleId }),
        ).rejects.toMatchObject(ruleNotInProject);
      },
      traces: async () => {
        await expect(
          admin.traces({ projectId, facetId: b.facetId }),
        ).resolves.toMatchObject({ rows: [] });
        await expect(
          admin.traces({ projectId, facetId: a.facetId, ruleId: b.ruleId }),
        ).rejects.toMatchObject(ruleNotInProject);
        await expect(
          admin.traces({
            projectId,
            facetId: a.facetId,
            analysisId: b.executionId,
          }),
        ).rejects.toMatchObject(notFound);
      },
      forTraces: async () =>
        expect(
          JSON.stringify(
            await admin.forTraces({ projectId, traces: [bTrace] }),
          ),
        ).not.toContain(b.traceId),
      forTrace: async () =>
        expect(
          JSON.stringify(await admin.forTrace({ projectId, ...bTrace })),
        ).not.toContain(b.facetId),
      stripeMap: () =>
        expect(
          admin.stripeMap({ projectId, facet: bFacetName }),
        ).resolves.toBeNull(),
      analysisResults: () =>
        expect(
          admin.analysisResults({ projectId, executionId: b.executionId }),
        ).rejects.toMatchObject(notFound),
      previewAnalysis: () =>
        expect(admin.previewAnalysis({ projectId, ...bSlice })).rejects.toThrow(
          "Facet version not found in this project.",
        ),
      startAnalysis: () =>
        expect(
          admin.startAnalysis({ projectId, ...bSlice, label: "Foreign facet" }),
        ).rejects.toThrow("Facet version not found in this project."),
      saveFacet: () =>
        expect(
          admin.saveFacet({
            projectId,
            facetId: b.facetId,
            name: "Hijacked",
            prompt: "Leak the other project's traces.",
          }),
        ).rejects.toThrow("Facet not found in this project."),
      saveRule: async () => {
        await expect(
          admin.saveRule({
            projectId,
            name: "Foreign facet",
            filter: [],
            facetIds: [b.facetId],
          }),
        ).rejects.toThrow("Select facets from this project.");
        await expect(
          admin.saveRule({
            projectId,
            id: b.ruleId,
            name: "Hijacked",
            filter: [],
            facetIds: [a.facetId],
          }),
        ).rejects.toMatchObject(ruleNotInProject);
      },
      setRuleEnabled: () =>
        expect(
          admin.setRuleEnabled({ projectId, id: b.ruleId, enabled: false }),
        ).rejects.toMatchObject(ruleNotInProject),
      saveSetup: () =>
        expect(
          admin.saveSetup({
            projectId,
            summary: { provider: a.llmProvider, model: "summary-model" },
            embedding: null,
            embeddingDimensions: 1024,
            clustering: null,
            ruleId: b.ruleId,
            facets: DEFAULT_TOPIC_FACETS.map(({ name }) => ({
              name,
              enabled: true,
            })),
            filter: [],
            traceIdleMs: 600_000,
          }),
        ).rejects.toMatchObject(ruleNotInProject),
      setAutomaticProcessing: () =>
        expect(
          admin.setAutomaticProcessing({
            projectId,
            enabled: false,
            ruleId: b.ruleId,
            sampling: 0.5,
          }),
        ).rejects.toMatchObject(ruleNotInProject),
      execution: () =>
        expect(
          admin.execution({ projectId, executionId: b.executionId }),
        ).rejects.toMatchObject(notFound),
      executionCosts: () =>
        expect(
          admin.executionCosts({ projectId, executionIds: [b.executionId] }),
        ).resolves.toEqual({}),
      executionCostBreakdown: () =>
        expect(
          admin.executionCostBreakdown({
            projectId,
            executionIds: [b.executionId],
          }),
        ).resolves.toEqual({
          [b.executionId]: { summaries: null, naming: null },
        }),
      retry: () =>
        expect(
          admin.retry({ projectId, executionId: b.executionId }),
        ).rejects.toMatchObject(notFound),
      startCostEstimate: () =>
        expect(
          admin.startCostEstimate({
            projectId,
            filter: [],
            facetIds: [b.facetId],
          }),
        ).rejects.toMatchObject(notFound),
      costEstimate: () =>
        expect(
          admin.costEstimate({ projectId, filter: [], facetIds: [b.facetId] }),
        ).rejects.toMatchObject(notFound),
      startRuleSetup: () =>
        expect(
          admin.startRuleSetup({ projectId, ruleId: b.ruleId }),
        ).rejects.toMatchObject(notFound),
      refreshRuleMap: () =>
        expect(
          admin.refreshRuleMap({ projectId, ruleId: b.ruleId }),
        ).rejects.toMatchObject(notFound),
      ruleSetupStatus: () =>
        expect(
          admin.ruleSetupStatus({ projectId, ruleId: b.ruleId }),
        ).resolves.toBeNull(),
      map: () =>
        expect(admin.map({ projectId, runId: b.runId })).rejects.toMatchObject(
          notFound,
        ),
      mapMatches: () =>
        expect(
          admin.mapMatches({ projectId, runId: b.runId, filter: [] }),
        ).rejects.toMatchObject(notFound),
    };
    // Inputs that name nothing outside the project itself.
    const projectOnly = [
      "filterOptions",
      "maps",
      "facets",
      "previewTraces",
      "modelSettings",
      "hasCurrentEmbeddings",
      "tracingReadinessSettings",
      "executions",
      "setupTraceCounts",
      "setupTraceNames",
      "ruleMapCosts",
      // Resolves LLM providers in the project; see the connection test below.
      "testModelSettings",
    ];
    // A new procedure must join one of the two lists.
    expect([...Object.keys(foreignIdCases), ...projectOnly].sort()).toEqual(
      topicsProcedures().sort(),
    );
    for (const run of Object.values(foreignIdCases)) await run();

    // Neither project changed.
    expect(await getTopicRule(b.projectId, b.ruleId)).toEqual(bRuleBefore);
    expect(
      await prisma.evaluatorVersion.count({
        where: { evaluatorId: b.facetId },
      }),
    ).toBe(1);
    expect(
      await prisma.evaluator.count({ where: { projectId, name: "Hijacked" } }),
    ).toBe(0);
    expect(
      await prisma.topicConfig.findUniqueOrThrow({ where: { projectId } }),
    ).toEqual(aConfigBefore);
    expect(
      await prisma.topicClusteringRun.count({
        where: { projectId: b.projectId },
      }),
    ).toBe(bRunsBefore);
  });

  it("rejects a one-off scan filter that a live scan could not save", async () => {
    const admin = caller(userId, [[a.orgId, a.projectId, "ADMIN"]]);
    await expect(
      admin.startAnalysis({
        projectId: a.projectId,
        label: "Slow traces",
        filter: [
          { column: "latency", type: "number", operator: ">", value: 10 },
        ],
        timeRange: { from: new Date(Date.now() - 86_400_000), to: new Date() },
        facets: [{ facetId: a.facetId, version: 1 }],
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining(
        'Filter column "latency" is not supported',
      ),
    });
  });

  it("rejects first-run setup reads and writes for a project the caller is not a member of", async () => {
    const memberOfA = caller(userId, [[a.orgId, a.projectId, "ADMIN"]]);

    // Positive control: the caller's own project answers.
    await expect(
      memberOfA.setupTraceCounts({ projectId: a.projectId }),
    ).resolves.toBeDefined();

    await expect(
      memberOfA.setupTraceCounts({ projectId: b.projectId }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      memberOfA.startRuleSetup({
        projectId: b.projectId,
        ruleId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("resolves LLM connections by provider within the project, then its organization", async () => {
    const admin = caller(userId, [
      [a.orgId, a.projectId, "ADMIN"],
      [b.orgId, b.projectId, "ADMIN"],
    ]);
    const projectId = a.projectId;
    const shared = `openai-${randomUUID()}`;
    const overriddenOrgKey = await llmConnection(
      { organizationId: a.orgId },
      shared,
    );
    const overridingProjectKey = await llmConnection({ projectId }, shared);
    const inheritedOrgKey = await llmConnection({ organizationId: a.orgId });
    const otherOrgKey = await llmConnection({ organizationId: b.orgId });
    const otherProjectKey = await prisma.llmApiKeys.findUniqueOrThrow({
      where: { id: b.llmKeyId },
    });
    const config = await prisma.topicConfig.findUniqueOrThrow({
      where: { projectId },
    });
    const settings = (provider: string) => ({
      projectId,
      summary: { provider, model: "summary-model" },
      embedding: null,
      embeddingDimensions: 1024,
      clustering: null,
    });

    // Saving or testing: providers only another project or org has are refused.
    for (const { provider } of [otherProjectKey, otherOrgKey]) {
      await expect(admin.testModelSettings(settings(provider))).rejects.toThrow(
        "LLM connection not found in this project.",
      );
      await expect(
        admin.saveSetup({
          ...settings(provider),
          facets: DEFAULT_TOPIC_FACETS.map(({ name }) => ({
            name,
            enabled: true,
          })),
          filter: [],
          traceIdleMs: 600_000,
        }),
      ).rejects.toThrow("LLM connection not found in this project.");
    }
    expect(
      await prisma.topicConfig.findUniqueOrThrow({ where: { projectId } }),
    ).toEqual(config);

    // The project's connection overrides its organization's for the same provider.
    await admin.testModelSettings(settings(shared));
    expect(generateTopicText).toHaveBeenLastCalledWith(
      expect.objectContaining({
        model: expect.objectContaining({
          connection: expect.objectContaining({
            baseURL: overridingProjectKey.baseURL,
          }),
        }),
      }),
    );

    // Running: the stored connection's provider resolves again in this project.
    const summaryBaseUrl = async (summaryLlmApiKeyId: string) => {
      await prisma.topicConfig.update({
        where: { projectId },
        data: { summaryLlmApiKeyId },
      });
      return (await getTopicsModels(projectId))?.summary.connection.baseURL;
    };
    expect(await summaryBaseUrl(overriddenOrgKey.id)).toBe(
      overridingProjectKey.baseURL,
    );
    expect(await summaryBaseUrl(inheritedOrgKey.id)).toBe(
      inheritedOrgKey.baseURL,
    );
    expect(await summaryBaseUrl(otherOrgKey.id)).toBeUndefined();
    expect(await summaryBaseUrl(otherProjectKey.id)).toBeUndefined();
    await prisma.topicConfig.update({
      where: { projectId },
      data: { summaryLlmApiKeyId: config.summaryLlmApiKeyId },
    });
  });
});
