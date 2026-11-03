import { randomUUID } from "node:crypto";
import type { Session } from "next-auth";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LLMAdapter } from "@langfuse/shared";
import { env as sharedEnv } from "@langfuse/shared/src/env";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import {
  DEFAULT_TOPIC_FACETS,
  topicEmbeddingConfigSchema,
  topicProcessingConfigSchema,
} from "@langfuse/shared/topics";
import {
  createTopicExecution,
  createTopicFacet,
  createTopicRun,
  getTopicsModels,
} from "@langfuse/shared/topics/server";
import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

function caller(userId: string, memberships: [string, string, Role][]) {
  const session = {
    expires: "1",
    user: {
      id: userId,
      admin: false,
      featureFlags: testFeatureFlags({ langfuseTopics: true }),
      organizations: memberships.map(([orgId, projectId, role]) => ({
        id: orgId,
        role,
        projects: [{ id: projectId, role }],
      })),
    },
  } as unknown as Session;
  return appRouter.createCaller({
    ...createInnerTRPCContext({ session, headers: {} }),
    prisma,
  }).topics;
}

function llmConnection(
  owner: { projectId: string } | { organizationId: string },
) {
  return prisma.llmApiKeys.create({
    data: {
      ...owner,
      provider: `openai-${randomUUID()}`,
      adapter: LLMAdapter.OpenAI,
      secretKey: "encrypted",
      displaySecretKey: "...key",
    },
  });
}

/** A project with a project-level LLM connection, configured models, a custom facet, a run and an execution. */
async function topicsProject(userId: string) {
  const { projectId, orgId } = await createOrgProjectAndApiKey();
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
  const facet = await createTopicFacet({
    projectId,
    name: `Facet ${randomUUID()}`,
    description: "",
    prompt: "Summarize the trace.",
  });
  const run = await createTopicRun({
    projectId,
    facetId: facet.id,
    facetVersion: 1,
    config: {},
  });
  const execution = await createTopicExecution(
    {
      projectId,
      requestId: randomUUID(),
      operation: "process",
      facets: [{ facetId: facet.id, version: 1 }],
      traceIds: [randomUUID()],
      reuseExistingSummaries: false,
      processingConfig: topicProcessingConfigSchema.parse({}),
      embeddingConfig: topicEmbeddingConfigSchema.parse({}),
    },
    undefined,
    userId,
  );
  return {
    projectId,
    orgId,
    llmKeyId: llmKey.id,
    facetId: facet.id,
    runId: run.id,
    executionId: execution.id,
  };
}

