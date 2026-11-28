import { type Session } from "next-auth";
import {
  GroupSource,
  Role,
  type Prisma,
  type prisma,
} from "@langfuse/shared/src/db";
import { groupRoleGrants } from "@langfuse/shared/rbac";
import {
  ForbiddenError,
  LangfuseNotFoundError,
  hasProjectAccessByRole,
  projectRoleAccessRights,
} from "@langfuse/shared";
import { hasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  addGroupMembers,
  deleteGroup,
  groupMemberUserIds,
  removeGroupMembers,
  roleOf,
  setGroupRole,
  toGroupRoles,
} from "@/src/ee/features/groups/server/groupService";
import {
  auditLog,
  type AuditLogActor,
} from "@/src/features/audit-logs/auditLog";
import { evictUserAccessCaches } from "@/src/features/rbac/server/evictUserAccessCaches";

// Implementation of the groups tRPC router. Access and entitlement checks live in
// web/src/features/groups/server/groupsRouter.ts and must run before any function here.

type Db = typeof prisma;
type GroupSession = Session &
  Extract<AuditLogActor, { session: unknown }>["session"];

const groupRoleAssignmentsSelect = {
  select: { projectId: true, systemRole: true },
} as const;

function throwIfGroupNotFound<T>(group: T | null): asserts group is T {
  if (!group) {
    throw new LangfuseNotFoundError("Group not found");
  }
}

const editableGroupSelect = {
  id: true,
  displayName: true,
  externalId: true,
  source: true,
} as const;

/** The IdP owns SCIM groups' name, members and existence (the next sync would undo edits); roles stay editable since IdPs never send them. */
async function findEditableGroupOrThrow(
  db: Db,
  orgId: string,
  groupId: string,
) {
  const group = await db.group.findFirst({
    where: { id: groupId, orgId },
    select: editableGroupSelect,
  });
  throwIfGroupNotFound(group);
  if (group.source === GroupSource.SCIM) {
    throw new ForbiddenError(
      "This group is managed in your identity provider and read-only in Langfuse.",
    );
  }
  return group;
}

/** Project admins may only grant or revoke a project role whose every permission they hold on the project. */
function throwIfRoleNotCovered(
  session: Session,
  projectId: string,
  role: Role,
) {
  const covered = projectRoleAccessRights[role].every((scope) =>
    hasProjectAccess({ session, projectId, scope }),
  );
  if (!covered) {
    throw new ForbiddenError(
      "You cannot grant/edit a role higher than your own",
    );
  }
}

export async function listOrgMembersForGroups(db: Db, orgId: string) {
  const memberships = await db.organizationMembership.findMany({
    where: { orgId },
    select: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { user: { email: "asc" } },
  });
  return memberships.map(({ user }) => user);
}

export async function createGroup(
  db: Db,
  session: GroupSession,
  input: { orgId: string; displayName: string },
) {
  return db.$transaction(async (tx) => {
    const group = await tx.group.create({
      data: {
        orgId: input.orgId,
        displayName: input.displayName,
        source: GroupSource.MANUAL,
      },
      select: { id: true, displayName: true, source: true },
    });
    await auditLog(
      {
        session,
        resourceType: "group",
        resourceId: group.id,
        action: "create",
        after: group,
      },
      tx,
    );
    return group;
  });
}

export async function renameGroup(
  db: Db,
  session: GroupSession,
  input: { orgId: string; groupId: string; displayName: string },
) {
  const before = await findEditableGroupOrThrow(db, input.orgId, input.groupId);
  return db.$transaction(async (tx) => {
    const after = await tx.group.update({
      where: { id: before.id },
      data: { displayName: input.displayName },
      select: editableGroupSelect,
    });
    await auditLog(
      {
        session,
        resourceType: "group",
        resourceId: before.id,
        action: "update",
        before,
        after,
      },
      tx,
    );
    return after;
  });
}

