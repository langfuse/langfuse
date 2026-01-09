/** @jest-environment node */

import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma } from "@langfuse/shared/src/db";
import { Role, type Plan } from "@langfuse/shared";
import type { Session } from "next-auth";
import { v4 as uuidv4 } from "uuid";

async function createTestOrg(plan: Plan) {
  const orgId = uuidv4();
  const projectId = uuidv4();

  const org = await prisma.organization.create({
    data: {
      id: orgId,
      name: `Test Org ${orgId.substring(0, 8)}`,
    },
  });

  const project = await prisma.project.create({
    data: {
      id: projectId,
      name: `Test Project ${projectId.substring(0, 8)}`,
      orgId: org.id,
    },
  });

  // Create a user who will be the owner/admin making requests
  const ownerUser = await prisma.user.create({
    data: {
      id: uuidv4(),
      email: `owner-${uuidv4().substring(0, 8)}@test.com`,
      name: "Test Owner",
    },
  });

  // Create owner's org membership
  await prisma.organizationMembership.create({
    data: {
      userId: ownerUser.id,
      orgId: org.id,
      role: Role.OWNER,
    },
  });

  return { org, project, ownerUser, plan };
}

function createSession(
  ownerUser: { id: string; email: string | null; name: string | null },
  org: { id: string; name: string },
  project: { id: string; name: string },
  plan: Plan,
): Session {
  return {
    expires: "1",
    user: {
      id: ownerUser.id,
      email: ownerUser.email,
      name: ownerUser.name,
      canCreateOrganizations: true,
      organizations: [
        {
          id: org.id,
          name: org.name,
          role: "OWNER",
          plan: plan,
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: false,
          projects: [
            {
              id: project.id,
              role: "OWNER",
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
      admin: false, // Not admin to test actual limits
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: plan,
    },
  };
}

async function prepare(plan: Plan) {
  const { org, project, ownerUser } = await createTestOrg(plan);

  const session = createSession(ownerUser, org, project, plan);
  const ctx = createInnerTRPCContext({ session, headers: {} });
  const caller = appRouter.createCaller({ ...ctx, prisma });

  return { org, project, ownerUser, session, ctx, caller };
}

async function createTestUser() {
  return prisma.user.create({
    data: {
      id: uuidv4(),
      email: `test-user-${uuidv4().substring(0, 8)}@test.com`,
      name: `Test User ${uuidv4().substring(0, 8)}`,
    },
  });
}

describe("membersRouter.create - organization member limit enforcement", () => {
  describe("cloud:hobby plan (2 member limit)", () => {
    it("should allow adding a member when within limit", async () => {
      const { org, caller } = await prepare("cloud:hobby");

      // Org already has 1 member (owner), so we can add 1 more
      const newUser = await createTestUser();

      // This should succeed (1 existing + 1 new = 2, which is the limit)
      await expect(
        caller.members.create({
          orgId: org.id,
          email: newUser.email!,
          orgRole: Role.MEMBER,
        }),
      ).resolves.not.toThrow();

      // Verify the membership was created
      const membership = await prisma.organizationMembership.findFirst({
        where: { orgId: org.id, userId: newUser.id },
      });
      expect(membership).not.toBeNull();
      expect(membership?.role).toBe(Role.MEMBER);
    });

    it("should throw FORBIDDEN when exceeding member limit with existing members", async () => {
      const { org, caller } = await prepare("cloud:hobby");

      // Add one more member to reach the limit (owner + 1 = 2)
      const user1 = await createTestUser();
      await prisma.organizationMembership.create({
        data: {
          userId: user1.id,
          orgId: org.id,
          role: Role.MEMBER,
        },
      });

      // Now try to add a third member - this should fail
      const user2 = await createTestUser();

      await expect(
        caller.members.create({
          orgId: org.id,
          email: user2.email!,
          orgRole: Role.MEMBER,
        }),
      ).rejects.toThrow(/exceeds the limit/i);
    });

    it("should throw FORBIDDEN when exceeding member limit with pending invitations", async () => {
      const { org, caller, ownerUser } = await prepare("cloud:hobby");

      // Create a pending invitation (owner + 1 invite = 2)
      await prisma.membershipInvitation.create({
        data: {
          orgId: org.id,
          email: `invited-${uuidv4().substring(0, 8)}@test.com`,
          orgRole: Role.MEMBER,
          invitedByUserId: ownerUser.id,
        },
      });

      // Now try to invite another user - this should fail
      const newEmail = `new-${uuidv4().substring(0, 8)}@test.com`;

      await expect(
        caller.members.create({
          orgId: org.id,
          email: newEmail,
          orgRole: Role.MEMBER,
        }),
      ).rejects.toThrow(/exceeds the limit/i);
    });
  });

  describe("cloud:core plan (unlimited members)", () => {
    it("should allow adding 4 members without limit", async () => {
      const { org, caller } = await prepare("cloud:core");

      // Create and add 4 members
      for (let i = 0; i < 4; i++) {
        const user = await createTestUser();

        await expect(
          caller.members.create({
            orgId: org.id,
            email: user.email!,
            orgRole: Role.MEMBER,
          }),
        ).resolves.not.toThrow();
      }

      // Verify all members were created (owner + 4 = 5)
      const memberCount = await prisma.organizationMembership.count({
        where: { orgId: org.id },
      });
      expect(memberCount).toBe(5);
    }, 25_000);
  });

  describe("invitation creation with limits", () => {
    it("should allow creating invitation when within limit on cloud:hobby", async () => {
      const { org, caller } = await prepare("cloud:hobby");

      // Org has 1 member (owner), so we can create 1 invitation
      const newEmail = `invite-${uuidv4().substring(0, 8)}@test.com`;

      await expect(
        caller.members.create({
          orgId: org.id,
          email: newEmail,
          orgRole: Role.MEMBER,
        }),
      ).resolves.not.toThrow();

      // Verify the invitation was created
      const invitation = await prisma.membershipInvitation.findFirst({
        where: { orgId: org.id, email: newEmail },
      });
      expect(invitation).not.toBeNull();
    });

    it("should allow creating invitations without limit on paid plans", async () => {
      const { org, caller } = await prepare("cloud:team");

      // Create 4 invitations
      for (let i = 0; i < 4; i++) {
        const email = `invite-${uuidv4().substring(0, 8)}@test.com`;

        await expect(
          caller.members.create({
            orgId: org.id,
            email: email,
            orgRole: Role.MEMBER,
          }),
        ).resolves.not.toThrow();
      }

      // Verify all invitations were created
      const inviteCount = await prisma.membershipInvitation.count({
        where: { orgId: org.id },
      });
      expect(inviteCount).toBe(4);
    }, 25_000);
  });
});
