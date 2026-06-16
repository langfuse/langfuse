import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma } from "@langfuse/shared/src/db";
import { type Plan, Role } from "@langfuse/shared";
import type { Session } from "next-auth";
import { v4 as uuidv4 } from "uuid";

async function createOrgAndProject() {
  const orgId = uuidv4();
  const userId = uuidv4();
  const projectId = uuidv4();

  await prisma.organization.create({
    data: { id: orgId, name: `Retention Org ${orgId.slice(0, 8)}` },
  });
  await prisma.project.create({
    data: {
      id: projectId,
      name: `Retention Project ${projectId.slice(0, 8)}`,
      orgId,
    },
  });
  const user = await prisma.user.create({
    data: {
      id: userId,
      email: `retention-${userId.slice(0, 8)}@test.com`,
      name: "Test User",
    },
  });
  await prisma.organizationMembership.create({
    data: { userId: user.id, orgId, role: Role.OWNER },
  });

  return { orgId, projectId, user };
}

function makeCaller({
  userId,
  orgId,
  projectId,
  plan,
  role = Role.OWNER,
}: {
  userId: string;
  orgId: string;
  projectId: string;
  plan: Plan;
  role?: Role;
}) {
  const session: Session = {
    expires: "1",
    user: {
      id: userId,
      canCreateOrganizations: true,
      name: "Test User",
      email: "retention@test.com",
      organizations: [
        {
          id: orgId,
          name: "Test Organization",
          role,
          plan,
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: false,
          aiTelemetryEnabled: true,
          projects: [
            {
              id: projectId,
              role,
              retentionDays: 0,
              deletedAt: null,
              name: "Test Project",
              metadata: {},
            },
          ],
        },
      ],
      featureFlags: {
        excludeClickhouseRead: false,
        templateFlag: true,
        v4BetaToggleVisible: false,
        observationEvals: false,
        experimentsV4Enabled: false,
      },
      admin: false,
    },
    environment: {} as any,
  };
  const ctx = createInnerTRPCContext({ session, headers: {} });
  return appRouter.createCaller({ ...ctx, prisma });
}

describe("projectsRouter.setRetention entitlement enforcement", () => {
  it("rejects when the project's plan lacks the data-retention entitlement", async () => {
    const { orgId, projectId, user } = await createOrgAndProject();
    const caller = makeCaller({
      userId: user.id,
      orgId,
      projectId,
      plan: "cloud:hobby", // no data-retention entitlement
    });

    await expect(
      caller.projects.setRetention({ projectId, retention: 3 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // The destructive retention setting must not have been persisted.
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });
    expect(project?.retentionDays).toBeNull();
  });

  it("allows setting retention when the plan has the data-retention entitlement", async () => {
    const { orgId, projectId, user } = await createOrgAndProject();
    const caller = makeCaller({
      userId: user.id,
      orgId,
      projectId,
      plan: "cloud:pro", // has data-retention entitlement
    });

    await expect(
      caller.projects.setRetention({ projectId, retention: 5 }),
    ).resolves.toBe(true);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });
    expect(project?.retentionDays).toBe(5);
  });
});
