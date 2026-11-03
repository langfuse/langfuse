import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { randomUUID } from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import type { Session } from "next-auth";
import { createMocks } from "node-mocks-http";
import waitForExpect from "wait-for-expect";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as SharedServer from "@langfuse/shared/src/server";

const staging = vi.hoisted(() => ({ fail: false }));

// The events tables exist only after the ClickHouse dev-tables setup, which the
// azure and redis-cluster CI runs skip.
const eventsTableAvailable = vi.hoisted(
  () => process.env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true",
);

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedServer>();
  return {
    ...actual,
    stageAuditLogEvents: async (
      ...args: Parameters<typeof actual.stageAuditLogEvents>
    ) => {
      if (staging.fail) throw new Error("staging unavailable");
      return actual.stageAuditLogEvents(...args);
    },
  };
});

import { Role } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  createEvent,
  createEventsCh,
  createOrgProjectAndApiKey,
  createTrace,
  createTracesCh,
  getTraceByIdFromEventsTable,
} from "@langfuse/shared/src/server";
import getTraceHandler from "@/src/pages/api/public/traces/[traceId]";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

async function setupOrg(accessAuditLogEnabled: boolean) {
  const fixture = await createOrgProjectAndApiKey({ plan: "Enterprise" });
  await prisma.organization.update({
    where: { id: fixture.orgId },
    data: { accessAuditLogEnabled },
  });
  return fixture;
}

async function accessEvents(orgId: string) {
  const rows = await prisma.auditLogStaging.findMany({
    where: { payload: { path: ["orgId"], equals: orgId } },
  });
  return rows.map((row) => row.payload as Record<string, unknown>);
}

function trpcCaller(params: {
  userId: string;
  orgId: string;
  projectId: string;
  accessAuditLogEnabled: boolean;
}) {
  const session: Session = {
    expires: "1",
    user: {
      id: params.userId,
      name: "Access Audit Reader",
      email: "reader@example.com",
      canCreateOrganizations: true,
      organizations: [
        {
          id: params.orgId,
          name: "Access Audit Org",
          role: Role.MEMBER,
          plan: "cloud:enterprise",
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: false,
          aiTelemetryEnabled: false,
          accessAuditLogEnabled: params.accessAuditLogEnabled,
          projects: [
            {
              id: params.projectId,
              name: "Access Audit Project",
              role: Role.VIEWER,
              retentionDays: null,
              deletedAt: null,
              hasTraces: true,
              metadata: {},
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ],
      featureFlags: testFeatureFlags(),
      admin: false,
    },
    environment: {} as any,
  };
  const ctx = createInnerTRPCContext({ session, headers: {} });
  return appRouter.createCaller({ ...ctx, prisma });
}

async function seedEventsTrace(projectId: string) {
  const traceId = randomUUID();
  const rootId = randomUUID();
  const childId = randomUUID();
  const startTime = Date.now() * 1000;
  await createEventsCh([
    createEvent({
      id: rootId,
      span_id: rootId,
      trace_id: traceId,
      project_id: projectId,
      parent_span_id: "",
      start_time: startTime,
    }),
    createEvent({
      id: childId,
      span_id: childId,
      trace_id: traceId,
      project_id: projectId,
      parent_span_id: rootId,
      start_time: startTime,
    }),
  ]);
  await waitForExpect(async () => {
    const trace = await getTraceByIdFromEventsTable({ projectId, traceId });
    expect(trace?.id).toBe(traceId);
  });
  return { traceId, observationIds: [rootId, childId] };
}

async function getTraceViaPublicApi(auth: string, traceId: string) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: "GET",
    headers: { authorization: auth },
    query: { traceId },
  });
  await getTraceHandler(req, res);
  return res;
}

afterEach(() => {
  staging.fail = false;
});

describe("access events on GET /api/public/traces/{traceId}", () => {
  it("records the read with the API key as actor", async () => {
    const { orgId, projectId, auth } = await setupOrg(true);
    const trace = createTrace({ project_id: projectId });
    await createTracesCh([trace]);

    const res = await getTraceViaPublicApi(auth, trace.id);

    expect(res._getStatusCode()).toBe(200);
    const events = await accessEvents(orgId);
    expect(events).toEqual([
      expect.objectContaining({
        kind: "access",
        projectId,
        surface: "public-api",
        route: "GET /api/public/traces/{traceId}",
        resourceType: "trace",
        resourceId: trace.id,
        action: "read",
        outcome: "success",
        actor: { type: "API_KEY", apiKeyId: expect.any(String) },
        resourceRefs: [`trace:${trace.id}`, `session:${trace.session_id}`],
      }),
    ]);
  });

  it("fails the read when the event cannot be recorded", async () => {
    const { orgId, projectId, auth } = await setupOrg(true);
    const trace = createTrace({ project_id: projectId });
    await createTracesCh([trace]);
    staging.fail = true;

    const res = await getTraceViaPublicApi(auth, trace.id);

    expect(res._getStatusCode()).toBe(500);
    expect(await accessEvents(orgId)).toEqual([]);
  });
});

const maybe = eventsTableAvailable ? describe : describe.skip;

maybe("access events on tRPC events.byTraceId", () => {
  it("records the read with the user, the trace and its observations", async () => {
    const { orgId, projectId } = await setupOrg(true);
    const { traceId, observationIds } = await seedEventsTrace(projectId);
    const userId = randomUUID();
    const caller = trpcCaller({
      userId,
      orgId,
      projectId,
      accessAuditLogEnabled: true,
    });

    await caller.events.byTraceId({ projectId, traceId });

    const events = await accessEvents(orgId);
    expect(events).toEqual([
      expect.objectContaining({
        kind: "access",
        projectId,
        surface: "trpc",
        route: "events.byTraceId",
        resourceId: traceId,
        resultCount: 2,
        actor: expect.objectContaining({
          type: "USER",
          userId,
          orgRole: Role.MEMBER,
          projectRole: Role.VIEWER,
        }),
      }),
    ]);
    expect(events[0]?.resourceRefs).toEqual(
      expect.arrayContaining([
        `trace:${traceId}`,
        ...observationIds.map((id) => `observation:${id}`),
      ]),
    );
  });

  it("records nothing for an org that has not opted in", async () => {
    const { orgId, projectId } = await setupOrg(false);
    const { traceId } = await seedEventsTrace(projectId);
    const caller = trpcCaller({
      userId: randomUUID(),
      orgId,
      projectId,
      accessAuditLogEnabled: false,
    });

    await caller.events.byTraceId({ projectId, traceId });

    expect(await accessEvents(orgId)).toEqual([]);
  });

  it("fails the read when the event cannot be recorded", async () => {
    const { orgId, projectId } = await setupOrg(true);
    const { traceId } = await seedEventsTrace(projectId);
    const caller = trpcCaller({
      userId: randomUUID(),
      orgId,
      projectId,
      accessAuditLogEnabled: true,
    });
    staging.fail = true;

    await expect(
      caller.events.byTraceId({ projectId, traceId }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});
