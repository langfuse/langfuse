/* eslint-disable @typescript-eslint/no-use-before-define */
import {
  SystemRole,
  type Prisma,
  type RoleAssignment as StoredRoleAssignment,
} from "@prisma/client";

import { InvalidRequestError, NotImplementedError } from "../../errors";
import { withTransaction } from "../../server/utils/withTransaction";
import {
  hasApiKeyKind,
  hasOrganizationKind,
  hasSystemRoleKind,
  hasUserKind,
  OrganizationId,
  ProjectId,
  SystemRoleId,
  untag,
  type PrincipalId,
  type OwnerId,
  type RoleAssignment,
  type RoleId,
  type TenantId,
  type UserId,
} from "./types";

/** getRoleAssignmentsForPrincipal loads a principal's stored assignments, backfilling a user without any from their memberships. */
export async function getRoleAssignmentsForPrincipal(
  prisma: Prisma.TransactionClient,
  principalId: PrincipalId,
): Promise<StoredRoleAssignment[]> {
  const assignments = await findRoleAssignments(prisma, principalId);
  if (assignments.length > 0 || !hasUserKind(principalId)) return assignments;
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- Compatibility until the next major version.
  await backfillUserRoleAssignments(prisma, principalId);
  return await findRoleAssignments(prisma, principalId);
}

/** assignRole persists a system-role assignment in the supplied tenant. */
export async function assignRole(
  prisma: Prisma.TransactionClient,
  ra: Omit<RoleAssignment, "id" | "createdAt" | "updatedAt">,
): Promise<StoredRoleAssignment> {
  const roleFields = validateRole(ra.roleId);
  return await withTransaction(prisma, async (tx) => {
    const ownerAndTenantFields = await validateTenancy(
      tx,
      ra.tenantId,
      ra.ownerId,
    );
    return await tx.roleAssignment.create({
      data: {
        ...ownerAndTenantFields,
        ...principalFields(ra.principalId),
        ...roleFields,
      },
    });
  });
}

/** replaceRolesForPrincipal revokes all existing roles for a principal on an owner before assigning the principal a new role. */
export async function replaceRolesForPrincipal(
  prisma: Prisma.TransactionClient,
  ra: Omit<RoleAssignment, "id" | "createdAt" | "updatedAt">,
): Promise<StoredRoleAssignment> {
  return await withTransaction(prisma, async (tx) => {
    await revokeRolesForPrincipal(tx, {
      tenantId: ra.tenantId,
      principalId: ra.principalId,
      ownerId: ra.ownerId,
    });
    return await assignRole(tx, ra);
  });
}

/** revokeRolesForPrincipal removes a principal's assignments in a tenant, optionally limited to one owner. */
export async function revokeRolesForPrincipal(
  prisma: Prisma.TransactionClient,
  {
    tenantId,
    principalId,
    ownerId,
  }: { tenantId: TenantId; principalId: PrincipalId; ownerId?: OwnerId },
): Promise<void> {
  await prisma.roleAssignment.deleteMany({
    where: { orgId: untag(tenantId), principalId, ownerId },
  });
}

/** revokeUserRoles removes every user's assignments on an owner. */
export async function revokeUserRoles(
  prisma: Prisma.TransactionClient,
  { ownerId }: { ownerId: OwnerId },
): Promise<void> {
  await prisma.roleAssignment.deleteMany({
    where: { ownerId, userId: { not: null } },
  });
}

/** transferApiKeyRoles moves an owner's api-key assignments to the tenant that now holds the owner. */
export async function transferApiKeyRoles(
  prisma: Prisma.TransactionClient,
  { ownerId, newTenantId }: { ownerId: OwnerId; newTenantId: TenantId },
): Promise<void> {
  await withTransaction(prisma, async (tx) => {
    await validateTenancy(tx, newTenantId, ownerId);
    await tx.roleAssignment.updateMany({
      where: { ownerId, apiKeyId: { not: null } },
      data: { orgId: untag(newTenantId) },
    });
  });
}

/** findRoleAssignments reads a principal's stored assignments. */
async function findRoleAssignments(
  prisma: Prisma.TransactionClient,
  principalId: PrincipalId,
): Promise<StoredRoleAssignment[]> {
  return await prisma.roleAssignment.findMany({ where: { principalId } });
}

