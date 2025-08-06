/** @jest-environment node */

import { prisma } from "@langfuse/shared/src/db";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { appRouter } from "@/src/server/api/root";
import { type Session } from "next-auth";
import {
  createOrgProjectAndApiKey,
  pruneDatabase,
} from "@/src/__tests__/test-utils";
import { Role } from "@langfuse/shared";

const __orgIds: string[] = [];

afterAll(async () => {
  await prisma.organization.deleteMany({
    where: { id: { in: __orgIds } },
  });
});

describe("members.byProjectId", () => {
  beforeEach(pruneDatabase);

  describe("Data Security and Isolation", () => {
    it("should only return users with both org and project membership", async () => {
      const { project, org } = await createOrgProjectAndApiKey();
      __orgIds.push(org.id);

      // Create test users with different membership scenarios
      const orgOnlyUser = await prisma.user.create({
        data: {
          id: "org-only-user",
          email: "org-only@test.com",
          name: "Org Only User",
        },
      });

      const bothMembershipsUser = await prisma.user.create({
        data: {
          id: "both-memberships-user",
          email: "both@test.com",
          name: "Both Memberships User",
        },
      });

      // Create org membership for both users
      const orgMembership1 = await prisma.organizationMembership.create({
        data: {
          userId: orgOnlyUser.id,
          orgId: org.id,
          role: "MEMBER",
        },
      });

      const orgMembership2 = await prisma.organizationMembership.create({
        data: {
          userId: bothMembershipsUser.id,
          orgId: org.id,
          role: "MEMBER",
        },
      });

      // Create project membership only for one user
      await prisma.projectMembership.create({
        data: {
          userId: bothMembershipsUser.id,
          projectId: project.id,
          role: "VIEWER",
          orgMembershipId: orgMembership2.id,
        },
      });

      const session: Session = {
        expires: "1",
        user: {
          id: "admin-user",
          canCreateOrganizations: true,
          name: "Admin User",
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
          featureFlags: {},
          admin: false,
        },
        environment: {
          enableExperimentalFeatures: false,
          selfHostedInstancePlan: "cloud:hobby",
        },
      };

      const ctx = createInnerTRPCContext({ session });
      const caller = appRouter.createCaller({ ...ctx, prisma });

      const result = await caller.members.byProjectId({
        projectId: project.id,
        page: 0,
        limit: 10,
      });

      // Should only return users with BOTH org and project membership
      const userIds = result.users.map((u) => u.id);
      expect(userIds).toContain(bothMembershipsUser.id);
      expect(userIds).not.toContain(orgOnlyUser.id);
    });

    it("should not return users with NONE project role", async () => {
      const { project, org } = await createOrgProjectAndApiKey();
      __orgIds.push(org.id);

      const noneRoleUser = await prisma.user.create({
        data: {
          id: "none-role-user",
          email: "none@test.com",
          name: "None Role User",
        },
      });

      const orgMembership = await prisma.organizationMembership.create({
        data: {
          userId: noneRoleUser.id,
          orgId: org.id,
          role: "MEMBER",
        },
      });

      // Create project membership with NONE role
      await prisma.projectMembership.create({
        data: {
          userId: noneRoleUser.id,
          projectId: project.id,
          role: "NONE",
          orgMembershipId: orgMembership.id,
        },
      });

      const session: Session = {
        expires: "1",
        user: {
          id: "admin-user",
          canCreateOrganizations: true,
          name: "Admin User",
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
          featureFlags: {},
          admin: false,
        },
        environment: {
          enableExperimentalFeatures: false,
          selfHostedInstancePlan: "cloud:hobby",
        },
      };

      const ctx = createInnerTRPCContext({ session });
      const caller = appRouter.createCaller({ ...ctx, prisma });

      const result = await caller.members.byProjectId({
        projectId: project.id,
        page: 0,
        limit: 10,
      });

      const userIds = result.users.map((u) => u.id);
      expect(userIds).not.toContain(noneRoleUser.id);
    });

    it("should enforce organization boundary", async () => {
      const { project: project1, org: org1 } =
        await createOrgProjectAndApiKey();
      const { project: project2, org: org2 } =
        await createOrgProjectAndApiKey();
      __orgIds.push(org1.id, org2.id);

      // Create user in org2 only
      const org2User = await prisma.user.create({
        data: {
          id: "org2-user",
          email: "org2@test.com",
          name: "Org2 User",
        },
      });

      const org2Membership = await prisma.organizationMembership.create({
        data: {
          userId: org2User.id,
          orgId: org2.id,
          role: "MEMBER",
        },
      });

      await prisma.projectMembership.create({
        data: {
          userId: org2User.id,
          projectId: project2.id,
          role: "VIEWER",
          orgMembershipId: org2Membership.id,
        },
      });

      // Query from org1 session
      const session: Session = {
        expires: "1",
        user: {
          id: "org1-admin",
          canCreateOrganizations: true,
          name: "Org1 Admin",
          organizations: [
            {
              id: org1.id,
              name: org1.name,
              role: "OWNER",
              plan: "cloud:hobby",
              cloudConfig: undefined,
              metadata: {},
              projects: [
                {
                  id: project1.id,
                  role: "ADMIN",
                  retentionDays: 30,
                  deletedAt: null,
                  name: project1.name,
                  metadata: {},
                },
              ],
            },
          ],
          featureFlags: {},
          admin: false,
        },
        environment: {
          enableExperimentalFeatures: false,
          selfHostedInstancePlan: "cloud:hobby",
        },
      };

      const ctx = createInnerTRPCContext({ session });
      const caller = appRouter.createCaller({ ...ctx, prisma });

      const result = await caller.members.byProjectId({
        projectId: project1.id,
        page: 0,
        limit: 10,
      });

      // Should not return users from different organization
      const userIds = result.users.map((u) => u.id);
      expect(userIds).not.toContain(org2User.id);
    });
  });
});
