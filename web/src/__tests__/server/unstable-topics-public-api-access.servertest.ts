import { randomUUID } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env as sharedEnv } from "@langfuse/shared/src/env";
import { prisma } from "@langfuse/shared/src/db";
import {
  createApiKey,
  createBasicAuthHeader,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import {
  OrganizationId,
  ProjectId,
  SystemRoleId,
  UserId,
} from "@langfuse/shared/rbac";
import {
  createTopicFacet,
  createTopicRun,
  saveTopicRun,
  writeTopicSummaries,
} from "@langfuse/shared/topics/server";
import topicsHandler from "@/src/pages/api/public/unstable/topics/index";
import topicHandler from "@/src/pages/api/public/unstable/topics/[topicId]";
import facetsHandler from "@/src/pages/api/public/unstable/topic-facets/index";
import facetHandler from "@/src/pages/api/public/unstable/topic-facets/[facetId]";

type Handler = (req: NextApiRequest, res: NextApiResponse) => Promise<void>;

// In-process calls, since the Topics gate reads shared env in this process.
async function get(
  handler: Handler,
  authorization: string,
  query: Record<string, string> = {},
) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: "GET",
    query,
    headers: { authorization },
  });
  await handler(req, res);
  return { status: res._getStatusCode(), body: res._getJSONData() };
}

/** A Topics-enabled project with one facet whose published run holds one topic. */
async function topicsProject() {
  const project = await createOrgProjectAndApiKey();
  const facet = await createTopicFacet({
    projectId: project.projectId,
    name: `Facet ${randomUUID()}`,
    description: "Private facet",
    prompt: "Summarize the trace.",
  });
  const run = await createTopicRun({
    projectId: project.projectId,
    facetId: facet.id,
    facetVersion: 1,
    config: {},
  });
  const topicId = randomUUID();
  const now = new Date().toISOString();
  await saveTopicRun({
    ...run,
    status: "completed",
    finishedAt: now,
    topics: [
      {
        topicVersionId: randomUUID(),
        topicId,
        projectId: project.projectId,
        createdByRunId: run.id,
        createdAt: now,
        tags: [],
        name: "Private topic",
        description: "Private topic description",
        centroid: [1, 0],
        radius: 0.5,
        representativeSummaries: [],
        metadata: {},
      },
    ],
  });
  // Topics are served only once the project has a stored summary.
  await writeTopicSummaries([
    {
      projectId: project.projectId,
      facetId: facet.id,
      facetVersion: 1,
      traceId: randomUUID(),
      sessionId: null,
      triggerType: "manual_poc",
      environment: "production",
      traceName: "assistant",
      unitStartTime: now,
      state: "complete",
      summary: "Private summary",
      embedding: [1, 0],
      transcriptId: "test",
      transcriptVersion: "test",
      summaryModel: "summary-model",
      embeddingModel: "embedding-model",
      providedUsageDetails: {},
      usageDetails: {},
      providedCostDetails: {},
      costDetails: {},
      processedAt: now,
      metadata: {},
    },
  ]);
  return { ...project, facetId: facet.id, topicId };
}

describe("unstable Topics public API access", () => {
  const original = {
    enabled: sharedEnv.LANGFUSE_TOPICS_ENABLED,
    projectIds: sharedEnv.LANGFUSE_TOPICS_ENABLED_PROJECT_IDS,
    region: sharedEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
  };
  let owner: Awaited<ReturnType<typeof topicsProject>>;
  let other: Awaited<ReturnType<typeof topicsProject>>;

  beforeAll(async () => {
    owner = await topicsProject();
    other = await topicsProject();
    (sharedEnv as any).LANGFUSE_TOPICS_ENABLED = "true";
    (sharedEnv as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "DEV";
    (sharedEnv as any).LANGFUSE_TOPICS_ENABLED_PROJECT_IDS = [
      owner.projectId,
      other.projectId,
    ];
  });

  afterAll(() => {
    (sharedEnv as any).LANGFUSE_TOPICS_ENABLED = original.enabled;
    (sharedEnv as any).LANGFUSE_TOPICS_ENABLED_PROJECT_IDS =
      original.projectIds;
    (sharedEnv as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = original.region;
  });

  it("does not expose a project's facets or topics to another project's key", async () => {
    const ownerAuth = createBasicAuthHeader(owner.publicKey, owner.secretKey);
    const otherAuth = createBasicAuthHeader(other.publicKey, other.secretKey);

    // Positive control: the owner reads both, so the 404s below are not vacuous.
    for (const [auth, status] of [
      [ownerAuth, 200],
      [otherAuth, 404],
    ] as const) {
      expect(
        (await get(facetHandler, auth, { facetId: owner.facetId })).status,
      ).toBe(status);
      expect(
        (await get(topicHandler, auth, { topicId: owner.topicId })).status,
      ).toBe(status);
    }

    // No Topics rule exists, so every facet counts as active and is listed.
    const facets = await get(facetsHandler, otherAuth);
    const topics = await get(topicsHandler, otherAuth);
    expect(facets.status).toBe(200);
    expect(topics.status).toBe(200);
    expect(JSON.stringify(facets.body)).not.toContain(owner.facetId);
    expect(JSON.stringify(topics.body)).not.toContain(owner.topicId);
  });

  it("denies a project key without topics:read", async () => {
    const creator = await prisma.user.create({
      data: { email: `topics-ingest-${randomUUID()}@example.com` },
    });
    const ingestKey = await createApiKey(prisma, {
      tenant: OrganizationId(owner.orgId),
      scope: ProjectId(owner.projectId),
      role: SystemRoleId("INGEST"),
      createdBy: UserId(creator.id),
    });
    const auth = createBasicAuthHeader(
      ingestKey.publicKey,
      ingestKey.secretKey,
    );

    for (const [handler, query] of [
      [facetsHandler, {}],
      [facetHandler, { facetId: owner.facetId }],
      [topicsHandler, {}],
      [topicHandler, { topicId: owner.topicId }],
    ] as const)
      expect((await get(handler, auth, query)).status).toBe(403);
  });
});
