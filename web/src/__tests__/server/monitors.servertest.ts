import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import type { Session } from "next-auth";
import { v4 } from "uuid";
import { type Role } from "@langfuse/shared/src/db";

type RoleName = keyof typeof Role;

const orgIds: string[] = [];

const buildSession = (params: {
  userId: string;
  orgId: string;
  orgName: string;
  projectId: string;
  projectName: string;
  projectRole: RoleName;
  monitorsFlag?: boolean;
  admin?: boolean;
  enableExperimentalFeatures?: boolean;
}): Session => ({
  expires: "1",
  user: {
    id: params.userId,
    canCreateOrganizations: true,
    name: "Demo User",
    organizations: [
      {
        id: params.orgId,
        name: params.orgName,
        role: "OWNER",
        plan: "cloud:hobby",
        cloudConfig: undefined,
        metadata: {},
        projects: [
          {
            id: params.projectId,
            role: params.projectRole,
            retentionDays: 30,
            deletedAt: null,
            name: params.projectName,
            metadata: {},
          },
        ],
      },
    ],
    featureFlags: {
      inAppAgent: false,
      templateFlag: false,
      excludeClickhouseRead: false,
      v4BetaToggleVisible: false,
      observationEvals: false,
      experimentsV4Enabled: false,
      monitors: params.monitorsFlag ?? true,
    },
    admin: params.admin ?? false,
  },
  environment: {
    enableExperimentalFeatures: params.enableExperimentalFeatures ?? false,
    selfHostedInstancePlan: "cloud:hobby",
  },
});

const prepare = async (overrides?: {
  projectRole?: RoleName;
  monitorsFlag?: boolean;
  admin?: boolean;
  enableExperimentalFeatures?: boolean;
}) => {
  const { project, org } = await createOrgProjectAndApiKey();
  orgIds.push(org.id);
  const user = await prisma.user.create({
    data: {
      id: v4(),
      email: `monitor-user-${v4().substring(0, 8)}@test.com`,
      name: "Monitor User",
    },
  });

  const session = buildSession({
    userId: user.id,
    orgId: org.id,
    orgName: org.name,
    projectId: project.id,
    projectName: project.name,
    projectRole: overrides?.projectRole ?? "ADMIN",
    monitorsFlag: overrides?.monitorsFlag,
    admin: overrides?.admin,
    enableExperimentalFeatures: overrides?.enableExperimentalFeatures,
  });

  const ctx = createInnerTRPCContext({ session, headers: {} });
  const caller = appRouter.createCaller({ ...ctx, prisma });

  return { project, org, session, caller };
};

const validMonitorInput = (projectId: string) => ({
  projectId,
  view: "observations" as const,
  filters: [],
  metric: { measure: "count", aggregation: "count" as const },
  window: "5m" as const,
  thresholdOperator: "gt" as const,
  alertThreshold: 100,
  warningThreshold: null,
  noData: { mode: "SILENT" as const },
  renotify: { mode: "OFF" as const },
  status: "active" as const,
  name: "High error rate",
  tags: [],
});

