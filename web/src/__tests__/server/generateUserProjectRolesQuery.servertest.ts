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

    const usersOrg1 = await getUserProjectRoles({
      projectId: project.id,
      orgId: org.id,
      filterCondition: [],
      searchFilter: Prisma.empty,
      orderBy: Prisma.empty,
    });

    expect(usersOrg1).toEqual([
      expect.objectContaining({
        id: user.id,
        name: user.name,
        email: user.email,
      }),
    ]);

    const usersOrg2 = await getUserProjectRoles({
      projectId: project2.id,
      orgId: org2.id,
      filterCondition: [],
      searchFilter: Prisma.empty,
      orderBy: Prisma.empty,
    });

    expect(usersOrg2).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: user3.id,
          name: user3.name,
          email: user3.email,
        }),
        expect.objectContaining({
          id: user2.id,
          name: user2.name,
          email: user2.email,
        }),
      ]),
    );

    expect(usersOrg2).toHaveLength(2);
    expect(usersOrg2).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: user.id,
        }),
      ]),
    );
  });

  it("should inherit the org role when a user only has a project-specific override on a different project", async () => {
    const { org, project: projectX } = await createOrgAndProject();

    const projectY = await prisma.project.create({
      data: {
        id: v4(),
        name: v4(),
        orgId: org.id,
      },
    });

    const userWithOrgRoleOnly = await prisma.user.create({
      data: {
        id: v4(),
        email: v4(),
        name: "User A",
      },
    });

    const userB = await prisma.user.create({
      data: {
        id: v4(),
        email: v4(),
        name: "User B",
      },
    });

    const userC = await prisma.user.create({
      data: {
        id: v4(),
        email: v4(),
        name: "User C",
      },
    });

    await prisma.organizationMembership.create({
      data: {
        userId: userWithOrgRoleOnly.id,
        orgId: org.id,
        role: "MEMBER",
      },
    });

    const orgMembershipOfUserB = await prisma.organizationMembership.create({
      data: {
        userId: userB.id,
        orgId: org.id,
        role: "MEMBER",
      },
    });

    const orgMembershipOfUserC = await prisma.organizationMembership.create({
      data: {
        userId: userC.id,
        orgId: org.id,
        role: "MEMBER",
      },
    });

    await prisma.projectMembership.create({
      data: {
        userId: userB.id,
        projectId: projectX.id,
        role: "VIEWER",
        orgMembershipId: orgMembershipOfUserB.id,
      },
    });

    await prisma.projectMembership.create({
      data: {
        userId: userC.id,
        projectId: projectY.id,
        role: "ADMIN",
        orgMembershipId: orgMembershipOfUserC.id,
      },
    });

    const users = await getUserProjectRoles({
      projectId: projectX.id,
      orgId: org.id,
      filterCondition: [],
      searchFilter: Prisma.empty,
      orderBy: Prisma.empty,
    });

    expect(users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: userWithOrgRoleOnly.id,
          role: "MEMBER",
        }),
        expect.objectContaining({
          id: userB.id,
          role: "VIEWER",
        }),
        // User C has a project-specific override on a different project (projectY)
        // so they should inherit their org role (MEMBER) for projectX
        expect.objectContaining({
          id: userC.id,
          role: "MEMBER",
        }),
      ]),
    );
    expect(users).toHaveLength(3);
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
