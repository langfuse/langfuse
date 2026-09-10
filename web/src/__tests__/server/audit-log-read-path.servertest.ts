import { randomUUID } from "crypto";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma, type Role } from "@langfuse/shared/src/db";
import {
  createAuditLogsCh,
  createOrgProjectAndApiKey,
  type AuditLogRecordInsertType,
} from "@langfuse/shared/src/server";
import type { Session } from "next-auth";

function makeSession(args: {
  userId: string;
  orgId: string;
  orgRole: Role;
  projectId: string;
  projectRole: Role;
}): Session {
  return {
    expires: "1",
    user: {
      id: args.userId,
      canCreateOrganizations: true,
      name: "Audit Reader",
      v4BetaEnabled: false,
      organizations: [
        {
          id: args.orgId,
          name: "org",
          role: args.orgRole,
          plan: "cloud:team",
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: false,
          aiTelemetryEnabled: false,
          projects: [
            {
              id: args.projectId,
              role: args.projectRole,
              retentionDays: null,
              deletedAt: null,
              hasTraces: false,
              name: "project",
              metadata: {},
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ],
      featureFlags: {
        excludeClickhouseRead: false,
        templateFlag: false,
        searchBar: false,
        v4BetaToggleVisible: false,
        observationEvals: false,
        experimentsV4Enabled: false,
      },
      admin: false,
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: "cloud:team",
    },
  };
}

const baseRow = (
  overrides: Partial<AuditLogRecordInsertType> &
    Pick<AuditLogRecordInsertType, "org_id" | "timestamp">,
): AuditLogRecordInsertType => ({
  id: randomUUID(),
  project_id: "",
  event_kind: "change",
  actor_type: "USER",
  user_id: "",
  api_key_id: "",
  user_org_role: "",
  user_project_role: "",
  resource_type: "prompt",
  resource_id: randomUUID(),
  action: "create",
  surface: "",
  route: "",
  params: "",
  result_count: 0,
  before: "",
  after: "",
  ...overrides,
});

describe("audit log read path (ClickHouse)", () => {
  it("lists project audit logs newest first with actors, filters and dedup", async () => {
    const { orgId, projectId, publicKey } = await createOrgProjectAndApiKey();
    const apiKey = await prisma.apiKey.findFirstOrThrow({
      where: { publicKey },
      select: { id: true },
    });

    const reader = await prisma.user.create({
      data: {
        id: randomUUID(),
        email: `${randomUUID()}@example.com`,
        name: "Reader",
        organizationMemberships: {
          create: { orgId, role: "OWNER" },
        },
      },
    });
    const outsider = await prisma.user.create({
      data: {
        id: randomUUID(),
        email: `${randomUUID()}@example.com`,
        name: "Outsider",
      },
    });

    const change = baseRow({
      org_id: orgId,
      project_id: projectId,
      timestamp: "2024-03-01 10:00:00.000",
      user_id: reader.id,
      user_org_role: "OWNER",
      user_project_role: "OWNER",
      action: "update",
      before: JSON.stringify({ a: 1 }),
      after: JSON.stringify({ a: 2 }),
    });
    const access = baseRow({
      org_id: orgId,
      project_id: projectId,
      timestamp: "2024-03-02 10:00:00.000",
      event_kind: "access",
      actor_type: "API_KEY",
      api_key_id: apiKey.id,
      resource_type: "trace",
      resource_id: "",
      action: "list",
      surface: "public-api",
      route: "GET /api/public/traces",
      params: JSON.stringify({ limit: 10 }),
      result_count: 3,
    });
    const strangerChange = baseRow({
      org_id: orgId,
      project_id: projectId,
      timestamp: "2024-03-03 10:00:00.000",
      user_id: outsider.id,
    });
    const orgLevel = baseRow({
      org_id: orgId,
      timestamp: "2024-03-04 10:00:00.000",
      user_id: reader.id,
      resource_type: "project",
    });
    const otherOrg = baseRow({
      org_id: randomUUID(),
      project_id: projectId,
      timestamp: "2024-03-05 10:00:00.000",
    });

    // `change` twice: dual write and backfill may both land before a merge.
    await createAuditLogsCh([
      change,
      change,
      access,
      strangerChange,
      orgLevel,
      otherOrg,
    ]);

    const session = makeSession({
      userId: reader.id,
      orgId,
      orgRole: "OWNER",
      projectId,
      projectRole: "OWNER",
    });
    const caller = appRouter.createCaller({
      ...createInnerTRPCContext({ session, headers: {} }),
      prisma,
    });

    const page = await caller.auditLogs.all({
      projectId,
      page: 0,
      limit: 50,
    });

    expect(page.totalCount).toBe(3);
    expect(page.data.map((row) => row.id)).toEqual([
      strangerChange.id,
      access.id,
      change.id,
    ]);

    const [stranger, accessRow, changeRow] = page.data;

    // A user outside the organisation is not resolved to display data.
    expect(stranger.actor).toEqual({
      type: "USER",
      body: { id: outsider.id, name: null, email: null, image: null },
    });

    expect(accessRow.eventKind).toBe("access");
    expect(accessRow.actor).toEqual({
      type: "API_KEY",
      body: { id: apiKey.id, publicKey },
    });
    expect(accessRow.surface).toBe("public-api");
    expect(accessRow.route).toBe("GET /api/public/traces");
    expect(accessRow.params).toBe(JSON.stringify({ limit: 10 }));
    expect(accessRow.resultCount).toBe(3);
    expect(accessRow.resourceId).toBe("");
    expect(accessRow.before).toBeNull();
    expect(accessRow.after).toBeNull();

    expect(changeRow.eventKind).toBe("change");
    expect(changeRow.actor).toMatchObject({
      type: "USER",
      body: { id: reader.id, name: "Reader" },
    });
    expect(changeRow.userOrgRole).toBe("OWNER");
    expect(changeRow.before).toBe(JSON.stringify({ a: 1 }));
    expect(changeRow.after).toBe(JSON.stringify({ a: 2 }));
    expect(changeRow.createdAt).toEqual(new Date("2024-03-01T10:00:00.000Z"));

    const filtered = await caller.auditLogs.all({
      projectId,
      filter: [
        {
          column: "eventKind",
          type: "stringOptions",
          operator: "any of",
          value: ["access"],
        },
      ],
      page: 0,
      limit: 50,
    });
    expect(filtered.totalCount).toBe(1);
    expect(filtered.data.map((row) => row.id)).toEqual([access.id]);

    const paged = await caller.auditLogs.all({
      projectId,
      page: 1,
      limit: 2,
    });
    expect(paged.totalCount).toBe(3);
    expect(paged.data.map((row) => row.id)).toEqual([change.id]);

    const orgPage = await caller.auditLogs.allByOrg({
      orgId,
      page: 0,
      limit: 50,
    });
    expect(orgPage.totalCount).toBe(1);
    expect(orgPage.data.map((row) => row.id)).toEqual([orgLevel.id]);
    expect(orgPage.data[0].projectId).toBeNull();
  });

  it("rejects filters on unknown columns", async () => {
    const { orgId, projectId } = await createOrgProjectAndApiKey();
    const userId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId,
        email: `${randomUUID()}@example.com`,
        organizationMemberships: { create: { orgId, role: "OWNER" } },
      },
    });
    const caller = appRouter.createCaller({
      ...createInnerTRPCContext({
        session: makeSession({
          userId,
          orgId,
          orgRole: "OWNER",
          projectId,
          projectRole: "OWNER",
        }),
        headers: {},
      }),
      prisma,
    });

    await expect(
      caller.auditLogs.all({
        projectId,
        filter: [
          {
            column: "nope",
            type: "string",
            operator: "=",
            value: "x",
          },
        ],
        page: 0,
        limit: 50,
      }),
    ).rejects.toThrow();
  });
});
