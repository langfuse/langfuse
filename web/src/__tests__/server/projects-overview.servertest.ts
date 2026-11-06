import { randomUUID } from "crypto";
import { prisma, type Role } from "@langfuse/shared/src/db";
import { createTrace, createTracesCh } from "@langfuse/shared/src/server";
import type { Session } from "next-auth";
import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

const setUp = async () => {
  const org = await prisma.organization.create({
    data: {
      id: randomUUID(),
      name: randomUUID(),
      cloudCurrentCycleUsage: 46_000,
    },
  });
  const [busy, empty] = await Promise.all(
    ["busy", "empty"].map((name) =>
      prisma.project.create({
        data: { id: randomUUID(), name, orgId: org.id },
      }),
    ),
  );
  const lastTraceAt = Date.now() - 60_000;
  await createTracesCh([
    createTrace({
      project_id: busy.id,
      timestamp: lastTraceAt,
      created_at: lastTraceAt,
    }),
    createTrace({ project_id: busy.id, timestamp: lastTraceAt - 60_000 }),
  ]);
  const user = await prisma.user.create({
    data: { id: randomUUID(), email: `${randomUUID()}@example.com` },
  });
  await prisma.organizationMembership.create({
    data: { orgId: org.id, userId: user.id, role: "OWNER" },
  });
  return { orgId: org.id, userId: user.id, busy, empty, lastTraceAt };
};

const callerWithOrgRole = ({
  orgId,
  userId,
  projects,
  role,
}: {
  orgId: string;
  userId: string;
  projects: { id: string; name: string }[];
  role: Role;
}) => {
  const session: Session = {
    expires: "1",
    user: {
      id: userId,
      canCreateOrganizations: false,
      name: "Demo User",
      admin: false,
      organizations: [
        {
          id: orgId,
          name: "Org",
          role,
          plan: "cloud:hobby",
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: false,
          aiTelemetryEnabled: false,
          projects: projects.map((project) => ({
            id: project.id,
            name: project.name,
            role,
            deletedAt: null,
            retentionDays: null,
            hasTraces: true,
            metadata: {},
            createdAt: new Date().toISOString(),
          })),
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

describe("projectsOverview.byOrganization", () => {
  it("gives owners the usage meter against the hobby limit and per-project units", async () => {
    const { orgId, userId, busy, empty, lastTraceAt } = await setUp();

    const result = await callerWithOrgRole({
      orgId,
      userId,
      projects: [busy, empty],
      role: "OWNER",
    }).projectsOverview.byOrganization({ orgId });

    expect(result.projects).toEqual([
      {
        projectId: busy.id,
        lastTraceAt: new Date(lastTraceAt),
        periodUnits: 2,
      },
      { projectId: empty.id, lastTraceAt: null, periodUnits: 0 },
    ]);
    expect(result.usage).toMatchObject({
      units: 46_000,
      limit: 50_000,
      periodKind: "billing-cycle",
      isIngestionBlocked: false,
    });
    expect(result.memberCount).toBe(1);
  });

  // Usage and team size are not visible to members and viewers elsewhere
  // either; the overview must not become a way around that.
  it("leaves usage and members out for viewers but keeps activity", async () => {
    const { orgId, userId, busy, empty, lastTraceAt } = await setUp();

    const result = await callerWithOrgRole({
      orgId,
      userId,
      projects: [busy, empty],
      role: "VIEWER",
    }).projectsOverview.byOrganization({ orgId });

    expect(result.projects[0]).toEqual({
      projectId: busy.id,
      lastTraceAt: new Date(lastTraceAt),
      periodUnits: null,
    });
    expect(result.usage).toBeNull();
    expect(result.memberCount).toBeNull();
  });
});
