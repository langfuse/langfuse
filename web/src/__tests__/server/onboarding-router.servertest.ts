import type { Session } from "next-auth";
import { randomUUID } from "crypto";
import { env } from "@/src/env.mjs";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { createProjectMembershipsOnSignup } from "@/src/features/auth/lib/createProjectMembershipsOnSignup";
import { V4_DEFAULT_ENABLED_FROM_AT } from "@/src/features/events/lib/v4Rollout";
import { createProjectRoute } from "@/src/features/setup/setupRoutes";
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

    const organizationMembership =
      await prisma.organizationMembership.findFirst({
        where: {
          userId,
        },
        include: {
          organization: {
            include: {
              projects: true,
            },
          },
        },
      });

    expect(organizationMembership).toBeTruthy();
    if (organizationMembership) {
      createdOrgIds.push(organizationMembership.organization.id);
    }
    const starterProjectId =
      organizationMembership?.organization.projects[0]?.id;
    expect(starterProjectId).toBeTruthy();
    expect(result).toEqual({
      redirectTo: `/project/${starterProjectId}/traces`,
    });
    expect(organizationMembership?.role).toBe(Role.OWNER);
    expect(organizationMembership?.organization.projects).toHaveLength(1);
    expect(organizationMembership?.organization.projects[0]?.name).toBe(
      "My Project",
    );
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

    expect(result).toEqual({
      redirectTo: "/setup",
    });
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

    expect(result).toEqual({
      redirectTo: `/project/${project.id}`,
    });

    const projectCount = await prisma.project.count({
      where: {
        orgId: organization.id,
        deletedAt: null,
      },
    });

    expect(projectCount).toBe(1);
  });

  it("does not create starter resources when signup consumes a real invitation", async () => {
    const userId = randomUUID();
    const email = `invited-${userId}@example.com`;
    createdUserIds.push(userId);

    const user = await prisma.user.create({
      data: {
        id: userId,
        email,
      },
    });

    const organization = await prisma.organization.create({
      data: {
        name: `Invited Org ${userId}`,
        createdAt: new Date(V4_DEFAULT_ENABLED_FROM_AT.getTime() + 1_000),
      },
    });
    createdOrgIds.push(organization.id);

    const project = await prisma.project.create({
      data: {
        name: `Invited Project ${userId}`,
        orgId: organization.id,
      },
    });

    await prisma.membershipInvitation.create({
      data: {
        orgId: organization.id,
        projectId: project.id,
        email,
        orgRole: Role.NONE,
        projectRole: Role.MEMBER,
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
        }),
        headers: {},
      }),
      prisma,
    });

    const result = await caller.onboarding.complete();

    expect(result).toEqual({
      redirectTo: `/project/${project.id}`,
    });

    const organizationMemberships =
      await prisma.organizationMembership.findMany({
        where: {
          userId,
        },
        select: {
          orgId: true,
        },
      });

    const realOrganizationIds = organizationMemberships
      .map((membership) => membership.orgId)
      .filter((orgId) => orgId !== env.NEXT_PUBLIC_DEMO_ORG_ID);

    expect(realOrganizationIds).toEqual([organization.id]);

    const invitationCount = await prisma.membershipInvitation.count({
      where: {
        email,
      },
    });

    expect(invitationCount).toBe(0);

    const updatedUser = await prisma.user.findUniqueOrThrow({
      where: {
        id: userId,
      },
      select: {
        v4BetaEnabled: true,
      },
    });

    expect(updatedUser.v4BetaEnabled).toBe(true);
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

    expect(result).toEqual({
      redirectTo: createProjectRoute(organization.id),
    });
  });
});
