import { InvalidRequestError } from "@langfuse/shared";
import { type Prisma, type Role } from "@langfuse/shared/src/db";
import {
  GroupId,
  OrganizationId,
  ProjectId,
  SystemRoleId,
} from "@langfuse/shared/rbac";
import { assignRole } from "@langfuse/shared/rbac/server";

type Tx = Prisma.TransactionClient;

export async function groupMemberUserIds(
  db: Tx,
  groupId: string,
): Promise<string[]> {
  const members = await db.groupMembership.findMany({
    where: { groupId },
    select: { organizationMembership: { select: { userId: true } } },
  });
  return members.map((m) => m.organizationMembership.userId);
}

export class GroupMembersNotInOrgError extends InvalidRequestError {
  constructor(public readonly userIds: string[]) {
    super("Every user must be a member of the organization");
  }
}

export const roleOf = (assignment: { systemRole: string } | undefined) =>
  (assignment?.systemRole as Role | undefined) ?? null;

export function toGroupRoles(
  assignments: { projectId: string | null; systemRole: string }[],
) {
  return {
    orgRole: roleOf(assignments.find((a) => a.projectId === null)),
    projectRoles: assignments
      .filter((a): a is { projectId: string; systemRole: string } =>
        Boolean(a.projectId),
      )
      .map((a) => ({ projectId: a.projectId, role: a.systemRole as Role })),
  };
}

/**
 * orgMembershipIds checks that every given user is a member of orgId and
 * returns their org membership ids, which group memberships reference.
 * Throws GroupMembersNotInOrgError listing the users who are not.
 */
async function orgMembershipIds(
  tx: Tx,
  orgId: string,
  userIds: string[],
): Promise<string[]> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return [];
  const memberships = await tx.organizationMembership.findMany({
    where: { orgId, userId: { in: unique } },
    select: { id: true, userId: true },
  });
  const found = new Set(memberships.map((m) => m.userId));
  const missing = unique.filter((id) => !found.has(id));
  if (missing.length > 0) throw new GroupMembersNotInOrgError(missing);
  return memberships.map((m) => m.id);
}

export async function addGroupMembers(
  tx: Tx,
  {
    orgId,
    groupId,
    userIds,
  }: { orgId: string; groupId: string; userIds: string[] },
) {
  const ids = await orgMembershipIds(tx, orgId, userIds);
  if (ids.length === 0) return;
  await tx.groupMembership.createMany({
    data: ids.map((orgMembershipId) => ({ groupId, orgMembershipId })),
    skipDuplicates: true,
  });
}

/** No `userIds` removes every member. */
export async function removeGroupMembers(
  tx: Tx,
  { groupId, userIds }: { groupId: string; userIds?: string[] },
) {
  if (userIds?.length === 0) return;
  await tx.groupMembership.deleteMany({
    where: {
      groupId,
      ...(userIds && { organizationMembership: { userId: { in: userIds } } }),
    },
  });
}

export async function replaceGroupMembers(
  tx: Tx,
  {
    orgId,
    groupId,
    userIds,
  }: { orgId: string; groupId: string; userIds: string[] },
) {
  await orgMembershipIds(tx, orgId, userIds);
  await tx.groupMembership.deleteMany({
    where: {
      groupId,
      organizationMembership: { userId: { notIn: [...new Set(userIds)] } },
    },
  });
  await addGroupMembers(tx, { orgId, groupId, userIds });
}

/** lockGroup locks a group for the transaction so concurrent writes to its roles or members run one after another. */
export async function lockGroup(tx: Tx, groupId: string): Promise<void> {
  await tx.$queryRaw`
    SELECT id FROM groups
    WHERE id = ${groupId}
    FOR UPDATE
  `;
}

/** `projectId` null is the org role; `role` null removes it. */
export async function setGroupRole(
  tx: Tx,
  {
    orgId,
    groupId,
    projectId,
    role,
  }: {
    orgId: string;
    groupId: string;
    projectId: string | null;
    role: Role | null;
  },
) {
  await lockGroup(tx, groupId);
  await tx.roleAssignment.deleteMany({ where: { groupId, projectId } });
  if (!role) return;
  const tenantId = OrganizationId(orgId);
  // assignRole rejects projects outside the organization.
  await assignRole(tx, {
    tenantId,
    ownerId: projectId ? ProjectId(projectId) : tenantId,
    principalId: GroupId(groupId),
    roleId: SystemRoleId(role),
    tags: [],
  });
}

/** Memberships and role assignments go by FK cascade. */
export async function deleteGroup(
  tx: Tx,
  where: Prisma.GroupWhereUniqueInput & { id: string },
) {
  const assignments = await tx.roleAssignment.findMany({
    where: { groupId: where.id },
    select: { projectId: true, systemRole: true },
  });
  await tx.group.delete({ where });
  return toGroupRoles(assignments);
}
