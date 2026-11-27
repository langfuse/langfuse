import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma } from "@langfuse/shared/src/db";
import { Role } from "@langfuse/shared";
import { v4 as uuidv4 } from "uuid";
import { createOrgMembership } from "@langfuse/shared/memberships";
import { assignRole } from "@langfuse/shared/rbac/server";
import {
  GroupId,
  OrganizationId,
  ProjectId,
  SystemRoleId,
} from "@langfuse/shared/rbac";
import { createSession } from "@/src/__tests__/fixtures/session-factory";

async function prepare() {
  const org = await prisma.organization.create({
    data: { name: `groups-${uuidv4()}` },
  });
  const project = await prisma.project.create({
    data: { name: "project", orgId: org.id },
  });
  const otherOrg = await prisma.organization.create({
    data: { name: `groups-other-${uuidv4()}` },
  });
  const otherProject = await prisma.project.create({
    data: { name: "other-project", orgId: otherOrg.id },
  });
  const group = await prisma.group.create({
    data: { orgId: org.id, displayName: "engineering", source: "MANUAL" },
  });

  const session = createSession({
    user: { id: uuidv4(), email: "owner@example.com", name: "Owner" },
    organizations: [
      {
        id: org.id,
        name: org.name,
        role: Role.OWNER,
        plan: "cloud:enterprise",
      },
    ],
  });
  const ctx = createInnerTRPCContext({ session, headers: {} });
  const caller = appRouter.createCaller({ ...ctx, prisma });

  const addOrgMember = async (orgId: string) => {
    const user = await prisma.user.create({
      data: { email: `groups-${uuidv4()}@example.com` },
    });
    await createOrgMembership(prisma, {
      orgId,
      userId: user.id,
      role: Role.NONE,
    });
    return user.id;
  };

  return { org, otherOrg, project, otherProject, group, caller, addOrgMember };
}

const storedRoles = (groupId: string) =>
  prisma.roleAssignment.findMany({
    where: { groupId },
    select: { projectId: true, systemRole: true, principalId: true },
    orderBy: { projectId: "asc" },
  });

describe("groups.setOrgRole", () => {
  it("changes only the org-wide role and keeps project roles", async () => {
    const { org, project, group, caller } = await prepare();
    await caller.groups.setOrgRole({
      orgId: org.id,
      groupId: group.id,
      role: Role.VIEWER,
    });
    await assignRole(prisma, {
      tenantId: OrganizationId(org.id),
      ownerId: ProjectId(project.id),
      principalId: GroupId(group.id),
      roleId: SystemRoleId(Role.ADMIN),
      tags: [],
    });
    const [listed] = await caller.groups.list({ orgId: org.id });
    expect(listed).toMatchObject({
      orgRole: "VIEWER",
      projectRoles: [{ projectId: project.id, role: "ADMIN" }],
    });

    await caller.groups.setOrgRole({
      orgId: org.id,
      groupId: group.id,
      role: Role.MEMBER,
    });
    expect(await storedRoles(group.id)).toEqual([
      {
        projectId: project.id,
        systemRole: "ADMIN",
        principalId: `group/${group.id}`,
      },
      {
        projectId: null,
        systemRole: "MEMBER",
        principalId: `group/${group.id}`,
      },
    ]);

    await caller.groups.setOrgRole({
      orgId: org.id,
      groupId: group.id,
      role: null,
    });
    expect(await storedRoles(group.id)).toEqual([
      {
        projectId: project.id,
        systemRole: "ADMIN",
        principalId: `group/${group.id}`,
      },
    ]);
  });

  it("rejects OWNER", async () => {
    const { org, group, caller } = await prepare();

    await expect(
      caller.groups.setOrgRole({
        orgId: org.id,
        groupId: group.id,
        role: "OWNER" as "ADMIN",
      }),
    ).rejects.toThrow();
  });
});

