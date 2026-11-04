import { randomUUID } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env as sharedEnv } from "@langfuse/shared/src/env";
import { prisma } from "@langfuse/shared/src/db";
import {
  createApiKey,
  createBasicAuthHeader,
} from "@langfuse/shared/src/server";
import {
  OrganizationId,
  ProjectId,
  SystemRoleId,
  UserId,
} from "@langfuse/shared/rbac";
import topicsHandler from "@/src/pages/api/public/unstable/topics/index";
import topicHandler from "@/src/pages/api/public/unstable/topics/[topicId]";
import facetsHandler from "@/src/pages/api/public/unstable/topic-facets/index";
import facetHandler from "@/src/pages/api/public/unstable/topic-facets/[facetId]";
import { topicsProject } from "@/src/__tests__/fixtures/topics";
import summariesHandler from "@/src/pages/api/public/unstable/topic-summaries/index";
import assignmentsHandler from "@/src/pages/api/public/unstable/topic-assignments/index";
import rulesHandler from "@/src/pages/api/public/unstable/topic-rules/index";
import ruleHandler from "@/src/pages/api/public/unstable/topic-rules/[ruleId]";

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

describe("unstable Topics public API access", () => {
  let owner: Awaited<ReturnType<typeof topicsProject>>;
  let other: Awaited<ReturnType<typeof topicsProject>>;
  const original = {
    enabled: sharedEnv.LANGFUSE_TOPICS_ENABLED,
    projectIds: sharedEnv.LANGFUSE_TOPICS_ENABLED_PROJECT_IDS,
    region: sharedEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
  };

  beforeAll(async () => {
    owner = await topicsProject();
    other = await topicsProject();
    // The Topics gate reads shared env in this process.
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

    const facets = await get(facetsHandler, otherAuth);
    const topics = await get(topicsHandler, otherAuth);
    expect(facets.status).toBe(200);
    expect(topics.status).toBe(200);
    expect(JSON.stringify(facets.body)).not.toContain(owner.facetId);
    expect(JSON.stringify(topics.body)).not.toContain(owner.topicId);
  });

  it("does not expose a project's rules, summaries or assignments to another project's key", async () => {
    const ownerAuth = createBasicAuthHeader(owner.publicKey, owner.secretKey);
    const otherAuth = createBasicAuthHeader(other.publicKey, other.secretKey);
    const filterOn = (column: string, value: string) => ({
      filter: JSON.stringify([
        { type: "stringOptions", column, operator: "any of", value: [value] },
      ]),
    });
    // Every filter that can name another project's ids or labels.
    const ownerFilters = [
      filterOn("traceId", owner.traceId),
      filterOn("topicId", owner.topicId),
      filterOn("facetId", owner.facetId),
      filterOn("ruleId", owner.ruleId),
      filterOn("topicName", "Private topic"),
    ];

    // Positive control: the owner sees its rule and trace through every filter.
    for (const handler of [summariesHandler, assignmentsHandler])
      for (const query of ownerFilters) {
        const owned = await get(handler, ownerAuth, query);
        expect(owned.status).toBe(200);
        expect(
          owned.body.data.map((row: { traceId: string }) => row.traceId),
        ).toEqual([owner.traceId]);
      }
    expect(
      JSON.stringify(
        (await get(topicsHandler, ownerAuth, filterOn("ruleId", owner.ruleId)))
          .body,
      ),
    ).toContain(owner.topicId);
    expect(JSON.stringify((await get(rulesHandler, ownerAuth)).body)).toContain(
      owner.ruleId,
    );
    expect(
      (await get(ruleHandler, ownerAuth, { ruleId: owner.ruleId })).status,
    ).toBe(200);

    expect(
      (await get(ruleHandler, otherAuth, { ruleId: owner.ruleId })).status,
    ).toBe(404);
    expect(
      JSON.stringify((await get(rulesHandler, otherAuth)).body),
    ).not.toContain(owner.ruleId);
    for (const handler of [summariesHandler, assignmentsHandler])
      for (const query of [{}, ...ownerFilters]) {
        const result = await get(handler, otherAuth, query);
        expect(result.status).toBe(200);
        expect(JSON.stringify(result.body)).not.toContain(owner.traceId);
      }
    const topics = await get(
      topicsHandler,
      otherAuth,
      filterOn("ruleId", owner.ruleId),
    );
    expect(topics.status).toBe(200);
    expect(JSON.stringify(topics.body)).not.toContain(owner.topicId);
  });

  it("returns not found once a project leaves the Topics allowlist", async () => {
    const auth = createBasicAuthHeader(other.publicKey, other.secretKey);
    const routes = [
      [facetsHandler, {}],
      [facetHandler, { facetId: other.facetId }],
      [topicsHandler, {}],
      [topicHandler, { topicId: other.topicId }],
      [rulesHandler, {}],
      [ruleHandler, { ruleId: other.ruleId }],
      [summariesHandler, {}],
      [assignmentsHandler, {}],
    ] as const;
    // Positive control: its own ids resolve while the project is allowed.
    for (const [handler, query] of routes)
      expect((await get(handler, auth, query)).status).toBe(200);
    (sharedEnv as any).LANGFUSE_TOPICS_ENABLED_PROJECT_IDS = [owner.projectId];
    try {
      for (const [handler, query] of routes)
        expect((await get(handler, auth, query)).status).toBe(404);
    } finally {
      (sharedEnv as any).LANGFUSE_TOPICS_ENABLED_PROJECT_IDS = [
        owner.projectId,
        other.projectId,
      ];
    }
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
      [rulesHandler, {}],
      [ruleHandler, { ruleId: owner.ruleId }],
      [summariesHandler, {}],
      [assignmentsHandler, {}],
    ] as const)
      expect((await get(handler, auth, query)).status).toBe(403);
  });
});
