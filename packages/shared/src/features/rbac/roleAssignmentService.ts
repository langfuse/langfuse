/* eslint-disable @typescript-eslint/no-use-before-define */
import {
  SystemRole,
  type ApiKeyScope,
  type Prisma,
  type Role,
  type RoleAssignment as StoredRoleAssignment,
} from "@prisma/client";

import { InvalidRequestError, NotImplementedError } from "../../errors";
import { lockApiKey } from "../../server/auth/apiKeys";
import { withTransaction } from "../../server/utils/withTransaction";
import { lockOrgMemberships } from "../memberships/orgMembershipRepository";
import { lockProjectMemberships } from "../memberships/projectMembershipRepository";
import {
  ApiKeyId,
  hasApiKeyKind,
  hasOrganizationKind,
  hasSystemRoleKind,
  hasUserKind,
  OrganizationId,
  ProjectId,
  SystemRoleId,
  untag,
  UserId,
  type PrincipalId,
  type OwnerId,
  type RoleAssignment,
  type RoleId,
  type TenantId,
} from "./types";

/** getRoleAssignmentsForPrincipal loads a principal's stored assignments, backfilling a principal without any from its legacy rows. */
export async function getRoleAssignmentsForPrincipal(
  prisma: Prisma.TransactionClient,
  principalId: PrincipalId,
): Promise<StoredRoleAssignment[]> {
  const assignments = await findRoleAssignments(prisma, principalId);
  if (assignments.length > 0) return assignments;
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- Compatibility until the next major version.
  await backfillRoleAssignments(prisma, principalId);
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

/** orgMembershipRole maps an organization membership to the role assignment it implies. */
export function orgMembershipRole({
  orgId,
  userId,
  role,
}: {
  orgId: string;
  userId: string;
  role: Role;
}): Omit<RoleAssignment, "id" | "createdAt" | "updatedAt"> {
  return {
    tenantId: OrganizationId(orgId),
    ownerId: OrganizationId(orgId),
    principalId: UserId(userId),
    roleId: SystemRoleId(role),
    tags: [],
  };
}

/** projectMembershipRole maps a project membership to the role assignment it implies. */
export function projectMembershipRole({
  orgId,
  projectId,
  userId,
  role,
}: {
  orgId: string;
  projectId: string;
  userId: string;
  role: Role;
}): Omit<RoleAssignment, "id" | "createdAt" | "updatedAt"> {
  return {
    tenantId: OrganizationId(orgId),
    ownerId: ProjectId(projectId),
    principalId: UserId(userId),
    roleId: SystemRoleId(role),
    tags: [],
  };
}

/** findRoleAssignments reads a principal's stored assignments. */
async function findRoleAssignments(
  prisma: Prisma.TransactionClient,
  principalId: PrincipalId,
): Promise<StoredRoleAssignment[]> {
  return await prisma.roleAssignment.findMany({ where: { principalId } });
}

/**
 * backfillRoleAssignments assigns a principal without assignments the roles its legacy rows imply while holding those rows against concurrent writes.
 * @deprecated RoleAssignment backfill will be removed in the next major version.
 */
async function backfillRoleAssignments(
  prisma: Prisma.TransactionClient,
  principalId: PrincipalId,
): Promise<void> {
  await withTransaction(prisma, async (tx) => {
    const impliedRoles = await getImpliedRoles(tx, principalId);
    const assignments = await findRoleAssignments(tx, principalId);
    if (assignments.length > 0) return;
    const data: Prisma.RoleAssignmentCreateManyInput[] = [];
    for (const ra of impliedRoles) {
      data.push({
        ...(await validateTenancy(tx, ra.tenantId, ra.ownerId)),
        ...principalFields(ra.principalId),
        ...validateRole(ra.roleId),
      });
    }
    await tx.roleAssignment.createMany({ data, skipDuplicates: true });
  });
}

/** getImpliedRoles share-locks a principal's api key or memberships and returns the role assignments they imply. */
async function getImpliedRoles(
  tx: Prisma.TransactionClient,
  principalId: PrincipalId,
): Promise<Omit<RoleAssignment, "id" | "createdAt" | "updatedAt">[]> {
  if (hasApiKeyKind(principalId)) {
    const apiKeys = await lockApiKey(tx, { apiKeyId: untag(principalId) });
    return apiKeys.map(apiKeyRole);
  }
  if (!hasUserKind(principalId)) return [];
  const userId = untag(principalId);
  const orgMemberships = await lockOrgMemberships(tx, { userId });
  const projectMemberships = await lockProjectMemberships(tx, { userId });
  return [
    ...orgMemberships.map(orgMembershipRole),
    ...projectMemberships.map(projectMembershipRole),
  ];
}

/** apiKeyRole maps an api key to the legacy role assignment its scope implies. */
function apiKeyRole({
  apiKeyId,
  scope,
  orgId,
  projectId,
}: {
  apiKeyId: string;
  scope: ApiKeyScope;
  orgId: string;
  projectId: string | null;
}): Omit<RoleAssignment, "id" | "createdAt" | "updatedAt"> {
  const principal = {
    tenantId: OrganizationId(orgId),
    principalId: ApiKeyId(apiKeyId),
    tags: [],
  };
  if (scope === "PROJECT" && projectId !== null) {
    return {
      ...principal,
      ownerId: ProjectId(projectId),
      roleId: SystemRoleId("LEGACY_PROJECT_API_KEY"),
    };
  }
  return {
    ...principal,
    ownerId: OrganizationId(orgId),
    roleId: SystemRoleId("LEGACY_ORGANIZATION_API_KEY"),
  };
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