/**
 * backfillUserRoleAssignments assigns a user without assignments their membership roles while holding the memberships against concurrent writes.
 * @deprecated RoleAssignment backfill will be removed in the next major version.
 */
async function backfillUserRoleAssignments(
  prisma: Prisma.TransactionClient,
  principalId: UserId,
): Promise<void> {
  await withTransaction(prisma, async (tx) => {
    await lockMemberships(tx, principalId);
    const assignments = await findRoleAssignments(tx, principalId);
    if (assignments.length > 0) return;
    const data: Prisma.RoleAssignmentCreateManyInput[] = [];
    for (const ra of await getMembershipRoles(tx, principalId)) {
      data.push({
        ...(await validateTenancy(tx, ra.tenantId, ra.ownerId)),
        ...principalFields(ra.principalId),
        ...validateRole(ra.roleId),
      });
    }
    await tx.roleAssignment.createMany({ data, skipDuplicates: true });
  });
}

/** lockMemberships share-locks a user's memberships until the transaction ends. */
async function lockMemberships(
  tx: Prisma.TransactionClient,
  principalId: UserId,
): Promise<void> {
  const userId = untag(principalId);
  await tx.$queryRaw`
    SELECT id FROM organization_memberships WHERE user_id = ${userId} FOR SHARE
  `;
  await tx.$queryRaw`
    SELECT project_id FROM project_memberships WHERE user_id = ${userId} FOR SHARE
  `;
}

/** getMembershipRoles maps a user's org and project memberships to the role assignments they imply. */
async function getMembershipRoles(
  prisma: Prisma.TransactionClient,
  principalId: UserId,
): Promise<MembershipRole[]> {
  const userId = untag(principalId);
  const [orgMemberships, projectMemberships] = await Promise.all([
    prisma.organizationMembership.findMany({
      where: { userId },
      select: { orgId: true, role: true },
    }),
    prisma.projectMembership.findMany({
      where: { userId },
      select: {
        projectId: true,
        role: true,
        project: { select: { orgId: true } },
      },
    }),
  ]);
  return [
    ...orgMemberships.map(({ orgId, role }) => ({
      tenantId: OrganizationId(orgId),
      ownerId: OrganizationId(orgId),
      principalId,
      roleId: SystemRoleId(role),
      tags: [],
    })),
    ...projectMemberships.map(({ projectId, role, project }) => ({
      tenantId: OrganizationId(project.orgId),
      ownerId: ProjectId(projectId),
      principalId,
      roleId: SystemRoleId(role),
      tags: [],
    })),
  ];
}

/** validateTenancy holds project ownership stable until the transaction ends. */
async function validateTenancy(
  tx: Prisma.TransactionClient,
  tenantId: TenantId,
  ownerId: OwnerId,
) {
  const orgId = untag(tenantId);
  if (hasOrganizationKind(ownerId)) {
    if (ownerId !== tenantId) {
      throw new InvalidRequestError(
        "Role assignment owner must belong to its tenant",
      );
    }
    return { orgId, ownerId, projectId: null };
  }
  const projectId = untag(ownerId);
  const projects = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM projects
    WHERE id = ${projectId} AND org_id = ${orgId}
    FOR SHARE
  `;
  if (projects.length === 0) {
    throw new InvalidRequestError(
      "Role assignment owner must belong to its tenant",
    );
  }
  return { orgId, ownerId, projectId };
}

/** principalFields pairs a tagged principal with its foreign key. */
function principalFields(principalId: PrincipalId) {
  return hasApiKeyKind(principalId)
    ? { principalId, apiKeyId: untag(principalId) }
    : { principalId, userId: untag(principalId) };
}

/** validateRole rejects unsupported roles and returns their storage fields. */
function validateRole(roleId: RoleId) {
  if (!hasSystemRoleKind(roleId)) {
    throw new NotImplementedError("custom roles not yet supported");
  }
  const systemRole = Object.values(SystemRole).find(
    (role) => role === untag(roleId),
  );
  if (systemRole === undefined) {
    throw new InvalidRequestError("Unknown system role");
  }
  return { roleId, systemRole };
}

type MembershipRole = Omit<RoleAssignment, "id" | "createdAt" | "updatedAt">;