describe("Topics tRPC access", () => {
  const original = {
    enabled: sharedEnv.LANGFUSE_TOPICS_ENABLED,
    projectIds: sharedEnv.LANGFUSE_TOPICS_ENABLED_PROJECT_IDS,
    region: sharedEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
  };
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
    (sharedEnv as any).LANGFUSE_TOPICS_ENABLED = "true";
    (sharedEnv as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "DEV";
    (sharedEnv as any).LANGFUSE_TOPICS_ENABLED_PROJECT_IDS = [
      a.projectId,
      b.projectId,
    ];
  });

  afterAll(() => {
    (sharedEnv as any).LANGFUSE_TOPICS_ENABLED = original.enabled;
    (sharedEnv as any).LANGFUSE_TOPICS_ENABLED_PROJECT_IDS =
      original.projectIds;
    (sharedEnv as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = original.region;
  });

  it("lets VIEWER read but rejects every write without changing state", async () => {
    const viewer = caller(userId, [[a.orgId, a.projectId, "VIEWER"]]);
    const projectId = a.projectId;
    const before = await prisma.evaluator.count({
      where: { projectId, type: "FACET" },
    });

    await expect(viewer.facets({ projectId })).resolves.toHaveLength(before);
    // Inputs carry only projectId: the topics:CUD check must run before any handler work.
    for (const write of [
      viewer.saveFacet,
      viewer.saveRule,
      viewer.testModelSettings,
      viewer.saveSetup,
      viewer.setAutomaticProcessing,
      viewer.startSetup,
      viewer.trigger,
      viewer.retry,
    ])
      await expect(write({ projectId } as never)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });

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

  it("rejects another project's resources even when the caller administers both", async () => {
    const admin = caller(userId, [
      [a.orgId, a.projectId, "ADMIN"],
      [b.orgId, b.projectId, "ADMIN"],
    ]);
    const projectId = a.projectId;
    const timeRange = {
      from: new Date(Date.now() - 86_400_000),
      to: new Date(),
    };

    // Positive control: the same ids resolve within their own project.
    await expect(
      admin.execution({ projectId: b.projectId, executionId: b.executionId }),
    ).resolves.toMatchObject({ id: b.executionId });

    await expect(
      admin.execution({ projectId, executionId: b.executionId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      admin.retry({ projectId, executionId: b.executionId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      admin.map({ projectId, runId: b.runId, timeRange }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      admin.saveFacet({
        projectId,
        facetId: b.facetId,
        name: "Hijacked",
        prompt: "Leak the other project's traces.",
      }),
    ).rejects.toThrow("Facet not found in this project.");
    await expect(
      admin.saveRule({
        projectId,
        name: "Foreign rule",
        filter: [],
        facetIds: [b.facetId],
      }),
    ).rejects.toThrow("Select facets from this project.");
    await expect(
      admin.trigger({
        projectId,
        requestId: randomUUID(),
        operation: "process",
        facets: [{ facetId: b.facetId, version: 1 }],
        traceIds: [randomUUID()],
        reuseExistingSummaries: false,
        processingConfig: topicProcessingConfigSchema.parse({}),
        embeddingConfig: topicEmbeddingConfigSchema.parse({}),
      }),
    ).rejects.toThrow("Facet version not found in this project.");

    // Project B is untouched.
    expect(
      await prisma.evaluatorVersion.count({
        where: { evaluatorId: b.facetId },
      }),
    ).toBe(1);
    expect(
      await prisma.evaluator.count({
        where: { projectId: a.projectId, name: "Hijacked" },
      }),
    ).toBe(0);
  });

  it("uses only LLM connections of the project or its organization", async () => {
    const admin = caller(userId, [
      [a.orgId, a.projectId, "ADMIN"],
      [b.orgId, b.projectId, "ADMIN"],
    ]);
    const projectId = a.projectId;
    const ownOrgKey = await llmConnection({ organizationId: a.orgId });
    const otherOrgKey = await llmConnection({ organizationId: b.orgId });
    const config = await prisma.topicConfig.findUniqueOrThrow({
      where: { projectId },
    });
    const settings = (llmApiKeyId: string) => ({
      projectId,
      summary: { llmApiKeyId, model: "summary-model" },
      embedding: null,
      embeddingDimensions: 1024,
      clustering: null,
    });

    // Saving or testing: another project's or another org's connection is refused.
    for (const foreignKeyId of [b.llmKeyId, otherOrgKey.id]) {
      await expect(
        admin.testModelSettings(settings(foreignKeyId)),
      ).rejects.toThrow("LLM connection not found in this project.");
      await expect(
        admin.saveSetup({
          ...settings(foreignKeyId),
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

    // Running: a stored foreign connection resolves to no models; the own org's does.
    const resolveWithSummaryKey = async (summaryLlmApiKeyId: string) => {
      await prisma.topicConfig.update({
        where: { projectId },
        data: { summaryLlmApiKeyId },
      });
      return getTopicsModels(projectId);
    };
    expect(await resolveWithSummaryKey(ownOrgKey.id)).not.toBeNull();
    expect(await resolveWithSummaryKey(otherOrgKey.id)).toBeNull();
    expect(await resolveWithSummaryKey(b.llmKeyId)).toBeNull();
    await prisma.topicConfig.update({
      where: { projectId },
      data: { summaryLlmApiKeyId: config.summaryLlmApiKeyId },
    });
  });
});
