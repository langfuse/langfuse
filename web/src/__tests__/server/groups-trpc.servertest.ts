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

  return { org, project, otherProject, group, caller };
}

const storedRoles = (groupId: string) =>
  prisma.roleAssignment.findMany({
    where: { groupId },
    select: { projectId: true, systemRole: true, principalId: true },
    orderBy: { projectId: "asc" },
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