describe("groups CRUD from the UI", () => {
  it("creates a MANUAL group, renames it and deletes it with its role assignments", async () => {
    const { org, caller } = await prepare();

    const created = await caller.groups.create({
      orgId: org.id,
      displayName: "  platform  ",
    });
    expect(created).toMatchObject({
      displayName: "platform",
      source: "MANUAL",
    });

    await caller.groups.rename({
      orgId: org.id,
      groupId: created.id,
      displayName: "platform-admins",
    });
    await caller.groups.setOrgRole({
      orgId: org.id,
      groupId: created.id,
      role: Role.MEMBER,
    });
    const listed = (await caller.groups.list({ orgId: org.id })).find(
      (g) => g.id === created.id,
    );
    expect(listed).toMatchObject({
      displayName: "platform-admins",
      source: "MANUAL",
      orgRole: "MEMBER",
    });

    await caller.groups.delete({ orgId: org.id, groupId: created.id });
    expect(await prisma.group.count({ where: { id: created.id } })).toBe(0);
    expect(await storedRoles(created.id)).toEqual([]);
  });

  it("rejects an empty name", async () => {
    const { org, caller } = await prepare();
    await expect(
      caller.groups.create({ orgId: org.id, displayName: "   " }),
    ).rejects.toThrow();
  });

  it("adds and removes members", async () => {
    const { org, group, caller, addOrgMember } = await prepare();
    const alice = await addOrgMember(org.id);
    const bob = await addOrgMember(org.id);

    await caller.groups.addMembers({
      orgId: org.id,
      groupId: group.id,
      userIds: [alice, bob, alice],
    });
    // Adding an existing member is a no-op
    await caller.groups.addMembers({
      orgId: org.id,
      groupId: group.id,
      userIds: [alice],
    });
    const members = async () =>
      (await caller.groups.list({ orgId: org.id }))
        .find((g) => g.id === group.id)!
        .members.map((m) => m.userId)
        .sort();
    expect(await members()).toEqual([alice, bob].sort());

    await caller.groups.removeMember({
      orgId: org.id,
      groupId: group.id,
      userId: alice,
    });
    expect(await members()).toEqual([bob]);
  });

  it("rejects adding a user who is not an org member, and adds nobody", async () => {
    const { org, otherOrg, group, caller, addOrgMember } = await prepare();
    const alice = await addOrgMember(org.id);
    const outsider = await addOrgMember(otherOrg.id);

    await expect(
      caller.groups.addMembers({
        orgId: org.id,
        groupId: group.id,
        userIds: [alice, outsider],
      }),
    ).rejects.toThrow("Every user must be a member of the organization");
    expect(
      await prisma.groupMembership.count({ where: { groupId: group.id } }),
    ).toBe(0);
  });

  it("keeps the name and members of a SCIM group read-only but lets admins set its role", async () => {
    const { org, caller, addOrgMember } = await prepare();
    const alice = await addOrgMember(org.id);
    const scimGroup = await prisma.group.create({
      data: { orgId: org.id, displayName: "okta-admins", source: "SCIM" },
    });
    const orgMembership = await prisma.organizationMembership.findFirstOrThrow({
      where: { orgId: org.id, userId: alice },
    });
    await prisma.groupMembership.create({
      data: { groupId: scimGroup.id, orgMembershipId: orgMembership.id },
    });
    const bob = await addOrgMember(org.id);

    const synced = "This group is managed in your identity provider";
    await expect(
      caller.groups.rename({
        orgId: org.id,
        groupId: scimGroup.id,
        displayName: "renamed",
      }),
    ).rejects.toThrow(synced);
    await expect(
      caller.groups.addMembers({
        orgId: org.id,
        groupId: scimGroup.id,
        userIds: [bob],
      }),
    ).rejects.toThrow(synced);
    await expect(
      caller.groups.removeMember({
        orgId: org.id,
        groupId: scimGroup.id,
        userId: alice,
      }),
    ).rejects.toThrow(synced);
    await expect(
      caller.groups.delete({ orgId: org.id, groupId: scimGroup.id }),
    ).rejects.toThrow(synced);
    expect(await prisma.group.count({ where: { id: scimGroup.id } })).toBe(1);
    expect(
      await prisma.groupMembership.count({ where: { groupId: scimGroup.id } }),
    ).toBe(1);

    await caller.groups.setOrgRole({
      orgId: org.id,
      groupId: scimGroup.id,
      role: Role.ADMIN,
    });
    expect(await storedRoles(scimGroup.id)).toMatchObject([
      { projectId: null, systemRole: Role.ADMIN },
    ]);
  });

  it("cannot touch a group of another organization", async () => {
    const { org, otherOrg, caller } = await prepare();
    const foreign = await prisma.group.create({
      data: { orgId: otherOrg.id, displayName: "foreign", source: "SCIM" },
    });

    await expect(
      caller.groups.rename({
        orgId: org.id,
        groupId: foreign.id,
        displayName: "hijacked",
      }),
    ).rejects.toThrow("Group not found");
    await expect(
      caller.groups.delete({ orgId: org.id, groupId: foreign.id }),
    ).rejects.toThrow("Group not found");
    expect(await prisma.group.count({ where: { id: foreign.id } })).toBe(1);
  });
});

