import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma } from "@langfuse/shared/src/db";
import { Role } from "@langfuse/shared";
import type { Session } from "next-auth";
import { v4 as uuidv4 } from "uuid";

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
    data: { orgId: org.id, displayName: "engineering" },
  });

  const session = {
    expires: "1",
    user: {
      id: uuidv4(),
      email: "owner@example.com",
      name: "Owner",
      canCreateOrganizations: true,
      admin: false,
      featureFlags: testFeatureFlags(),
      organizations: [
        {
          id: org.id,
          name: org.name,
          role: Role.OWNER,
          plan: "cloud:enterprise",
          metadata: {},
          projects: [],
        },
      ],
    },
    environment: {},
  } as unknown as Session;
  const ctx = createInnerTRPCContext({ session, headers: {} });
  const caller = appRouter.createCaller({ ...ctx, prisma });

  const addOrgMember = async (orgId: string) => {
    const user = await prisma.user.create({
      data: { email: `groups-${uuidv4()}@example.com` },
    });
    await prisma.organizationMembership.create({
      data: { orgId, userId: user.id, role: Role.NONE },
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
    await caller.groups.setRoleAssignments({
      orgId: org.id,
      groupId: group.id,
      orgRole: Role.VIEWER,
      projectRoles: [{ projectId: project.id, role: Role.ADMIN }],
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
});

describe("groups.setRoleAssignments", () => {
  it("stores an org role and project roles as group role assignments", async () => {
    const { org, project, group, caller } = await prepare();

    await caller.groups.setRoleAssignments({
      orgId: org.id,
      groupId: group.id,
      orgRole: Role.VIEWER,
      projectRoles: [{ projectId: project.id, role: Role.ADMIN }],
    });

    expect(await storedRoles(group.id)).toEqual([
      {
        projectId: project.id,
        systemRole: "ADMIN",
        principalId: `group/${group.id}`,
      },
      {
        projectId: null,
        systemRole: "VIEWER",
        principalId: `group/${group.id}`,
      },
    ]);
    const [listed] = await caller.groups.list({ orgId: org.id });
    expect(listed).toMatchObject({
      orgRole: "VIEWER",
      projectRoles: [{ projectId: project.id, role: "ADMIN" }],
    });
  });

  it("replaces previous assignments", async () => {
    const { org, project, group, caller } = await prepare();
    const set = (input: {
      orgRole: "MEMBER" | null;
      projectRoles: { projectId: string; role: "VIEWER" }[];
    }) =>
      caller.groups.setRoleAssignments({
        orgId: org.id,
        groupId: group.id,
        ...input,
      });

    await set({
      orgRole: "MEMBER",
      projectRoles: [{ projectId: project.id, role: "VIEWER" }],
    });
    await set({ orgRole: null, projectRoles: [] });

    expect(await storedRoles(group.id)).toEqual([]);
  });

  it("rejects OWNER", async () => {
    const { org, group, caller } = await prepare();

    await expect(
      caller.groups.setRoleAssignments({
        orgId: org.id,
        groupId: group.id,
        orgRole: "OWNER" as "ADMIN",
        projectRoles: [],
      }),
    ).rejects.toThrow();
  });

  it("rejects a project of another organization and keeps the old roles", async () => {
    const { org, otherProject, group, caller } = await prepare();
    await caller.groups.setRoleAssignments({
      orgId: org.id,
      groupId: group.id,
      orgRole: "MEMBER",
      projectRoles: [],
    });

    await expect(
      caller.groups.setRoleAssignments({
        orgId: org.id,
        groupId: group.id,
        orgRole: "MEMBER",
        projectRoles: [{ projectId: otherProject.id, role: "ADMIN" }],
      }),
    ).rejects.toThrow("Role assignment owner must belong to its tenant");

    expect(await storedRoles(group.id)).toEqual([
      {
        projectId: null,
        systemRole: "MEMBER",
        principalId: `group/${group.id}`,
      },
    ]);
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
    await caller.groups.setRoleAssignments({
      orgId: org.id,
      groupId: created.id,
      orgRole: Role.MEMBER,
      projectRoles: [],
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

  it("cannot touch a group of another organization", async () => {
    const { org, otherOrg, caller } = await prepare();
    const foreign = await prisma.group.create({
      data: { orgId: otherOrg.id, displayName: "foreign" },
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
