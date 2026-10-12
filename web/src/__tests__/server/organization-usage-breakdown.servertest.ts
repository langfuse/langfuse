import { randomUUID } from "crypto";
import { prisma, type Role } from "@langfuse/shared/src/db";
import {
  createObservation,
  createObservationsCh,
  createScoresCh,
  createTrace,
  createTraceScore,
  createTracesCh,
} from "@langfuse/shared/src/server";
import type { Session } from "next-auth";
import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { getOrgUsageBreakdown } from "@/src/features/organization-usage/server/usageBreakdown";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

const createOrgWithProjects = async (
  projects: { name: string; deleted?: boolean }[],
) => {
  const org = await prisma.organization.create({
    data: { id: randomUUID(), name: randomUUID() },
  });
  const created = await Promise.all(
    projects.map((project) =>
      prisma.project.create({
        data: {
          id: randomUUID(),
          name: project.name,
          orgId: org.id,
          deletedAt: project.deleted ? new Date() : null,
        },
      }),
    ),
  );
  return { orgId: org.id, projectIds: created.map((project) => project.id) };
};

const callerWithOrgRole = (orgId: string, role: Role) => {
  const session: Session = {
    expires: "1",
    user: {
      id: "user-1",
      canCreateOrganizations: false,
      name: "Demo User",
      admin: false,
      organizations: [
        {
          id: orgId,
          name: "Org",
          role,
          plan: "oss",
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: false,
          aiTelemetryEnabled: false,
          projects: [],
        },
      ],
      featureFlags: testFeatureFlags(),
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: "oss",
    },
  };
  const ctx = createInnerTRPCContext({ session, headers: {} });
  return appRouter.createCaller({ ...ctx, prisma });
};

const sortRows = <T extends { bucket: string; projectId: string }>(rows: T[]) =>
  [...rows].sort(
    (a, b) =>
      a.bucket.localeCompare(b.bucket) ||
      a.projectId.localeCompare(b.projectId),
  );

describe("getOrgUsageBreakdown", () => {
  it("counts billable units of the org's live projects by created_at", async () => {
    const {
      orgId,
      projectIds: [alpha, beta, deleted],
    } = await createOrgWithProjects([
      { name: "alpha" },
      { name: "beta" },
      { name: "gone", deleted: true },
    ]);
    const {
      projectIds: [otherOrgProject],
    } = await createOrgWithProjects([{ name: "other" }]);

    await createTracesCh([
      // Billed when ingested, not when the trace happened
      createTrace({
        project_id: alpha,
        timestamp: new Date("2026-07-01T10:00:00Z"),
        created_at: new Date("2026-08-03T10:00:00Z"),
      }),
      // `to` is exclusive
      createTrace({
        project_id: alpha,
        created_at: new Date("2026-08-06T00:00:00Z"),
      }),
      createTrace({
        project_id: deleted,
        created_at: new Date("2026-08-03T10:00:00Z"),
      }),
      createTrace({
        project_id: otherOrgProject,
        created_at: new Date("2026-08-03T10:00:00Z"),
      }),
    ]);
    await createObservationsCh([
      createObservation({
        project_id: alpha,
        created_at: new Date("2026-08-04T01:00:00Z"),
      }),
      createObservation({
        project_id: alpha,
        created_at: new Date("2026-08-04T23:59:00Z"),
      }),
    ]);
    await createScoresCh([
      createTraceScore({
        project_id: beta,
        created_at: new Date("2026-08-04T12:00:00Z"),
      }),
      createTraceScore({
        project_id: beta,
        data_type: "CORRECTION",
        created_at: new Date("2026-08-04T12:00:00Z"),
      }),
    ]);

    const result = await getOrgUsageBreakdown({
      prisma,
      orgId,
      from: new Date("2026-08-03T00:00:00Z"),
      to: new Date("2026-08-06T00:00:00Z"),
    });

    expect(result.granularity).toBe("day");
    expect(result.buckets).toEqual([
      "2026-08-03T00:00:00.000Z",
      "2026-08-04T00:00:00.000Z",
      "2026-08-05T00:00:00.000Z",
    ]);
    expect(result.projects).toEqual([
      { id: alpha, name: "alpha" },
      { id: beta, name: "beta" },
    ]);
    expect(sortRows(result.rows)).toEqual(
      sortRows([
        {
          bucket: "2026-08-03T00:00:00.000Z",
          projectId: alpha,
          unitType: "traces",
          count: 1,
        },
        {
          bucket: "2026-08-04T00:00:00.000Z",
          projectId: alpha,
          unitType: "observations",
          count: 2,
        },
        {
          bucket: "2026-08-04T00:00:00.000Z",
          projectId: beta,
          unitType: "scores",
          count: 1,
        },
      ]),
    );
  });

  it("puts ClickHouse week buckets on the generated Monday axis", async () => {
    const {
      orgId,
      projectIds: [projectId],
    } = await createOrgWithProjects([{ name: "weekly" }]);

    await createTracesCh([
      // Wednesday
      createTrace({
        project_id: projectId,
        created_at: new Date("2026-06-10T15:00:00Z"),
      }),
    ]);

    const result = await getOrgUsageBreakdown({
      prisma,
      orgId,
      from: new Date("2026-05-01T00:00:00Z"),
      to: new Date("2026-07-15T00:00:00Z"),
    });

    expect(result.granularity).toBe("week");
    expect(result.buckets[0]).toBe("2026-04-27T00:00:00.000Z");
    expect(result.rows).toEqual([
      {
        bucket: "2026-06-08T00:00:00.000Z",
        projectId,
        unitType: "traces",
        count: 1,
      },
    ]);
    expect(result.buckets).toContain(result.rows[0].bucket);
  });
});

describe("organizationUsage.breakdown", () => {
  // No entitlement gates this endpoint, so the org role is the only thing
  // keeping members from seeing usage of projects they cannot access.
  it("is readable by org admins but not by members", async () => {
    const { orgId } = await createOrgWithProjects([{ name: "admin-check" }]);
    const input = {
      orgId,
      from: new Date("2026-08-01T00:00:00Z"),
      to: new Date("2026-08-02T00:00:00Z"),
    };

    await expect(
      callerWithOrgRole(orgId, "ADMIN").organizationUsage.breakdown(input),
    ).resolves.toMatchObject({ granularity: "hour" });
    await expect(
      callerWithOrgRole(orgId, "MEMBER").organizationUsage.breakdown(input),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
