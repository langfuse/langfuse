import { prisma } from "@langfuse/shared/src/db";
import {
  createOrgMembership,
  createProjectMembership,
} from "@langfuse/shared/memberships";
import { Prisma, type Role } from "@langfuse/shared";
import { v4 } from "uuid";
import {
  createApiKey,
  getUserProjectRoles,
  getUserProjectRolesCount,
} from "@langfuse/shared/src/server";
import { assignRole } from "@langfuse/shared/rbac/server";
import {
  GroupId,
  OrganizationId,
  ProjectId,
  SystemRoleId,
  UserId,
} from "@langfuse/shared/rbac";

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

    await createOrgMembership(prisma, {
      userId: user.id,
      orgId: org.id,
      role: "MEMBER",
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

    await createOrgMembership(prisma, {
      userId: user.id,
      orgId: org.id,
      role: "NONE",
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

    await createOrgMembership(prisma, {
      userId: user.id,
      orgId: org.id,
      role: "MEMBER",
    });
    const user2 = await prisma.user.create({
      data: {
        id: v4(),
        email: v4(),
        name: v4(),
      },
    });

    const orgMembershipOfUser2 = await createOrgMembership(prisma, {
      userId: user2.id,
      orgId: org.id,
      role: "MEMBER",
    });

    // overwrite org role to ADMIN
    await createProjectMembership(prisma, {
      orgId: org.id,
      userId: user2.id,
      projectId: project.id,
      role: "ADMIN",
      orgMembershipId: orgMembershipOfUser2.id,
    });

    const user3 = await prisma.user.create({
      data: {
        id: v4(),
        email: v4(),
        name: v4(),
      },
    });

    const orgMembershipOfUser3 = await createOrgMembership(prisma, {
      userId: user3.id,
      orgId: org.id,
      role: "ADMIN",
    });

    // Downgrade org role to VIEWER
    await createProjectMembership(prisma, {
      orgId: org.id,
      userId: user3.id,
      projectId: project.id,
      role: "VIEWER",
      orgMembershipId: orgMembershipOfUser3.id,
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

    await createOrgMembership(prisma, {
      userId: user.id,
      orgId: org.id,
      role: "MEMBER",
    });

    const { org: org2, project: project2 } = await createOrgAndProject();

    const user2 = await prisma.user.create({
      data: {
        id: v4(),
        email: v4(),
        name: v4(),
      },
    });

    await createOrgMembership(prisma, {
      userId: user2.id,
      orgId: org2.id,
      role: "MEMBER",
    });

    const user3 = await prisma.user.create({
      data: {
        id: v4(),
        email: v4(),
        name: v4(),
      },
    });

    const orgMembershipOfUser3 = await createOrgMembership(prisma, {
      userId: user3.id,
      orgId: org2.id,
      role: "MEMBER",
    });

    await createProjectMembership(prisma, {
      orgId: org2.id,
      userId: user3.id,
      projectId: project2.id,
      role: "MEMBER",
      orgMembershipId: orgMembershipOfUser3.id,
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

    await createOrgMembership(prisma, {
      userId: userWithOrgRoleOnly.id,
      orgId: org.id,
      role: "MEMBER",
    });

    const orgMembershipOfUserB = await createOrgMembership(prisma, {
      userId: userB.id,
      orgId: org.id,
      role: "MEMBER",
    });

    const orgMembershipOfUserC = await createOrgMembership(prisma, {
      userId: userC.id,
      orgId: org.id,
      role: "MEMBER",
    });

    await createProjectMembership(prisma, {
      orgId: org.id,
      userId: userB.id,
      projectId: projectX.id,
      role: "VIEWER",
      orgMembershipId: orgMembershipOfUserB.id,
    });

    await createProjectMembership(prisma, {
      orgId: org.id,
      userId: userC.id,
      projectId: projectY.id,
      role: "ADMIN",
      orgMembershipId: orgMembershipOfUserC.id,
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

    const orgMembership = await createOrgMembership(prisma, {
      userId: user.id,
      orgId: org.id,
      role: "ADMIN",
    });

    // Project role NONE should exclude user despite ADMIN org role
    await createProjectMembership(prisma, {
      orgId: org.id,
      userId: user.id,
      projectId: project.id,
      role: "NONE",
      orgMembershipId: orgMembership.id,
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

      await createOrgMembership(prisma, {
        userId: user.id,
        orgId: org.id,
        role: test.orgRole as Role,
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

      const orgMembership = await createOrgMembership(prisma, {
        userId: user.id,
        orgId: org.id,
        role: test.orgRole as Role,
      });

      await createProjectMembership(prisma, {
        orgId: org.id,
        userId: user.id,
        projectId: project.id,
        role: test.projectRole as Role,
        orgMembershipId: orgMembership.id,
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

describe("find user project roles through groups", () => {
  type GroupRole = {
    ownerId: OrganizationId | ProjectId;
    role: Role;
    expiresAt?: Date;
  };

  /** createMember creates a user in the org with `orgRole`, a `projectRole` on the project if given, and one group per entry of `groups`. */
  const createMember = async (
    orgId: string,
    projectId: string,
    {
      orgRole,
      projectRole,
      groups = [],
    }: { orgRole: Role; projectRole?: Role; groups?: GroupRole[][] },
  ) => {
    const user = await prisma.user.create({
      data: { id: v4(), email: v4(), name: v4() },
    });
    const orgMembership = await createOrgMembership(prisma, {
      userId: user.id,
      orgId,
      role: orgRole,
    });
    if (projectRole)
      await createProjectMembership(prisma, {
        orgId,
        userId: user.id,
        projectId,
        role: projectRole,
        orgMembershipId: orgMembership.id,
      });
    for (const roles of groups) {
      const group = await prisma.group.create({
        data: { orgId, displayName: v4(), source: "SCIM" },
      });
      await prisma.groupMembership.create({
        data: { groupId: group.id, orgMembershipId: orgMembership.id },
      });
      for (const { ownerId, role, expiresAt } of roles)
        await assignRole(prisma, {
          tenantId: OrganizationId(orgId),
          ownerId,
          principalId: GroupId(group.id),
          roleId: SystemRoleId(role),
          tags: [],
          expiresAt,
        });
    }
    return user.id;
  };

  /** roleOf returns the role the query gives the user on the project, or undefined when it leaves them out. */
  const roleOf = async (orgId: string, projectId: string, userId: string) => {
    const users = await getUserProjectRoles({
      projectId,
      orgId,
      filterCondition: [
        {
          column: "userId",
          operator: "any of",
          value: [userId],
          type: "stringOptions",
        },
      ],
      searchFilter: Prisma.empty,
      orderBy: Prisma.empty,
    });
    expect(users.length).toBeLessThanOrEqual(1);
    return users[0]?.role;
  };

  it("leaves out a user whose org role is AI Gateway, which grants nothing on projects", async () => {
    const { org, project } = await createOrgAndProject();
    const userId = await createMember(org.id, project.id, {
      orgRole: "AI_GATEWAY",
    });
    expect(await roleOf(org.id, project.id, userId)).toBeUndefined();
  });

  it("gives an AI Gateway org member their project role", async () => {
    const { org, project } = await createOrgAndProject();
    const userId = await createMember(org.id, project.id, {
      orgRole: "AI_GATEWAY",
      projectRole: "VIEWER",
    });
    expect(await roleOf(org.id, project.id, userId)).toBe("VIEWER");
  });

  it("adds nothing for a group's AI Gateway org role", async () => {
    const { org, project } = await createOrgAndProject();
    const noneUser = await createMember(org.id, project.id, {
      orgRole: "NONE",
      groups: [[{ ownerId: OrganizationId(org.id), role: "AI_GATEWAY" }]],
    });
    const viewer = await createMember(org.id, project.id, {
      orgRole: "VIEWER",
      groups: [[{ ownerId: OrganizationId(org.id), role: "AI_GATEWAY" }]],
    });
    expect(await roleOf(org.id, project.id, noneUser)).toBeUndefined();
    expect(await roleOf(org.id, project.id, viewer)).toBe("VIEWER");
  });

  it("keeps the membership role of a user who owns an AI Gateway API key", async () => {
    const { org, project } = await createOrgAndProject();
    const userId = await createMember(org.id, project.id, {
      orgRole: "MEMBER",
    });
    await createApiKey(prisma, {
      tenant: OrganizationId(org.id),
      scope: UserId(userId),
      role: SystemRoleId("AI_GATEWAY"),
      createdBy: UserId(userId),
    });
    expect(await roleOf(org.id, project.id, userId)).toBe("MEMBER");
  });

  it("includes a user who reaches the project only through a group's project role", async () => {
    const { org, project } = await createOrgAndProject();
    const userId = await createMember(org.id, project.id, {
      orgRole: "NONE",
      groups: [[{ ownerId: ProjectId(project.id), role: "VIEWER" }]],
    });
    expect(await roleOf(org.id, project.id, userId)).toBe("VIEWER");
  });

  it("includes a user who reaches the project through a group's org role", async () => {
    const { org, project } = await createOrgAndProject();
    const userId = await createMember(org.id, project.id, {
      orgRole: "NONE",
      groups: [[{ ownerId: OrganizationId(org.id), role: "MEMBER" }]],
    });
    expect(await roleOf(org.id, project.id, userId)).toBe("MEMBER");
  });

  it("leaves out a user whose group has a role only on another project", async () => {
    const { org, project } = await createOrgAndProject();
    const other = await prisma.project.create({
      data: { id: v4(), name: v4(), orgId: org.id },
    });
    const userId = await createMember(org.id, project.id, {
      orgRole: "NONE",
      groups: [[{ ownerId: ProjectId(other.id), role: "ADMIN" }]],
    });
    expect(await roleOf(org.id, project.id, userId)).toBeUndefined();
  });

  it("leaves out a user whose group role has expired", async () => {
    const { org, project } = await createOrgAndProject();
    const userId = await createMember(org.id, project.id, {
      orgRole: "NONE",
      groups: [
        [
          {
            ownerId: OrganizationId(org.id),
            role: "ADMIN",
            expiresAt: new Date(Date.now() - 60_000),
          },
        ],
      ],
    });
    expect(await roleOf(org.id, project.id, userId)).toBeUndefined();
  });

  it("adds a group's org role on top of a direct project downgrade", async () => {
    const { org, project } = await createOrgAndProject();
    const userId = await createMember(org.id, project.id, {
      orgRole: "MEMBER",
      projectRole: "VIEWER",
      groups: [[{ ownerId: OrganizationId(org.id), role: "ADMIN" }]],
    });
    expect(await roleOf(org.id, project.id, userId)).toBe("ADMIN");
  });

  it("adds a group's project role on top of a direct project NONE", async () => {
    const { org, project } = await createOrgAndProject();
    const userId = await createMember(org.id, project.id, {
      orgRole: "MEMBER",
      projectRole: "NONE",
      groups: [[{ ownerId: ProjectId(project.id), role: "VIEWER" }]],
    });
    expect(await roleOf(org.id, project.id, userId)).toBe("VIEWER");
  });

  it("never lowers the direct role with a lower group role", async () => {
    const { org, project } = await createOrgAndProject();
    const userId = await createMember(org.id, project.id, {
      orgRole: "MEMBER",
      groups: [[{ ownerId: ProjectId(project.id), role: "VIEWER" }]],
    });
    expect(await roleOf(org.id, project.id, userId)).toBe("MEMBER");
  });

  it("keeps a group's org role where the same group has a lower project role", async () => {
    const { org, project } = await createOrgAndProject();
    const userId = await createMember(org.id, project.id, {
      orgRole: "NONE",
      groups: [
        [
          { ownerId: OrganizationId(org.id), role: "ADMIN" },
          { ownerId: ProjectId(project.id), role: "VIEWER" },
        ],
      ],
    });
    expect(await roleOf(org.id, project.id, userId)).toBe("ADMIN");
  });

  it("lists a user in several groups once, with the highest role, and counts them once", async () => {
    const { org, project } = await createOrgAndProject();
    const userId = await createMember(org.id, project.id, {
      orgRole: "VIEWER",
      groups: [
        [{ ownerId: ProjectId(project.id), role: "MEMBER" }],
        [{ ownerId: OrganizationId(org.id), role: "ADMIN" }],
      ],
    });
    expect(await roleOf(org.id, project.id, userId)).toBe("ADMIN");
    expect(
      await getUserProjectRolesCount({
        projectId: project.id,
        orgId: org.id,
        filterCondition: [],
        searchFilter: Prisma.empty,
      }),
    ).toBe(1);
  });

  it("applies the search and user filters to group-only users", async () => {
    const { org, project } = await createOrgAndProject();
    const groupOnly = await createMember(org.id, project.id, {
      orgRole: "NONE",
      groups: [[{ ownerId: ProjectId(project.id), role: "VIEWER" }]],
    });
    const { name } = await prisma.user.findUniqueOrThrow({
      where: { id: groupOnly },
    });
    const list = (searchFilter: Prisma.Sql, excluded: string[] = []) =>
      getUserProjectRoles({
        projectId: project.id,
        orgId: org.id,
        filterCondition: excluded.length
          ? [
              {
                column: "userId",
                operator: "none of",
                value: excluded,
                type: "stringOptions",
              },
            ]
          : [],
        searchFilter,
        orderBy: Prisma.empty,
      });

    expect(
      (await list(Prisma.sql` AND u.name ILIKE ${`%${name}%`}`)).map(
        (u) => u.id,
      ),
    ).toEqual([groupOnly]);
    expect(
      await list(Prisma.sql` AND u.name ILIKE ${"%no-such-user%"}`),
    ).toEqual([]);
    expect(await list(Prisma.empty, [groupOnly])).toEqual([]);
  });
});
