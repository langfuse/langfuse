import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import type { Session } from "next-auth";
import {
  BatchExportFileFormat,
  BatchTableNames,
  type Plan,
} from "@langfuse/shared";
import type { Role } from "@langfuse/shared/src/db";

const __orgIds: string[] = [];

function makeSession(
  orgId: string,
  orgName: string,
  projectId: string,
  projectName: string,
  opts: {
    plan?: Plan;
    projectRole?: Role;
    v4BetaEnabled?: boolean;
  } = {},
): Session {
  const {
    plan = "cloud:hobby",
    projectRole = "MEMBER",
    v4BetaEnabled = false,
  } = opts;
  return {
    expires: "1",
    user: {
      id: "user-test",
      canCreateOrganizations: true,
      name: "Test User",
      v4BetaEnabled,
      organizations: [
        {
          id: orgId,
          name: orgName,
          role: "MEMBER",
          plan,
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: false,
          projects: [
            {
              id: projectId,
              role: projectRole,
              retentionDays: null,
              deletedAt: null,
              hasTraces: false,
              name: projectName,
              metadata: {},
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ],
      featureFlags: {
        excludeClickhouseRead: false,
        templateFlag: false,
        inAppAgent: false,
        v4BetaToggleVisible: false,
        observationEvals: false,
        experimentsV4Enabled: false,
        monitors: false,
      },
      admin: false,
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: plan,
    },
  };
}

const exportInput = (projectId: string) => ({
  projectId,
  name: "audit log export attempt",
  query: {
    tableName: BatchTableNames.AuditLogs,
    filter: null,
    orderBy: null,
  },
  format: BatchExportFileFormat.CSV,
});

describe("batchExport tRPC – audit_logs table authorization", () => {
  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: { id: { in: __orgIds } },
    });
  });

  it("blocks a MEMBER (no auditLogs:read) from exporting audit_logs even on cloud:team plan", async () => {
    const { project, org } = await createOrgProjectAndApiKey();
    __orgIds.push(org.id);

    const caller = appRouter.createCaller({
      ...createInnerTRPCContext({
        session: makeSession(org.id, org.name, project.id, project.name, {
          plan: "cloud:team",
          projectRole: "MEMBER",
        }),
        headers: {},
      }),
      prisma,
    });

    await expect(
      caller.batchExport.create(exportInput(project.id)),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks an OWNER on cloud:hobby (no audit-logs entitlement) from exporting audit_logs", async () => {
    const { project, org } = await createOrgProjectAndApiKey();
    __orgIds.push(org.id);

    const caller = appRouter.createCaller({
      ...createInnerTRPCContext({
        session: makeSession(org.id, org.name, project.id, project.name, {
          plan: "cloud:hobby",
          projectRole: "OWNER",
        }),
        headers: {},
      }),
      prisma,
    });

    await expect(
      caller.batchExport.create(exportInput(project.id)),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it.each<[Plan, Role]>([
    ["cloud:team", "OWNER"],
    ["cloud:team", "ADMIN"],
    ["self-hosted:enterprise", "OWNER"],
  ])(
    "allows plan=%s role=%s (both entitlement and auditLogs:read) to export audit_logs",
    async (plan, projectRole) => {
      const { project, org } = await createOrgProjectAndApiKey();
      __orgIds.push(org.id);

      const caller = appRouter.createCaller({
        ...createInnerTRPCContext({
          session: makeSession(org.id, org.name, project.id, project.name, {
            plan,
            projectRole,
          }),
          headers: {},
        }),
        prisma,
      });

      await caller.batchExport.create(exportInput(project.id));

      const job = await prisma.batchExport.findFirst({
        where: { projectId: project.id, name: "audit log export attempt" },
      });
      expect(job).not.toBeNull();
      expect(job?.query).toMatchObject({ tableName: "audit_logs" });
    },
  );
});

describe("batchExport tRPC – useEventsTable snapshot", () => {
  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: { id: { in: __orgIds } },
    });
  });

  const sessionsExportInput = (projectId: string, name: string) => ({
    projectId,
    name,
    query: {
      tableName: BatchTableNames.Sessions,
      filter: null,
      orderBy: null,
    },
    format: BatchExportFileFormat.CSV,
  });

  it("snapshots useEventsTable=true into the persisted query when v4 beta is enabled", async () => {
    const { project, org } = await createOrgProjectAndApiKey();
    __orgIds.push(org.id);

    const caller = appRouter.createCaller({
      ...createInnerTRPCContext({
        session: makeSession(org.id, org.name, project.id, project.name, {
          projectRole: "OWNER",
          v4BetaEnabled: true,
        }),
        headers: {},
      }),
      prisma,
    });

    await caller.batchExport.create(
      sessionsExportInput(project.id, "sessions export v4 on"),
    );

    const job = await prisma.batchExport.findFirst({
      where: { projectId: project.id, name: "sessions export v4 on" },
    });
    expect(job?.query).toMatchObject({
      tableName: "sessions",
      useEventsTable: true,
    });
  });

  it("snapshots useEventsTable=false when v4 beta is disabled", async () => {
    const { project, org } = await createOrgProjectAndApiKey();
    __orgIds.push(org.id);

    const caller = appRouter.createCaller({
      ...createInnerTRPCContext({
        session: makeSession(org.id, org.name, project.id, project.name, {
          projectRole: "OWNER",
          v4BetaEnabled: false,
        }),
        headers: {},
      }),
      prisma,
    });

    await caller.batchExport.create(
      sessionsExportInput(project.id, "sessions export v4 off"),
    );

    const job = await prisma.batchExport.findFirst({
      where: { projectId: project.id, name: "sessions export v4 off" },
    });
    expect(job?.query).toMatchObject({
      tableName: "sessions",
      useEventsTable: false,
    });
  });
});