/** callerWithRoles signs in a user with `orgRole` on the org and `projectRole` on its project. */
const callerWithRoles = (
  orgId: string,
  projectId: string,
  orgRole: Role,
  projectRole?: Role,
) => {
  const session = createSession({
    organizations: [
      {
        id: orgId,
        role: orgRole,
        plan: "cloud:enterprise",
        projects: [{ id: projectId, role: projectRole }],
      },
    ],
  });
  const ctx = createInnerTRPCContext({ session, headers: {} });
  return appRouter.createCaller({ ...ctx, prisma });
};

describe("groups.projectList", () => {
  /** projectCaller signs in a user who has `orgRole` on the org and `projectRole` on its project. */
  /** groupWithRole creates a group holding `role` on `ownerId`, or no role. */
  const groupWithRole = async (
    orgId: string,
    displayName: string,
    ownerId?: OrganizationId | ProjectId,
    role?: Role,
  ) => {
    const group = await prisma.group.create({
      data: { orgId, displayName, source: "MANUAL" },
    });
    if (ownerId && role)
      await assignRole(prisma, {
        tenantId: OrganizationId(orgId),
        ownerId,
        principalId: GroupId(group.id),
        roleId: SystemRoleId(role),
        tags: [],
      });
    return group.displayName;
  };

  const setup = async () => {
    const { org, project } = await prepare();
    const otherProject = await prisma.project.create({
      data: { name: "other", orgId: org.id },
    });
    const names = [
      "engineering",
      await groupWithRole(
        org.id,
        "chatbot-team",
        ProjectId(project.id),
        Role.VIEWER,
      ),
      await groupWithRole(
        org.id,
        "everyone",
        OrganizationId(org.id),
        Role.VIEWER,
      ),
      await groupWithRole(
        org.id,
        "finance-team",
        ProjectId(otherProject.id),
        Role.ADMIN,
      ),
      await groupWithRole(
        org.id,
        "gateway-users",
        OrganizationId(org.id),
        Role.AI_GATEWAY,
      ),
    ];
    return { org, project, names };
  };

  it("shows a project-only member just the groups with access to the project", async () => {
    const { org, project } = await setup();
    const caller = callerWithRoles(org.id, project.id, Role.NONE, Role.MEMBER);

    const groups = await caller.groups.projectList({ projectId: project.id });
    expect(groups.map((g) => g.displayName)).toEqual([
      "chatbot-team",
      "everyone",
    ]);
  });

  it("shows an org member with no access to the project every group of the org", async () => {
    const { org, project, names } = await setup();
    const caller = callerWithRoles(org.id, project.id, Role.MEMBER, Role.NONE);

    const groups = await caller.groups.projectList({ projectId: project.id });
    expect(groups.map((g) => g.displayName)).toEqual(names.toSorted());
  });

  it("refuses a caller who can read neither the org's nor the project's groups", async () => {
    const { org, project } = await setup();
    const caller = callerWithRoles(org.id, project.id, Role.NONE, Role.VIEWER);

    await expect(
      caller.groups.projectList({ projectId: project.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("shows an org member every group of the org", async () => {
    const { org, project, names } = await setup();
    const caller = callerWithRoles(org.id, project.id, Role.MEMBER);

    const groups = await caller.groups.projectList({ projectId: project.id });
    expect(groups.map((g) => g.displayName)).toEqual(names.toSorted());
  });
});

describe("groups scopes", () => {
  it("lets a MEMBER read the org's groups but not change them", async () => {
    const { org, project, group } = await prepare();
    const caller = callerWithRoles(org.id, project.id, Role.MEMBER);

    expect(
      (await caller.groups.list({ orgId: org.id })).map((g) => g.id),
    ).toEqual([group.id]);
    await expect(
      caller.groups.create({ orgId: org.id, displayName: "new" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.groups.setOrgRole({
        orgId: org.id,
        groupId: group.id,
        role: Role.VIEWER,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("hides the org's groups from a VIEWER", async () => {
    const { org, project } = await prepare();
    const caller = callerWithRoles(org.id, project.id, Role.VIEWER);

    await expect(caller.groups.list({ orgId: org.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("lets a project ADMIN set a group's project role and a project MEMBER only read it", async () => {
    const { org, project, group } = await prepare();
    const admin = callerWithRoles(org.id, project.id, Role.NONE, Role.ADMIN);
    const member = callerWithRoles(org.id, project.id, Role.NONE, Role.MEMBER);

    await admin.groups.setProjectRole({
      projectId: project.id,
      groupId: group.id,
      role: Role.VIEWER,
    });
    expect(
      (await member.groups.projectList({ projectId: project.id })).map((g) => [
        g.id,
        g.projectRole,
      ]),
    ).toEqual([[group.id, Role.VIEWER]]);
    await expect(
      member.groups.setProjectRole({
        projectId: project.id,
        groupId: group.id,
        role: Role.MEMBER,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
