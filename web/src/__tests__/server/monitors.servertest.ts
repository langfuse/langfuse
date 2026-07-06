import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { entitlementAccess } from "@/src/features/entitlements/constants/entitlements";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import type { Session } from "next-auth";
import { v4 } from "uuid";
import { type Role } from "@langfuse/shared/src/db";
import {
  MonitorNoDataModeSchema,
  MonitorSeveritySchema,
  MonitorStatusSchema,
  MonitorThresholdOperatorSchema,
} from "@langfuse/shared/monitors";

type RoleName = keyof typeof Role;

const orgIds: string[] = [];

const buildSession = (params: {
  userId: string;
  orgId: string;
  orgName: string;
  projectId: string;
  projectName: string;
  projectRole: RoleName;
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
    },
    admin: false,
  },
  environment: {
    enableExperimentalFeatures: false,
    selfHostedInstancePlan: "cloud:hobby",
  },
});

const prepare = async (overrides?: { projectRole?: RoleName }) => {
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
  thresholdOperator: MonitorThresholdOperatorSchema.enum.GT,
  alertThreshold: 100,
  warningThreshold: null,
  noData: { mode: MonitorNoDataModeSchema.enum.SHOW_NO_DATA },
  renotify: { mode: "OFF" as const },
  status: MonitorStatusSchema.enum.ACTIVE,
  name: "High error rate",
  tags: [],
  triggerIds: ["trig_01"],
});

