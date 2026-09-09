import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma, type Role } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import type { Session } from "next-auth";
import {
  BatchExportFileFormat,
  BatchExportStatus,
  BatchTableNames,
  type Plan,
} from "@langfuse/shared";

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
          aiTelemetryEnabled: false,
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
        searchBar: false,
        v4BetaToggleVisible: false,
        observationEvals: false,
        experimentsV4Enabled: false,
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

  it("blocks a MEMBER (no projectAuditLogs:read) from exporting audit_logs even on cloud:team plan", async () => {
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
    "allows plan=%s role=%s (both entitlement and projectAuditLogs:read) to export audit_logs",
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

const seedCompletedExport = (opts: {
  projectId: string;
  name: string;
  tableName: BatchTableNames;
}) =>
  prisma.batchExport.create({
    data: {
      projectId: opts.projectId,
      userId: "user-test",
      status: BatchExportStatus.COMPLETED,
      name: opts.name,
      format: BatchExportFileFormat.CSV,
      // Non-URL so downloadUrl cannot parse an object key and must fall back
      // to the stored value instead of signing against the test bucket.
      url: "not-a-valid-url",
      finishedAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      query: {
        tableName: opts.tableName,
        filter: null,
        orderBy: null,
      },
    },
  });

describe("batchExport tRPC – audit_logs download and list authorization", () => {
  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: { id: { in: __orgIds } },
    });
  });

  it("blocks a MEMBER from downloadUrl of an OWNER-created audit_logs export", async () => {
    const { project, org } = await createOrgProjectAndApiKey();
    __orgIds.push(org.id);

    const exportJob = await seedCompletedExport({
      projectId: project.id,
      name: "owner audit export",
      tableName: BatchTableNames.AuditLogs,
    });

    const memberCaller = appRouter.createCaller({
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
      memberCaller.batchExport.downloadUrl({
        projectId: project.id,
        batchExportId: exportJob.id,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks an OWNER on cloud:hobby from downloadUrl of an audit_logs export", async () => {
    const { project, org } = await createOrgProjectAndApiKey();
    __orgIds.push(org.id);

    const exportJob = await seedCompletedExport({
      projectId: project.id,
      name: "hobby audit export",
      tableName: BatchTableNames.AuditLogs,
    });

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
      caller.batchExport.downloadUrl({
        projectId: project.id,
        batchExportId: exportJob.id,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows an OWNER with audit-logs entitlement to downloadUrl an audit_logs export", async () => {
    const { project, org } = await createOrgProjectAndApiKey();
    __orgIds.push(org.id);

    const exportJob = await seedCompletedExport({
      projectId: project.id,
      name: "entitled audit export",
      tableName: BatchTableNames.AuditLogs,
    });

    const caller = appRouter.createCaller({
      ...createInnerTRPCContext({
        session: makeSession(org.id, org.name, project.id, project.name, {
          plan: "cloud:team",
          projectRole: "OWNER",
        }),
        headers: {},
      }),
      prisma,
    });

    await expect(
      caller.batchExport.downloadUrl({
        projectId: project.id,
        batchExportId: exportJob.id,
      }),
    ).resolves.toEqual({ url: "not-a-valid-url" });
  });

  it("still allows a MEMBER to downloadUrl a traces export", async () => {
    const { project, org } = await createOrgProjectAndApiKey();
    __orgIds.push(org.id);

    const exportJob = await seedCompletedExport({
      projectId: project.id,
      name: "traces export",
      tableName: BatchTableNames.Traces,
    });

    const memberCaller = appRouter.createCaller({
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
      memberCaller.batchExport.downloadUrl({
        projectId: project.id,
        batchExportId: exportJob.id,
      }),
    ).resolves.toEqual({ url: "not-a-valid-url" });
  });

  it("hides audit_logs exports from all for a MEMBER without projectAuditLogs:read", async () => {
    const { project, org } = await createOrgProjectAndApiKey();
    __orgIds.push(org.id);

    await seedCompletedExport({
      projectId: project.id,
      name: "audit export hidden",
      tableName: BatchTableNames.AuditLogs,
    });
    await seedCompletedExport({
      projectId: project.id,
      name: "traces export visible",
      tableName: BatchTableNames.Traces,
    });

    const memberCaller = appRouter.createCaller({
      ...createInnerTRPCContext({
        session: makeSession(org.id, org.name, project.id, project.name, {
          plan: "cloud:team",
          projectRole: "MEMBER",
        }),
        headers: {},
      }),
      prisma,
    });

    const result = await memberCaller.batchExport.all({
      projectId: project.id,
      page: 0,
      limit: 50,
    });

    expect(result.exports.map((e) => e.name)).toEqual([
      "traces export visible",
    ]);
    expect(result.totalCount).toBe(1);
  });

  it("includes audit_logs exports in all for an OWNER with entitlement", async () => {
    const { project, org } = await createOrgProjectAndApiKey();
    __orgIds.push(org.id);

    await seedCompletedExport({
      projectId: project.id,
      name: "audit export listed",
      tableName: BatchTableNames.AuditLogs,
    });
    await seedCompletedExport({
      projectId: project.id,
      name: "traces export listed",
      tableName: BatchTableNames.Traces,
    });

    const caller = appRouter.createCaller({
      ...createInnerTRPCContext({
        session: makeSession(org.id, org.name, project.id, project.name, {
          plan: "cloud:team",
          projectRole: "OWNER",
        }),
        headers: {},
      }),
      prisma,
    });

    const result = await caller.batchExport.all({
      projectId: project.id,
      page: 0,
      limit: 50,
    });

    expect(result.exports.map((e) => e.name).sort()).toEqual([
      "audit export listed",
      "traces export listed",
    ]);
    expect(result.totalCount).toBe(2);
  });
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