describe("monitors trpc", () => {
  afterAll(async () => {
    if (orgIds.length > 0) {
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    }
  });

  describe("create / get / all", () => {
    it("creates a monitor and round-trips through get + all", async () => {
      const { project, caller } = await prepare();

      const created = await caller.monitors.create(
        validMonitorInput(project.id),
      );
      expect(created.id).toBeDefined();
      expect(created.name).toBe("High error rate");
      expect(created.projectId).toBe(project.id);

      const fetched = await caller.monitors.get({
        projectId: project.id,
        id: created.id,
      });
      expect(fetched.id).toBe(created.id);

      const list = await caller.monitors.all({
        projectId: project.id,
        orderBy: null,
      });
      expect(list.totalCount).toBe(1);
      expect(list.monitors.map((m) => m.id)).toContain(created.id);
    });

    it("returns ERROR_BAD_QUERY monitors verbatim (scheduler-owned status survives a read)", async () => {
      const { project, caller } = await prepare();

      // Simulate the worker flagging a previously-valid monitor as bad after
      // its underlying measure was removed. The API can't write this status
      // directly, but reads must surface it so the UI can show the failure.
      const created = await caller.monitors.create(
        validMonitorInput(project.id),
      );
      await prisma.monitor.update({
        where: { id: created.id },
        data: { status: "ERROR_BAD_QUERY" },
      });

      const fetched = await caller.monitors.get({
        projectId: project.id,
        id: created.id,
      });
      expect(fetched.status).toBe("error-bad-query");
    });
  });

  describe("RBAC", () => {
    it("rejects monitors.create from VIEWER role with FORBIDDEN", async () => {
      const { project, caller } = await prepare({ projectRole: "VIEWER" });

      await expect(
        caller.monitors.create(validMonitorInput(project.id)),
      ).rejects.toThrow(/access/i);
    });

    it("allows monitors.all from VIEWER role (read-only scope)", async () => {
      const { project, caller } = await prepare({ projectRole: "VIEWER" });

      const list = await caller.monitors.all({
        projectId: project.id,
        orderBy: null,
      });
      expect(list.totalCount).toBe(0);
    });
  });

  describe("validation", () => {
    it("rejects warning >= alert ordering for gt operator", async () => {
      const { project, caller } = await prepare();

      await expect(
        caller.monitors.create({
          ...validMonitorInput(project.id),
          thresholdOperator: "gt",
          alertThreshold: 100,
          warningThreshold: 100,
        }),
      ).rejects.toThrow();
    });

    it("rejects an unknown measure", async () => {
      const { project, caller } = await prepare();

      await expect(
        caller.monitors.create({
          ...validMonitorInput(project.id),
          metric: { measure: "bogus_measure", aggregation: "count" },
        }),
      ).rejects.toThrow();
    });
  });

  describe("feature flag gating", () => {
    it("rejects monitors.create when the flag is off, user is not admin, experimental is off", async () => {
      const { project, caller } = await prepare({ monitorsFlag: false });
      await expect(
        caller.monitors.create(validMonitorInput(project.id)),
      ).rejects.toThrow(/monitors/i);
    });

    it("allows monitors.create when admin (overrides flag)", async () => {
      const { project, caller } = await prepare({
        monitorsFlag: false,
        admin: true,
      });
      const created = await caller.monitors.create(
        validMonitorInput(project.id),
      );
      expect(created.id).toBeDefined();
    });

    it("allows monitors.create when enableExperimentalFeatures is true (overrides flag)", async () => {
      const { project, caller } = await prepare({
        monitorsFlag: false,
        enableExperimentalFeatures: true,
      });
      const created = await caller.monitors.create(
        validMonitorInput(project.id),
      );
      expect(created.id).toBeDefined();
    });

    it("rejects monitors.all when the flag is off", async () => {
      const { project, caller } = await prepare({ monitorsFlag: false });
      await expect(
        caller.monitors.all({ projectId: project.id, orderBy: null }),
      ).rejects.toThrow(/monitors/i);
    });
  });

  describe("update / delete", () => {
    it("updates a monitor and surfaces NOT_FOUND on missing id", async () => {
      const { project, caller } = await prepare();
      const created = await caller.monitors.create(
        validMonitorInput(project.id),
      );

      const updated = await caller.monitors.update({
        ...validMonitorInput(project.id),
        id: created.id,
        name: "Renamed monitor",
      });
      expect(updated.name).toBe("Renamed monitor");

      await expect(
        caller.monitors.update({
          ...validMonitorInput(project.id),
          id: `mon_missing_${v4()}`,
        }),
      ).rejects.toThrow(/not found/i);
    });

    it("deletes a monitor and 404s on subsequent get", async () => {
      const { project, caller } = await prepare();
      const created = await caller.monitors.create(
        validMonitorInput(project.id),
      );

      await caller.monitors.delete({ projectId: project.id, id: created.id });

      await expect(
        caller.monitors.get({ projectId: project.id, id: created.id }),
      ).rejects.toThrow(/not found/i);
    });
  });
});