export async function deleteEditableGroup(
  db: Db,
  session: GroupSession,
  input: { orgId: string; groupId: string },
) {
  const group = await findEditableGroupOrThrow(db, input.orgId, input.groupId);
  const userIds = await db.$transaction(async (tx) => {
    const userIds = await groupMemberUserIds(tx, group.id);
    const roles = await deleteGroup(tx, { id: group.id });
    await auditLog(
      {
        session,
        resourceType: "group",
        resourceId: group.id,
        action: "delete",
        before: { ...group, ...roles },
      },
      tx,
    );
    return userIds;
  });
  await evictUserAccessCaches(db, { orgId: input.orgId, userIds });
}

/** Group roles are capped at ADMIN and the caller needs groups:CUD, so this grants no more than the caller could directly. */
export async function addMembersToGroup(
  db: Db,
  session: GroupSession,
  input: { orgId: string; groupId: string; userIds: string[] },
) {
  const group = await findEditableGroupOrThrow(db, input.orgId, input.groupId);
  const userIds = [...new Set(input.userIds)];
  await db.$transaction(async (tx) => {
    await addGroupMembers(tx, {
      orgId: input.orgId,
      groupId: group.id,
      userIds,
    });
    await auditLog(
      {
        session,
        resourceType: "group",
        resourceId: group.id,
        action: "addMembers",
        after: { userIds },
      },
      tx,
    );
  });
  await evictUserAccessCaches(db, { orgId: input.orgId, userIds });
}

export async function removeMemberFromGroup(
  db: Db,
  session: GroupSession,
  input: { orgId: string; groupId: string; userId: string },
) {
  const group = await findEditableGroupOrThrow(db, input.orgId, input.groupId);
  await db.$transaction(async (tx) => {
    await removeGroupMembers(tx, {
      groupId: group.id,
      userIds: [input.userId],
    });
    await auditLog(
      {
        session,
        resourceType: "group",
        resourceId: group.id,
        action: "removeMember",
        before: { userId: input.userId },
      },
      tx,
    );
  });
  await evictUserAccessCaches(db, {
    orgId: input.orgId,
    userIds: [input.userId],
  });
}

