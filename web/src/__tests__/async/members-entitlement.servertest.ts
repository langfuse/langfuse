/** @jest-environment node */

import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import type { Session } from "next-auth";
import { TRPCError } from "@trpc/server";
import { v4 } from "uuid";

const __orgIds: string[] = [];

async function createTestOrg(plan: "Hobby" | "Core" | "Team") {
  const { project, org } = await createOrgProjectAndApiKey({ plan });
  __orgIds.push(org.id);

  // Create org membership for the session user (org creator)
  await prisma.organizationMembership.create({
    data: {
      userId: "user-1",
      orgId: org.id,
      role: "OWNER",
    },
  });

  return { project, org };
}

describe("members.create entitlement limit enforcement", () => {
  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: {
        id: { in: __orgIds },
      },
    });
  });

  it("should throw FORBIDDEN when cloud:hobby org exceeds member limit", async () => {
    // Create org with cloud:hobby plan
    const { project, org } = await createTestOrg("Hobby");

    const session: Session = {
      expires: "1",
      user: {
        id: "user-1",
        canCreateOrganizations: true,
        name: "Demo User",
        organizations: [
          {
            id: org.id,
            name: org.name,
            role: "OWNER",
            plan: "cloud:hobby", // Has limit of 2 members
            cloudConfig: undefined,
            metadata: {},
            projects: [
              {
                id: project.id,
                role: "ADMIN",
                retentionDays: 30,
                deletedAt: null,
                name: project.name,
                metadata: {},
              },
            ],
          },
        ],
        featureFlags: {
          excludeClickhouseRead: false,
          templateFlag: true,
        },
        admin: false, // Not admin, so limits apply
      },
      environment: {
        enableExperimentalFeatures: false,
        selfHostedInstancePlan: "cloud:hobby",
      },
    };

    const ctx = createInnerTRPCContext({ session, headers: {} });
    const caller = appRouter.createCaller({ ...ctx, prisma });

    // Create user 2 (user 1 is the session user who already exists as org creator)
    const user2 = await prisma.user.create({
      data: {
        id: v4(),
        email: `user2-${v4()}@test.com`,
        name: "User 2",
      },
    });

    // Add user 2 as second member (should succeed - at limit of 2)
    await caller.members.create({
      orgId: org.id,
      email: user2.email,
      orgRole: "MEMBER",
    });

    // Try to add user 3 - should fail as we're at limit of 2
    const user3 = await prisma.user.create({
      data: {
        id: v4(),
        email: `user3-${v4()}@test.com`,
        name: "User 3",
      },
    });

    await expect(
      caller.members.create({
        orgId: org.id,
        email: user3.email,
        orgRole: "MEMBER",
      }),
    ).rejects.toThrow(TRPCError);

    await expect(
      caller.members.create({
        orgId: org.id,
        email: user3.email,
        orgRole: "MEMBER",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("should count pending invitations toward the limit", async () => {
    // Create org with cloud:hobby plan
    const { project, org } = await createTestOrg("Hobby");

    const session: Session = {
      expires: "1",
      user: {
        id: "user-1",
        canCreateOrganizations: true,
        name: "Demo User",
        organizations: [
          {
            id: org.id,
            name: org.name,
            role: "OWNER",
            plan: "cloud:hobby",
            cloudConfig: undefined,
            metadata: {},
            projects: [
              {
                id: project.id,
                role: "ADMIN",
                retentionDays: 30,
                deletedAt: null,
                name: project.name,
                metadata: {},
              },
            ],
          },
        ],
        featureFlags: {
          excludeClickhouseRead: false,
          templateFlag: true,
        },
        admin: false,
      },
      environment: {
        enableExperimentalFeatures: false,
        selfHostedInstancePlan: "cloud:hobby",
      },
    };

    const ctx = createInnerTRPCContext({ session, headers: {} });
    const caller = appRouter.createCaller({ ...ctx, prisma });

    // Create one pending invitation (user doesn't exist yet)
    // This counts as 1 toward the limit (org creator + 1 invite = 2)
    await caller.members.create({
      orgId: org.id,
      email: `newuser-${v4()}@test.com`,
      orgRole: "MEMBER",
    });

    // Try to add another invitation - should fail as we're at limit of 2
    const anotherEmail = `anotheruser-${v4()}@test.com`;
    await expect(
      caller.members.create({
        orgId: org.id,
        email: anotherEmail,
        orgRole: "MEMBER",
      }),
    ).rejects.toThrow(TRPCError);

    await expect(
      caller.members.create({
        orgId: org.id,
        email: anotherEmail,
        orgRole: "MEMBER",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("should allow unlimited members for cloud:core plan", async () => {
    // Create org with cloud:core plan
    const { project, org } = await createTestOrg("Core");

    const session: Session = {
      expires: "1",
      user: {
        id: "user-1",
        canCreateOrganizations: true,
        name: "Demo User",
        organizations: [
          {
            id: org.id,
            name: org.name,
            role: "OWNER",
            plan: "cloud:core", // Unlimited members
            cloudConfig: undefined,
            metadata: {},
            projects: [
              {
                id: project.id,
                role: "ADMIN",
                retentionDays: 30,
                deletedAt: null,
                name: project.name,
                metadata: {},
              },
            ],
          },
        ],
        featureFlags: {
          excludeClickhouseRead: false,
          templateFlag: true,
        },
        admin: false,
      },
      environment: {
        enableExperimentalFeatures: false,
        selfHostedInstancePlan: "cloud:core",
      },
    };

    const ctx = createInnerTRPCContext({ session, headers: {} });
    const caller = appRouter.createCaller({ ...ctx, prisma });

    // Create multiple users (more than hobby limit of 2)
    const user2 = await prisma.user.create({
      data: {
        id: v4(),
        email: `user2-${v4()}@test.com`,
        name: "User 2",
      },
    });

    const user3 = await prisma.user.create({
      data: {
        id: v4(),
        email: `user3-${v4()}@test.com`,
        name: "User 3",
      },
    });

    // Should succeed for both users (no limit on cloud:core)
    await caller.members.create({
      orgId: org.id,
      email: user2.email,
      orgRole: "MEMBER",
    });

    await caller.members.create({
      orgId: org.id,
      email: user3.email,
      orgRole: "MEMBER",
    });

    // Verify both memberships were created
    const memberCount = await prisma.organizationMembership.count({
      where: { orgId: org.id },
    });
    expect(memberCount).toBe(3); // org creator + user2 + user3
  });

  it("should not enforce limit for project-only role additions (orgRole: NONE)", async () => {
    // Create org with cloud:team plan (has rbac-project-roles entitlement and unlimited members)
    const { project, org } = await createTestOrg("Team");

    const session: Session = {
      expires: "1",
      user: {
        id: "user-1",
        canCreateOrganizations: true,
        name: "Demo User",
        organizations: [
          {
            id: org.id,
            name: org.name,
            role: "OWNER",
            plan: "cloud:team",
            cloudConfig: undefined,
            metadata: {},
            projects: [
              {
                id: project.id,
                role: "ADMIN",
                retentionDays: 30,
                deletedAt: null,
                name: project.name,
                metadata: {},
              },
            ],
          },
        ],
        featureFlags: {
          excludeClickhouseRead: false,
          templateFlag: true,
        },
        admin: false,
      },
      environment: {
        enableExperimentalFeatures: false,
        selfHostedInstancePlan: "cloud:team",
      },
    };

    const ctx = createInnerTRPCContext({ session, headers: {} });
    const caller = appRouter.createCaller({ ...ctx, prisma });

    // Create another user who is already an org member
    const user2 = await prisma.user.create({
      data: {
        id: v4(),
        email: `user2-${v4()}@test.com`,
        name: "User 2",
      },
    });

    // Add user2 as org member first
    await caller.members.create({
      orgId: org.id,
      email: user2.email,
      orgRole: "MEMBER",
    });

    // Now try to add a project-only role to user2 (orgRole: NONE)
    // This should succeed because it's not adding an org member, just a project role
    await expect(
      caller.members.create({
        orgId: org.id,
        email: user2.email,
        orgRole: "NONE",
        projectId: project.id,
        projectRole: "MEMBER",
      }),
    ).resolves.not.toThrow();
  });

  it("should allow member creation when below limit", async () => {
    // Create org with cloud:hobby plan
    const { project, org } = await createTestOrg("Hobby");

    const session: Session = {
      expires: "1",
      user: {
        id: "user-1",
        canCreateOrganizations: true,
        name: "Demo User",
        organizations: [
          {
            id: org.id,
            name: org.name,
            role: "OWNER",
            plan: "cloud:hobby",
            cloudConfig: undefined,
            metadata: {},
            projects: [
              {
                id: project.id,
                role: "ADMIN",
                retentionDays: 30,
                deletedAt: null,
                name: project.name,
                metadata: {},
              },
            ],
          },
        ],
        featureFlags: {
          excludeClickhouseRead: false,
          templateFlag: true,
        },
        admin: false,
      },
      environment: {
        enableExperimentalFeatures: false,
        selfHostedInstancePlan: "cloud:hobby",
      },
    };

    const ctx = createInnerTRPCContext({ session, headers: {} });
    const caller = appRouter.createCaller({ ...ctx, prisma });

    // Only 1 member (org creator), should be able to add 1 more (limit is 2)
    const user2 = await prisma.user.create({
      data: {
        id: v4(),
        email: `user2-${v4()}@test.com`,
        name: "User 2",
      },
    });

    await expect(
      caller.members.create({
        orgId: org.id,
        email: user2.email,
        orgRole: "MEMBER",
      }),
    ).resolves.not.toThrow();

    // Verify membership was created
    const memberCount = await prisma.organizationMembership.count({
      where: { orgId: org.id },
    });
    expect(memberCount).toBe(2);
  });

  it("should handle invitation creation (user doesn't exist) with limit enforcement", async () => {
    // Create org with cloud:hobby plan
    const { project, org } = await createTestOrg("Hobby");

    const session: Session = {
      expires: "1",
      user: {
        id: "user-1",
        canCreateOrganizations: true,
        name: "Demo User",
        organizations: [
          {
            id: org.id,
            name: org.name,
            role: "OWNER",
            plan: "cloud:hobby",
            cloudConfig: undefined,
            metadata: {},
            projects: [
              {
                id: project.id,
                role: "ADMIN",
                retentionDays: 30,
                deletedAt: null,
                name: project.name,
                metadata: {},
              },
            ],
          },
        ],
        featureFlags: {
          excludeClickhouseRead: false,
          templateFlag: true,
        },
        admin: false,
      },
      environment: {
        enableExperimentalFeatures: false,
        selfHostedInstancePlan: "cloud:hobby",
      },
    };

    const ctx = createInnerTRPCContext({ session, headers: {} });
    const caller = appRouter.createCaller({ ...ctx, prisma });

    // Create invitation for non-existent user (limit: org creator + 1 invite = 2)
    await caller.members.create({
      orgId: org.id,
      email: `newuser-${v4()}@test.com`,
      orgRole: "MEMBER",
    });

    // Try to create another invitation - should fail
    const anotherEmail = `anotheruser-${v4()}@test.com`;
    await expect(
      caller.members.create({
        orgId: org.id,
        email: anotherEmail,
        orgRole: "MEMBER",
      }),
    ).rejects.toThrow(TRPCError);

    await expect(
      caller.members.create({
        orgId: org.id,
        email: anotherEmail,
        orgRole: "MEMBER",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    // Verify only 1 invitation was created
    const inviteCount = await prisma.membershipInvitation.count({
      where: { orgId: org.id },
    });
    expect(inviteCount).toBe(1);
  });
});
