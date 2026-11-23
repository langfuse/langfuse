import { randomUUID } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { OrganizationId, SystemRoleId } from "@langfuse/shared/rbac";
import { prisma } from "@langfuse/shared/src/db";
import {
  type BillableEventType,
  clickhouseClient,
  createApiKey,
  createBasicAuthHeader,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import handler from "@/src/pages/api/public/unstable/organizations/billable-units";

const get = async (authorization: string, query: Record<string, string>) => {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: "GET",
    query,
    headers: { authorization },
  });
  await handler(req, res);
  return { status: res._getStatusCode(), body: res._getJSONData() };
};

const insertBillableEvents = (
  rows: Array<{
    projectId: string;
    eventType: BillableEventType;
    eventId: string;
    at: string;
  }>,
) =>
  clickhouseClient().insert({
    table: "billable_events",
    format: "JSONEachRow",
    values: rows.map((row) => ({
      ingested_at: row.at.slice(0, 19).replace("T", " "),
      project_id: row.projectId,
      event_type: row.eventType,
      event_id: row.eventId,
      event_time: row.at.slice(0, 19).replace("T", " "),
      event_bytes: 0,
    })),
  });

describe("GET /api/public/unstable/organizations/billable-units", () => {
  it("returns the organization's billable units per bucket and project", async () => {
    const { orgId, projectId: alpha } = await createOrgProjectAndApiKey({
      plan: "Team",
    });
    const [beta, deleted] = [randomUUID(), randomUUID()];
    await prisma.project.createMany({
      data: [
        { id: beta, name: "beta", orgId },
        { id: deleted, name: "gone", orgId, deletedAt: new Date() },
      ],
    });
    const { projectId: otherOrgProject } = await createOrgProjectAndApiKey();
    const key = await createApiKey(prisma, {
      tenant: OrganizationId(orgId),
      scope: OrganizationId(orgId),
      role: SystemRoleId("LEGACY_ORGANIZATION_API_KEY"),
      createdBy: "system",
    });
    const auth = createBasicAuthHeader(key.publicKey, key.secretKey);

    await insertBillableEvents([
      {
        projectId: alpha,
        eventType: "trace",
        eventId: "t-1",
        at: "2026-08-03T10:00:00Z",
      },
      {
        projectId: alpha,
        eventType: "trace",
        eventId: "t-1",
        at: "2026-08-03T11:00:00Z",
      },
      {
        projectId: alpha,
        eventType: "observation",
        eventId: "o-1",
        at: "2026-08-03T12:00:00Z",
      },
      {
        projectId: alpha,
        eventType: "score",
        eventId: "s-1",
        at: "2026-08-04T01:00:00Z",
      },
      {
        projectId: beta,
        eventType: "observation",
        eventId: "o-2",
        at: "2026-08-03T05:00:00Z",
      },
      {
        projectId: deleted,
        eventType: "trace",
        eventId: "t-2",
        at: "2026-08-03T05:00:00Z",
      },
      {
        projectId: otherOrgProject,
        eventType: "trace",
        eventId: "t-3",
        at: "2026-08-03T05:00:00Z",
      },
    ]);

    const response = await get(auth, {
      fromTimestamp: "2026-08-03T00:00:00Z",
      toTimestamp: "2026-08-05T00:00:00Z",
    });

    expect(response.status).toBe(200);
    const row = (
      bucket: string,
      projectId: string,
      units: Record<string, number>,
    ) => ({
      bucket,
      projectId,
      traces: 0,
      observations: 0,
      scores: 0,
      topicFacetSummaries: 0,
      ...units,
      count: Object.values(units).reduce((sum, n) => sum + n, 0),
    });
    expect(response.body.data).toEqual(
      [
        row("2026-08-03T00:00:00.000Z", alpha, { traces: 1, observations: 1 }),
        row("2026-08-03T00:00:00.000Z", beta, { observations: 1 }),
        row("2026-08-04T00:00:00.000Z", alpha, { scores: 1 }),
      ].sort(
        (a, b) =>
          a.bucket.localeCompare(b.bucket) ||
          a.projectId.localeCompare(b.projectId),
      ),
    );

    const tooLongHourly = await get(auth, {
      fromTimestamp: "2026-08-01T00:00:00Z",
      toTimestamp: "2026-09-02T00:00:00Z",
      granularity: "hour",
    });
    expect(tooLongHourly.status).toBe(400);
    expect(tooLongHourly.body.code).toBe("invalid_query");
  });
});