const seedMonitors = async (
  caller: ReturnType<typeof appRouter.createCaller>,
  projectId: string,
  count: number,
) => {
  for (let i = 0; i < count; i++) {
    await caller.monitors.create({
      ...validMonitorInput(projectId),
      name: `Seeded monitor ${i + 1}`,
    });
  }
};

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
        page: 1,
        limit: 50,
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
        data: { status: MonitorStatusSchema.enum.ERROR_BAD_QUERY },
      });

      const fetched = await caller.monitors.get({
        projectId: project.id,
        id: created.id,
      });
      expect(fetched.status).toBe(MonitorStatusSchema.enum.ERROR_BAD_QUERY);
    });
  });

  describe("RBAC", () => {
    it("rejects monitors.create from VIEWER role with FORBIDDEN", async () => {
      const { project, caller } = await prepare({ projectRole: "VIEWER" });

      await expect(
        caller.monitors.create(validMonitorInput(project.id)),
      ).rejects.toThrow(/access/i);
    });

    it("allows monitors.create from MEMBER role (monitors:CUD)", async () => {
      const { project, caller } = await prepare({ projectRole: "MEMBER" });

      const created = await caller.monitors.create(
        validMonitorInput(project.id),
      );
      expect(created.id).toBeDefined();
    });

    it("allows monitors.all from VIEWER role (read-only scope)", async () => {
      const { project, caller } = await prepare({ projectRole: "VIEWER" });

      const list = await caller.monitors.all({
        projectId: project.id,
        orderBy: null,
        page: 1,
        limit: 50,
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
          thresholdOperator: MonitorThresholdOperatorSchema.enum.GT,
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

  describe("list filter sidebar", () => {
    it("filters by severity (any of)", async () => {
      const { project, caller } = await prepare();
      const a = await caller.monitors.create({
        ...validMonitorInput(project.id),
        name: "A",
      });
      await caller.monitors.create({
        ...validMonitorInput(project.id),
        name: "B",
      });
      await prisma.monitor.update({
        where: { id: a.id },
        data: { severity: MonitorSeveritySchema.enum.ALERT },
      });

      const result = await caller.monitors.all({
        projectId: project.id,
        orderBy: null,
        page: 1,
        limit: 50,
        filter: [
          {
            type: "stringOptions",
            column: "severity",
            operator: "any of",
            value: [MonitorSeveritySchema.enum.ALERT],
          },
        ],
      });
      expect(result.totalCount).toBe(1);
      expect(result.monitors.map((m) => m.name)).toEqual(["A"]);
    });

    it("filters by severity (none of PAUSED) hides paused monitors", async () => {
      // Pausing via the service writes severity = PAUSED; a severity-filter
      // with `none of [PAUSED]` then naturally excludes those rows.
      const { project, caller } = await prepare();
      const a = await caller.monitors.create({
        ...validMonitorInput(project.id),
        name: "A",
      });
      await caller.monitors.create({
        ...validMonitorInput(project.id),
        name: "B",
      });
      await caller.monitors.update({
        ...validMonitorInput(project.id),
        id: a.id,
        status: MonitorStatusSchema.enum.PAUSED,
      });

      const result = await caller.monitors.all({
        projectId: project.id,
        orderBy: null,
        page: 1,
        limit: 50,
        filter: [
          {
            type: "stringOptions",
            column: "severity",
            operator: "none of",
            value: [MonitorSeveritySchema.enum.PAUSED],
          },
        ],
      });
      expect(result.totalCount).toBe(1);
      expect(result.monitors.map((m) => m.name)).toEqual(["B"]);
    });

    it("flipping status ACTIVE → PAUSED via update writes severity = PAUSED", async () => {
      const { project, caller } = await prepare();
      const created = await caller.monitors.create(
        validMonitorInput(project.id),
      );
      expect(created.severity).toBe(MonitorSeveritySchema.enum.UNKNOWN);

      const paused = await caller.monitors.update({
        ...validMonitorInput(project.id),
        id: created.id,
        status: MonitorStatusSchema.enum.PAUSED,
      });
      expect(paused.status).toBe(MonitorStatusSchema.enum.PAUSED);
      expect(paused.severity).toBe(MonitorSeveritySchema.enum.PAUSED);
    });

    it("flipping status PAUSED → ACTIVE via update resets severity to UNKNOWN", async () => {
      const { project, caller } = await prepare();
      const created = await caller.monitors.create({
        ...validMonitorInput(project.id),
        status: MonitorStatusSchema.enum.PAUSED,
      });
      expect(created.severity).toBe(MonitorSeveritySchema.enum.PAUSED);

      const resumed = await caller.monitors.update({
        ...validMonitorInput(project.id),
        id: created.id,
        status: MonitorStatusSchema.enum.ACTIVE,
      });
      expect(resumed.status).toBe(MonitorStatusSchema.enum.ACTIVE);
      expect(resumed.severity).toBe(MonitorSeveritySchema.enum.UNKNOWN);
    });

    it("filters by tags (any of)", async () => {
      const { project, caller } = await prepare();
      await caller.monitors.create({
        ...validMonitorInput(project.id),
        name: "Tagged",
        tags: ["prod", "latency"],
      });
      await caller.monitors.create({
        ...validMonitorInput(project.id),
        name: "Untagged",
      });

      const result = await caller.monitors.all({
        projectId: project.id,
        orderBy: null,
        page: 1,
        limit: 50,
        filter: [
          {
            type: "arrayOptions",
            column: "tags",
            operator: "any of",
            value: ["prod"],
          },
        ],
      });
      expect(result.totalCount).toBe(1);
      expect(result.monitors.map((m) => m.name)).toEqual(["Tagged"]);
    });

    it("filterOptions returns distinct tags for the project", async () => {
      const { project, caller } = await prepare();
      await caller.monitors.create({
        ...validMonitorInput(project.id),
        name: "A",
        tags: ["prod", "latency"],
      });
      await caller.monitors.create({
        ...validMonitorInput(project.id),
        name: "B",
        tags: ["prod"],
      });

      const opts = await caller.monitors.getFilterOptions({
        projectId: project.id,
      });
      expect(opts.tags.map((t) => t.value).sort()).toEqual(["latency", "prod"]);
    });
  });

  describe("entitlement limit", () => {
    const monitorLimit =
      entitlementAccess["cloud:hobby"].entitlementLimits["monitor-count"];
    if (typeof monitorLimit !== "number") {
      throw new Error(
        "expected cloud:hobby monitor-count limit to be a number",
      );
    }

    it("rejects monitors.create when org is at the monitor-count limit", async () => {
      const { project, caller } = await prepare();
      await seedMonitors(caller, project.id, monitorLimit);

      await expect(
        caller.monitors.create({
          ...validMonitorInput(project.id),
          name: `Monitor ${monitorLimit + 1}`,
        }),
      ).rejects.toThrow(/monitor-count/i);
    });

    it("counts monitors with non-ACTIVE status toward the limit", async () => {
      const { project, caller } = await prepare();
      await seedMonitors(caller, project.id, monitorLimit);

      const seeded = await prisma.monitor.findMany({
        where: { projectId: project.id },
        take: 2,
      });
      await prisma.monitor.update({
        where: { id: seeded[0].id },
        data: { status: MonitorStatusSchema.enum.PAUSED },
      });
      await prisma.monitor.update({
        where: { id: seeded[1].id },
        data: { status: MonitorStatusSchema.enum.ERROR_BAD_QUERY },
      });

      await expect(
        caller.monitors.create({
          ...validMonitorInput(project.id),
          name: `Monitor ${monitorLimit + 1}`,
        }),
      ).rejects.toThrow(/monitor-count/i);
    });

    it("allows monitors.update when at the limit", async () => {
      const { project, caller } = await prepare();
      await seedMonitors(caller, project.id, monitorLimit);

      const [first] = await prisma.monitor.findMany({
        where: { projectId: project.id },
        take: 1,
      });

      const updated = await caller.monitors.update({
        ...validMonitorInput(project.id),
        id: first.id,
        name: "Renamed at limit",
      });
      expect(updated.name).toBe("Renamed at limit");
    });

    it("monitors.count is scoped to the caller's org", async () => {
      // Two independent orgs prove the count is org-scoped, not global.
      const orgA = await prepare();
      const orgB = await prepare();

      await seedMonitors(orgA.caller, orgA.project.id, 3);
      await seedMonitors(orgB.caller, orgB.project.id, 2);

      const resultA = await orgA.caller.monitors.count({
        projectId: orgA.project.id,
      });
      const resultB = await orgB.caller.monitors.count({
        projectId: orgB.project.id,
      });

      expect(resultA.count).toBe(3);
      expect(resultB.count).toBe(2);
    });
  });

  describe("hasAny", () => {
    it("returns false on an empty project", async () => {
      const { project, caller } = await prepare();
      const result = await caller.monitors.hasAny({ projectId: project.id });
      expect(result).toBe(false);
    });

    it("returns true once a monitor has been created", async () => {
      const { project, caller } = await prepare();
      await caller.monitors.create(validMonitorInput(project.id));
      const result = await caller.monitors.hasAny({ projectId: project.id });
      expect(result).toBe(true);
    });

    it("is project-scoped, not org-scoped", async () => {
      // Two projects in the same org: a monitor in project A must not flip
      // hasAny for project B, which is the read on which the empty-state
      // splash is gated.
      const {
        org,
        project: projectA,
        session: sessionA,
        caller: callerA,
      } = await prepare();

      const projectB = await prisma.project.create({
        data: {
          name: `sibling-${v4().substring(0, 8)}`,
          orgId: org.id,
        },
      });

      // Re-issue the session with projectB added so the caller has RBAC
      // access to read it; the procedure itself enforces project-scoped
      // RBAC, not org-scoped.
      const sessionUser = sessionA.user!;
      const orgA = sessionUser.organizations[0];
      const sessionAB = {
        ...sessionA,
        user: {
          ...sessionUser,
          organizations: [
            {
              ...orgA,
              projects: [
                ...orgA.projects,
                {
                  id: projectB.id,
                  role: "ADMIN",
                  retentionDays: 30,
                  deletedAt: null,
                  name: projectB.name,
                  metadata: {},
                  hasTraces: false,
                  createdAt: new Date().toISOString(),
                },
              ],
            },
          ],
        },
      } as Session;
      const ctxAB = createInnerTRPCContext({ session: sessionAB, headers: {} });
      const callerAB = appRouter.createCaller({ ...ctxAB, prisma });

      await callerA.monitors.create(validMonitorInput(projectA.id));

      const hasAnyA = await callerAB.monitors.hasAny({
        projectId: projectA.id,
      });
      const hasAnyB = await callerAB.monitors.hasAny({
        projectId: projectB.id,
      });

      expect(hasAnyA).toBe(true);
      expect(hasAnyB).toBe(false);
    });
  });
});
