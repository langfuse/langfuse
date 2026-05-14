import type { Session } from "next-auth";
import { randomUUID } from "crypto";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { createProjectMembershipsOnSignup } from "@/src/features/auth/lib/createProjectMembershipsOnSignup";
import { createProjectRoute } from "@/src/features/setup/setupRoutes";
import {
  ONBOARDING_STARTER_ORG_METADATA_KEY,
  ONBOARDING_STARTER_PROJECT_METADATA_KEY,
  buildStarterProjectMetadata,
} from "@/src/features/onboarding/lib/starterProjectMetadata";
import { prisma, Role } from "@langfuse/shared/src/db";

const makeSession = ({
  userId,
  email,
  name = "Test User",
  canCreateOrganizations = true,
  organizations = [],
}: {
  userId: string;
  email: string;
  name?: string;
  canCreateOrganizations?: boolean;
  organizations?: NonNullable<Session["user"]>["organizations"];
}) =>
  ({
    expires: "1",
    user: {
      id: userId,
      email,
      name,
      canCreateOrganizations,
      organizations,
      featureFlags: {
        excludeClickhouseRead: false,
        templateFlag: true,
      },
      admin: false,
    },
    environment: {} as Session["environment"],
  }) as Session;

describe("onboarding router", () => {
  const createdUserIds: string[] = [];
  const createdOrgIds: string[] = [];

  afterEach(async () => {
    if (createdOrgIds.length > 0) {
      await prisma.organization.deleteMany({
        where: {
          id: {
            in: createdOrgIds,
          },
        },
      });
      createdOrgIds.length = 0;
    }

    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: {
          id: {
            in: createdUserIds,
          },
        },
      });
      createdUserIds.length = 0;
    }
  });

  it("resolves the starter org and project provisioned for first-time users", async () => {
    const userId = randomUUID();
    const email = `starter-${userId}@example.com`;
    createdUserIds.push(userId);

    const user = await prisma.user.create({
      data: {
        id: userId,
        email,
        name: "Taylor Test",
      },
    });

    await createProjectMembershipsOnSignup(user, {
      userWasJustCreated: true,
    });

    const caller = appRouter.createCaller({
      ...createInnerTRPCContext({
        session: makeSession({
          userId,
          email,
          name: "Taylor Test",
        }),
        headers: {},
      }),
      prisma,
    });

    const result = await caller.onboarding.complete();
    createdOrgIds.push(result.organizationId);

    expect(result.projectId).toBeTruthy();
    expect(result.redirectTo).toBe(`/project/${result.projectId}/traces`);
    expect(result.showStarterProjectInvitePrompt).toBe(true);

    const organizationMembership =
      await prisma.organizationMembership.findFirst({
        where: {
          userId,
          orgId: result.organizationId,
        },
        include: {
          organization: {
            include: {
              projects: true,
            },
          },
        },
      });

    expect(organizationMembership?.role).toBe(Role.OWNER);
    expect(
      (
        organizationMembership?.organization.metadata as Record<string, unknown>
      )[ONBOARDING_STARTER_ORG_METADATA_KEY],
    ).toMatchObject({
      createdByUserId: userId,
    });
    expect(organizationMembership?.organization.projects).toHaveLength(1);
    expect(organizationMembership?.organization.projects[0]?.name).toBe(
      "My Project",
    );
    expect(
      (
        organizationMembership?.organization.projects[0]?.metadata as Record<
          string,
          unknown
        >
      )[ONBOARDING_STARTER_PROJECT_METADATA_KEY],
    ).toMatchObject({
      createdByUserId: userId,
      showInviteMembersPrompt: true,
    });
  });

  it("falls back to manual org creation when no real org exists", async () => {
    const userId = randomUUID();
    const email = `no-org-${userId}@example.com`;
    createdUserIds.push(userId);

    await prisma.user.create({
      data: {
        id: userId,
        email,
      },
    });

    const caller = appRouter.createCaller({
      ...createInnerTRPCContext({
        session: makeSession({
          userId,
          email,
        }),
        headers: {},
      }),
      prisma,
    });

    const result = await caller.onboarding.complete();

    expect(result.organizationId).toBeNull();
    expect(result.projectId).toBeNull();
    expect(result.redirectTo).toBe("/setup");
    expect(result.showStarterProjectInvitePrompt).toBe(false);
  });

  it("reuses an existing real project instead of creating starter resources", async () => {
    const userId = randomUUID();
    const email = `existing-${userId}@example.com`;
    createdUserIds.push(userId);

    await prisma.user.create({
      data: {
        id: userId,
        email,
      },
    });

    const organization = await prisma.organization.create({
      data: {
        name: `Existing Org ${userId}`,
        organizationMemberships: {
          create: {
            userId,
            role: Role.OWNER,
          },
        },
      },
      include: {
        projects: true,
      },
    });
    createdOrgIds.push(organization.id);

    const project = await prisma.project.create({
      data: {
        name: `Existing Project ${userId}`,
        orgId: organization.id,
      },
    });

    const caller = appRouter.createCaller({
      ...createInnerTRPCContext({
        session: makeSession({
          userId,
          email,
        }),
        headers: {},
      }),
      prisma,
    });

    const result = await caller.onboarding.complete();

    expect(result.organizationId).toBe(organization.id);
    expect(result.projectId).toBe(project.id);
    expect(result.redirectTo).toBe(`/project/${project.id}`);
    expect(result.showStarterProjectInvitePrompt).toBe(false);

    const projectCount = await prisma.project.count({
      where: {
        orgId: organization.id,
        deletedAt: null,
      },
    });

    expect(projectCount).toBe(1);
  });

  it("falls back to manual project creation when a real org exists without a project", async () => {
    const userId = randomUUID();
    const email = `org-only-${userId}@example.com`;
    createdUserIds.push(userId);

    await prisma.user.create({
      data: {
        id: userId,
        email,
      },
    });

    const organization = await prisma.organization.create({
      data: {
        name: `Org Only ${userId}`,
        organizationMemberships: {
          create: {
            userId,
            role: Role.OWNER,
          },
        },
      },
    });
    createdOrgIds.push(organization.id);

    const caller = appRouter.createCaller({
      ...createInnerTRPCContext({
        session: makeSession({
          userId,
          email,
        }),
        headers: {},
      }),
      prisma,
    });

    const result = await caller.onboarding.complete();

    expect(result.organizationId).toBe(organization.id);
    expect(result.projectId).toBeNull();
    expect(result.redirectTo).toBe(createProjectRoute(organization.id));
    expect(result.showStarterProjectInvitePrompt).toBe(false);
  });

  it("clears the starter-project invite prompt after it is consumed", async () => {
    const userId = randomUUID();
    const email = `consume-${userId}@example.com`;
    createdUserIds.push(userId);

    await prisma.user.create({
      data: {
        id: userId,
        email,
      },
    });

    const organization = await prisma.organization.create({
      data: {
        name: `Prompt Org ${userId}`,
      },
    });
    createdOrgIds.push(organization.id);

    const project = await prisma.project.create({
      data: {
        name: `Prompt Project ${userId}`,
        orgId: organization.id,
        metadata: buildStarterProjectMetadata({
          userId,
        }),
      },
    });

    const caller = appRouter.createCaller({
      ...createInnerTRPCContext({
        session: makeSession({
          userId,
          email,
          organizations: [
            {
              id: organization.id,
              name: organization.name,
              role: Role.OWNER,
              plan: "cloud:hobby",
              cloudConfig: undefined,
              metadata: {},
              aiFeaturesEnabled: false,
              projects: [
                {
                  id: project.id,
                  name: project.name,
                  deletedAt: null,
                  retentionDays: null,
                  hasTraces: false,
                  metadata: (project.metadata as Record<string, unknown>) ?? {},
                  role: Role.OWNER,
                },
              ],
            },
          ],
        }),
        headers: {},
      }),
      prisma,
    });

    const result = await caller.onboarding.consumeStarterProjectInvitePrompt({
      projectId: project.id,
    });

    expect(result.updated).toBe(true);

    const updatedProject = await prisma.project.findUniqueOrThrow({
      where: {
        id: project.id,
      },
      select: {
        metadata: true,
      },
    });

    expect(
      (updatedProject.metadata as Record<string, unknown>)[
        ONBOARDING_STARTER_PROJECT_METADATA_KEY
      ],
    ).toMatchObject({
      createdByUserId: userId,
      showInviteMembersPrompt: false,
    });
  });
});
