import type { Session } from "next-auth";

import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma } from "@langfuse/shared/src/db";
import {
  convertDateToClickhouseDateTime,
  createAuditLogsCh,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import { createSession } from "@/src/__tests__/fixtures/session-factory";

function makeOwnerSession(
  org: { id: string; name: string },
  project: { id: string; name: string },
): Session {
  return createSession({
    user: {
      id: "user-test",
      name: "Test User",
      v4BetaEnabled: false,
      featureFlags: testFeatureFlags({ templateFlag: false }),
    },
    organizations: [
      {
        id: org.id,
        role: "OWNER",
        name: org.name,
        plan: "cloud:enterprise",
        projects: [{ id: project.id, retentionDays: null, name: project.name }],
      },
    ],
    environment: { selfHostedInstancePlan: "cloud:enterprise" },
  });
}

const at = (minute: number) =>
  convertDateToClickhouseDateTime(
    new Date(`2026-11-01T10:${String(minute).padStart(2, "0")}:00Z`),
  );

describe("auditLogs tRPC", () => {
  const orgIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  });

  it("reads the scope's change and access events from ClickHouse without support access", async () => {
    const { org, project } = await createOrgProjectAndApiKey();
    orgIds.push(org.id);
    const otherProject = await prisma.project.create({
      data: { name: "other", orgId: org.id },
    });

    const [, change, access, , , orgLevel] = await createAuditLogsCh([
      // Recorded by the organisation the project belonged to before a
      // transfer. Its members' names stay with that organisation.
      {
        org_id: "previous-org",
        project_id: project.id,
        timestamp: at(0),
        action: "transfer",
        actor_name: "Previous Org Member",
        actor_email: "member@previous.example.com",
      },
      {
        org_id: org.id,
        project_id: project.id,
        timestamp: at(1),
        actor_name: "Former Member",
        actor_email: "former@example.com",
      },
      {
        org_id: org.id,
        project_id: project.id,
        timestamp: at(2),
        event_kind: "access",
        resource_type: "trace",
        action: "read",
        resource_refs: ["trace:trace-1"],
        route: "events.byTraceId",
        result_count: 1,
      },
      {
        org_id: org.id,
        project_id: project.id,
        timestamp: at(3),
        event_kind: "access",
        action: "read",
        support_access: true,
      },
      { org_id: org.id, project_id: otherProject.id, timestamp: at(4) },
      {
        org_id: org.id,
        timestamp: at(5),
        actor_type: "SYSTEM",
        user_id: "",
        actor_name: "stripe-webhook",
      },
    ]);

    const caller = appRouter.createCaller({
      ...createInnerTRPCContext({
        session: makeOwnerSession(org, project),
        headers: {},
      }),
      prisma,
    });

    const projectLogs = await caller.auditLogs.all({
      projectId: project.id,
      page: 0,
      limit: 50,
    });
    expect(projectLogs.totalCount).toBe(2);
    expect(projectLogs.data.map((log) => log.id)).toEqual([
      access.id,
      change.id,
    ]);
    expect(projectLogs.data[0]).toMatchObject({
      eventKind: "access",
      outcome: "success",
      route: "events.byTraceId",
      resultCount: 1,
      before: null,
    });
    // The user is no longer a member, so the recorded name and email remain.
    expect(projectLogs.data[1].actor).toEqual({
      type: "USER",
      body: {
        id: change.user_id,
        name: "Former Member",
        email: "former@example.com",
        image: null,
      },
    });

    const orgLogs = await caller.auditLogs.allByOrg({
      orgId: org.id,
      page: 0,
      limit: 50,
    });
    expect(orgLogs.totalCount).toBe(1);
    expect(orgLogs.data).toEqual([
      expect.objectContaining({
        id: orgLevel.id,
        projectId: null,
        actor: { type: "SYSTEM", body: { name: "stripe-webhook" } },
      }),
    ]);
  });
});
