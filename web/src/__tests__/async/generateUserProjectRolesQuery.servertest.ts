/** @jest-environment node */

import { prisma } from "@langfuse/shared/src/db";
import { Prisma, type Role } from "@langfuse/shared";
import { v4 } from "uuid";
import { getUserProjectRoles } from "@langfuse/shared/src/server";

export const createOrgAndProject = async () => {
  const org = await prisma.organization.create({
    data: {
      id: v4(),
      name: v4(),
    },
  });

  const project = await prisma.project.create({
    data: {
      id: v4(),
      name: v4(),
      orgId: org.id,
    },
  });

  return { org, project };
};

describe("find user project roles", () => {
  it("should find users with org role", async () => {
    const { org, project } = await createOrgAndProject();

    const user = await prisma.user.create({
      data: {
        id: v4(),
        email: v4(),
        name: v4(),
      },
    });

    await prisma.organizationMembership.create({
      data: {
        userId: user.id,
        orgId: org.id,
        role: "MEMBER",
      },
    });

    const users = await getUserProjectRoles({
      projectId: project.id,
      orgId: org.id,
      filterCondition: [],
      searchFilter: Prisma.empty,
      orderBy: Prisma.empty,
    });

    expect(users).toEqual([
      expect.objectContaining({
        id: user.id,
        name: user.name,
        email: user.email,
      }),
    ]);
  });

  it("should exclude users with NONE role", async () => {
    const { org, project } = await createOrgAndProject();

    const user = await prisma.user.create({
      data: {
        id: v4(),
        email: v4(),
        name: v4(),
      },
    });

    await prisma.organizationMembership.create({
      data: {
        userId: user.id,
        orgId: org.id,
        role: "NONE",
      },
    });

    const users = await getUserProjectRoles({
      projectId: project.id,
      orgId: org.id,
      filterCondition: [],
      searchFilter: Prisma.empty,
      orderBy: Prisma.empty,
    });

    expect(users).toEqual([]);
  });

  it("should find users with org and project role", async () => {
    const { org, project } = await createOrgAndProject();

    const user = await prisma.user.create({
      data: {
        id: v4(),
        email: v4(),
        name: v4(),
      },
    });

    await prisma.organizationMembership.create({
      data: {
        userId: user.id,
        orgId: org.id,
        role: "MEMBER",
      },
    });
    const user2 = await prisma.user.create({
      data: {
        id: v4(),
        email: v4(),
        name: v4(),
      },
    });

    const orgMembershipOfUser2 = await prisma.organizationMembership.create({
      data: {
        userId: user2.id,
        orgId: org.id,
        role: "MEMBER",
      },
    });

    // overwrite org role to ADMIN
    await prisma.projectMembership.create({
      data: {
        userId: user2.id,
        projectId: project.id,
        role: "ADMIN",
        orgMembershipId: orgMembershipOfUser2.id,
      },
    });

    const user3 = await prisma.user.create({
      data: {
        id: v4(),
        email: v4(),
        name: v4(),
      },
    });

    const orgMembershipOfUser3 = await prisma.organizationMembership.create({
      data: {
        userId: user3.id,
        orgId: org.id,
        role: "ADMIN",
      },
    });

    // Downgrade org role to VIEWER
    await prisma.projectMembership.create({
      data: {
        userId: user3.id,
        projectId: project.id,
        role: "VIEWER",
        orgMembershipId: orgMembershipOfUser3.id,
      },
    });

    const users = await getUserProjectRoles({
      projectId: project.id,
      orgId: org.id,
      filterCondition: [],
      searchFilter: Prisma.empty,
      orderBy: Prisma.empty,
    });

    expect(users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: user.id,
          name: user.name,
          email: user.email,
          role: "MEMBER",
        }),
        expect.objectContaining({
          id: user2.id,
          name: user2.name,
          email: user2.email,
          role: "ADMIN",
        }),
        expect.objectContaining({
          id: user3.id,
          name: user3.name,
          email: user3.email,
          role: "VIEWER",
        }),
      ]),
    );
  });

  it("should not select users from different projects", async () => {
    const { org, project } = await createOrgAndProject();

    // valid user
    const user = await prisma.user.create({
      data: {
        id: v4(),
        email: v4(),
        name: v4(),
      },
    });

    await prisma.organizationMembership.create({
      data: {
        userId: user.id,
        orgId: org.id,
        role: "MEMBER",
      },
    });

    const { org: org2, project: project2 } = await createOrgAndProject();

    const user2 = await prisma.user.create({
      data: {
        id: v4(),
        email: v4(),
        name: v4(),
      },
    });

    await prisma.organizationMembership.create({
      data: {
        userId: user2.id,
        orgId: org2.id,
        role: "MEMBER",
      },
    });

    const user3 = await prisma.user.create({
      data: {
        id: v4(),
        email: v4(),
        name: v4(),
      },
    });

    const orgMembershipOfUser3 = await prisma.organizationMembership.create({
      data: {
        userId: user3.id,
        orgId: org2.id,
        role: "MEMBER",
      },
    });

    await prisma.projectMembership.create({
      data: {
        userId: user3.id,
        projectId: project2.id,
        role: "MEMBER",
        orgMembershipId: orgMembershipOfUser3.id,
      },
    });

    const users = await getUserProjectRoles({
      projectId: project.id,
      orgId: org.id,
      filterCondition: [],
      searchFilter: Prisma.empty,
      orderBy: Prisma.empty,
    });

    expect(users).toEqual([
      expect.objectContaining({
        id: user.id,
        name: user.name,
        email: user.email,
      }),
    ]);
  });

  it("should return empty array for empty organization", async () => {
    const { org, project } = await createOrgAndProject();

    const users = await getUserProjectRoles({
      projectId: project.id,
      orgId: org.id,
      filterCondition: [],
      searchFilter: Prisma.empty,
      orderBy: Prisma.empty,
    });

    expect(users).toEqual([]);
  });

  it("should exclude users with project role NONE even if they have org membership", async () => {
    const { org, project } = await createOrgAndProject();

    const user = await prisma.user.create({
      data: {
        id: v4(),
        email: v4(),
        name: v4(),
      },
    });

    const orgMembership = await prisma.organizationMembership.create({
      data: {
        userId: user.id,
        orgId: org.id,
        role: "ADMIN",
      },
    });

    // Project role NONE should exclude user despite ADMIN org role
    await prisma.projectMembership.create({
      data: {
        userId: user.id,
        projectId: project.id,
        role: "NONE",
        orgMembershipId: orgMembership.id,
      },
    });

    const users = await getUserProjectRoles({
      projectId: project.id,
      orgId: org.id,
      filterCondition: [],
      searchFilter: Prisma.empty,
      orderBy: Prisma.empty,
    });

    expect(users).toEqual([]);
  });

  it("should test all role combinations inheritance vs override", async () => {
    const { org, project } = await createOrgAndProject();

    // Test inheritance: users with only org roles
    const inheritanceTests = [
      { orgRole: "OWNER", expectedRole: "OWNER" },
      { orgRole: "ADMIN", expectedRole: "ADMIN" },
      { orgRole: "MEMBER", expectedRole: "MEMBER" },
      { orgRole: "VIEWER", expectedRole: "VIEWER" },
    ];

    const inheritanceUsers = [];
    for (const test of inheritanceTests) {
      const id = v4();
      const user = await prisma.user.create({
        data: {
          id,
          email: `${id}-${test.orgRole}@test.com`,
          name: `${id}-${test.orgRole} User`,
        },
      });

      await prisma.organizationMembership.create({
        data: {
          userId: user.id,
          orgId: org.id,
          role: test.orgRole as Role,
        },
      });

      inheritanceUsers.push({
        id,
        role: test.expectedRole,
      });
    }

    // Test overrides: users with project roles that override org roles
    const overrideTests = [
      { orgRole: "OWNER", projectRole: "VIEWER", expectedRole: "VIEWER" },
      { orgRole: "MEMBER", projectRole: "ADMIN", expectedRole: "ADMIN" },
      { orgRole: "VIEWER", projectRole: "MEMBER", expectedRole: "MEMBER" },
      { orgRole: "ADMIN", projectRole: "VIEWER", expectedRole: "VIEWER" },
    ];

    const overrideUsers = [];
    for (const test of overrideTests) {
      const id = v4();
      const user = await prisma.user.create({
        data: {
          id,
          email: `${id}-${test.orgRole}-${test.projectRole}@test.com`,
          name: `${id}-${test.orgRole}-${test.projectRole} User`,
        },
      });

      const orgMembership = await prisma.organizationMembership.create({
        data: {
          userId: user.id,
          orgId: org.id,
          role: test.orgRole as Role,
        },
      });

      await prisma.projectMembership.create({
        data: {
          userId: user.id,
          projectId: project.id,
          role: test.projectRole as Role,
          orgMembershipId: orgMembership.id,
        },
      });

      overrideUsers.push({
        id: user.id,
        role: test.expectedRole,
      });
    }

    const users = await getUserProjectRoles({
      projectId: project.id,
      orgId: org.id,
      filterCondition: [],
      searchFilter: Prisma.empty,
      orderBy: Prisma.empty,
    });

    // Verify all inheritance cases
    for (const expectedUser of inheritanceUsers) {
      expect(users).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: expectedUser.id,
            role: expectedUser.role,
          }),
        ]),
      );
    }

    // Verify all override cases
    for (const expectedUser of overrideUsers) {
      expect(users).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: expectedUser.id,
            role: expectedUser.role,
          }),
        ]),
      );
    }

    // Verify total count
    expect(users).toHaveLength(inheritanceUsers.length + overrideUsers.length);
  });
});
