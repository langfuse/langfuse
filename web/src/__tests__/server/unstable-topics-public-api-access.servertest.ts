import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import path from "node:path";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { beforeAll, describe, expect, it } from "vitest";
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
import type { HttpMethod } from "@/src/features/public-api/server/withMiddlewares";
import summariesHandler from "@/src/pages/api/public/unstable/topic-summaries/index";
import assignmentsHandler from "@/src/pages/api/public/unstable/topic-assignments/index";
import rulesHandler from "@/src/pages/api/public/unstable/topic-rules/index";
import ruleHandler from "@/src/pages/api/public/unstable/topic-rules/[ruleId]";

type Handler = (req: NextApiRequest, res: NextApiResponse) => Promise<void>;

async function get(
  handler: Handler,
  authorization: string,
  query: Record<string, string> = {},
  method: HttpMethod = "GET",
) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method,
    query,
    headers: { authorization },
  });
  await handler(req, res);
  return { status: res._getStatusCode(), body: res._getJSONData() };
}

/**
 * Every Topics route by file: a query naming one of the project's resources,
 * that resource's id, and the status another project's key gets for it.
 */
function topicsRoutes(project: Awaited<ReturnType<typeof topicsProject>>) {
  const { topicId, facetId, ruleId, traceId } = project;
  return {
    "topics/index": [topicsHandler, {}, topicId, 200],
    "topics/[topicId]": [topicHandler, { topicId }, topicId, 404],
    "topic-facets/index": [facetsHandler, {}, facetId, 200],
    "topic-facets/[facetId]": [facetHandler, { facetId }, facetId, 404],
    "topic-rules/index": [rulesHandler, {}, ruleId, 200],
    "topic-rules/[ruleId]": [ruleHandler, { ruleId }, ruleId, 404],
    "topic-summaries/index": [summariesHandler, {}, traceId, 200],
    "topic-assignments/index": [assignmentsHandler, {}, traceId, 200],
  } satisfies Record<
    string,
    [Handler, Record<string, string>, string, 200 | 404]
  >;
}

describe("unstable Topics public API access", () => {
  let owner: Awaited<ReturnType<typeof topicsProject>>;
  let other: Awaited<ReturnType<typeof topicsProject>>;

  beforeAll(async () => {
    owner = await topicsProject();
    other = await topicsProject();
  });

  it("serves every Topics route read-only and only from the key's own project", async () => {
    const ownerAuth = createBasicAuthHeader(owner.publicKey, owner.secretKey);
    const otherAuth = createBasicAuthHeader(other.publicKey, other.secretKey);
    const routes = topicsRoutes(owner);
    const files = readdirSync(
      path.resolve(process.cwd(), "src/pages/api/public/unstable"),
      { recursive: true, encoding: "utf8" },
    ).flatMap((file) =>
      file.startsWith("topic") && file.endsWith(".ts")
        ? [file.slice(0, -3)]
        : [],
    );
    // A new Topics route must join the table.
    expect(Object.keys(routes).sort()).toEqual(files.sort());

    for (const [route, [handler, query, id, foreignStatus]] of Object.entries(
      routes,
    )) {
      // Positive control: the owner reads the id, so the checks below are not vacuous.
      const owned = await get(handler, ownerAuth, query);
      expect(owned.status, route).toBe(200);
      expect(JSON.stringify(owned.body), route).toContain(id);

      const foreign = await get(handler, otherAuth, query);
      expect(foreign.status, route).toBe(foreignStatus);
      expect(JSON.stringify(foreign.body), route).not.toContain(id);

      // A write method would need its own scope test.
      for (const method of ["POST", "PUT", "DELETE", "PATCH"] as const)
        expect(
          (await get(handler, ownerAuth, query, method)).status,
          `${method} ${route}`,
        ).toBe(405);
    }
  });

  it("does not expose another project's rows through filters naming its ids", async () => {
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

    for (const handler of [summariesHandler, assignmentsHandler])
      for (const query of ownerFilters) {
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

    for (const [handler, query] of Object.values(topicsRoutes(owner)))
      expect((await get(handler, auth, query)).status).toBe(403);
  });
});