export async function listGroups(db: Db, orgId: string) {
  const groups = await db.group.findMany({
    where: { orgId },
    orderBy: [{ displayName: "asc" }, { id: "asc" }],
    include: {
      roleAssignments: groupRoleAssignmentsSelect,
      members: {
        orderBy: { createdAt: "asc" },
        include: {
          organizationMembership: {
            select: {
              role: true,
              user: {
                select: { id: true, name: true, email: true, image: true },
              },
              groupMemberships: {
                select: {
                  group: {
                    select: {
                      id: true,
                      displayName: true,
                      roleAssignments: {
                        where: { projectId: null },
                        select: { systemRole: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  return groups.map((group) => ({
    id: group.id,
    displayName: group.displayName,
    externalId: group.externalId,
    source: group.source,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    ...toGroupRoles(group.roleAssignments),
    members: group.members.map(({ organizationMembership, createdAt }) => {
      const groupOrgRoles = groupRoleGrants(
        organizationMembership.groupMemberships.map(({ group }) => group),
      ).map(({ group, role }) => ({
        groupId: group.id,
        groupName: group.displayName,
        role,
      }));
      return {
        userId: organizationMembership.user.id,
        name: organizationMembership.user.name,
        email: organizationMembership.user.email,
        image: organizationMembership.user.image,
        directOrgRole: organizationMembership.role,
        groupOrgRoles,
        addedAt: createdAt,
      };
    }),
  }));
}

export async function setGroupOrgRole<R extends Role | null>(
  db: Db,
  session: GroupSession,
  input: { orgId: string; groupId: string; role: R },
) {
  const group = await db.group.findFirst({
    where: { id: input.groupId, orgId: input.orgId },
    select: {
      id: true,
      roleAssignments: {
        where: { projectId: null },
        select: { systemRole: true },
      },
    },
  });
  throwIfGroupNotFound(group);
  const before = roleOf(group.roleAssignments[0]);

  await db.$transaction(async (tx) => {
    await setGroupRole(tx, {
      orgId: input.orgId,
      groupId: group.id,
      projectId: null,
      role: input.role,
    });
    await auditLog(
      {
        session,
        resourceType: "group",
        resourceId: group.id,
        action: "updateOrgRole",
        before: { role: before },
        after: { role: input.role },
      },
      tx,
    );
  });
  await evictUserAccessCaches(db, {
    orgId: input.orgId,
    userIds: await groupMemberUserIds(db, group.id),
  });
  return { role: input.role };
}

/** listProjectGroups lists a project's groups with their members and roles there: every group of the org, or only those with access to the project. */
export async function listProjectGroups(
  db: Db,
  query: { orgId: string; projectId: string },
  showAllOrgGroups = true,
) {
  const conditions: Prisma.GroupWhereInput[] = [];

  // restrict to only groups with a role in the project if showAllOrgGroups is false
  if (!showAllOrgGroups) {
    const rolesWithoutProjectRead = Object.values(Role).filter(
      (role) => !hasProjectAccessByRole({ role, scope: "project:read" }),
    );
    conditions.push({
      // either org level role or project level role
      roleAssignments: {
        some: {
          OR: [{ projectId: null }, { projectId: query.projectId }],
          systemRole: { notIn: rolesWithoutProjectRead },
        },
      },
    });
  }

  const groups = await db.group.findMany({
    where: { orgId: query.orgId, AND: conditions },
    orderBy: [{ displayName: "asc" }, { id: "asc" }],
    select: {
      id: true,
      displayName: true,
      externalId: true,
      source: true,
      _count: { select: { members: true } },
      members: {
        orderBy: { createdAt: "asc" },
        select: {
          organizationMembership: {
            select: {
              user: {
                select: { id: true, name: true, email: true, image: true },
              },
            },
          },
        },
      },
      roleAssignments: {
        where: {
          OR: [{ projectId: null }, { projectId: query.projectId }],
        },
        select: { projectId: true, systemRole: true },
      },
    },
  });

  return groups.map((group) => ({
    id: group.id,
    displayName: group.displayName,
    externalId: group.externalId,
    source: group.source,
    memberCount: group._count.members,
    members: group.members.map(({ organizationMembership: { user } }) => ({
      userId: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
    })),
    orgRole: roleOf(group.roleAssignments.find((a) => a.projectId === null)),
    projectRole: roleOf(
      group.roleAssignments.find((a) => a.projectId === query.projectId),
    ),
  }));
}

export async function setGroupProjectRole<R extends Role | null>(
  db: Db,
  session: GroupSession,
  input: { projectId: string; groupId: string; role: R },
) {
  const orgId = session.orgId;
  const group = await db.group.findFirst({
    where: { id: input.groupId, orgId },
    select: {
      id: true,
      roleAssignments: {
        where: { projectId: input.projectId },
        select: { systemRole: true },
      },
    },
  });
  throwIfGroupNotFound(group);
  const before = roleOf(group.roleAssignments[0]);

  if (before) throwIfRoleNotCovered(session, input.projectId, before);
  if (input.role) {
    throwIfRoleNotCovered(session, input.projectId, input.role);
  }

  await db.$transaction(async (tx) => {
    await setGroupRole(tx, {
      orgId,
      groupId: group.id,
      projectId: input.projectId,
      role: input.role,
    });
    await auditLog(
      {
        session,
        resourceType: "group",
        resourceId: group.id,
        action: "updateProjectRole",
        before: { projectId: input.projectId, role: before },
        after: { projectId: input.projectId, role: input.role },
      },
      tx,
    );
  });
  await evictUserAccessCaches(db, {
    orgId,
    userIds: await groupMemberUserIds(db, group.id),
  });
  return { projectId: input.projectId, role: input.role };
}
