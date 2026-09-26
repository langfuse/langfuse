import { type PrismaClient, type Prisma } from "@prisma/client";

import {
  ApiKeyId,
  OrganizationId,
  ProjectId,
  UserId,
  hasOrganizationKind,
  hasProjectKind,
  hasSystemRoleKind,
  toSystemRole,
  untag,
  type OwnerId,
  type PrincipalId,
  type RoleAssignment,
  type TenantId,
} from "./types";

type Tx = PrismaClient | Prisma.TransactionClient;

/** apiKeyPrincipalPrefix is the tag prefix every api-key principal id carries. */
const apiKeyPrincipalPrefix = ApiKeyId("");
/** userPrincipalPrefix is the tag prefix every user principal id carries. */
const userPrincipalPrefix = UserId("");

/** assignRole derives the owner's tenant, then persists the assignment. */
export async function assignRole(
  tx: Tx,
  ra: Omit<RoleAssignment, "id" | "createdAt" | "updatedAt" | "tenantId">,
): Promise<void> {
  const tenantId = await resolveTenant(tx, ra.ownerId);
  await createRoleAssignment(tx, { ...ra, tenantId });
}

/** revokeRolesForOwner deletes every assignment hanging off an owner, e.g. when a project or organization is deleted. */
export async function revokeRolesForOwner(
  tx: Tx,
  ownerId: OwnerId,
): Promise<void> {
  await tx.systemRoleAssignment.deleteMany({ where: { ownerId } });
}

/** revokeRolesForPrincipals deletes assignments for a set of principals, e.g. bulk key removal. */
export async function revokeRolesForPrincipals(
  tx: Tx,
  principalIds: PrincipalId[],
): Promise<void> {
  if (principalIds.length === 0) return;
  await tx.systemRoleAssignment.deleteMany({
    where: { principalId: { in: principalIds } },
  });
}

/** revokeApiKeyRolesForOwners deletes the api-key assignments hanging off a set of owners, leaving user assignments intact. */
export async function revokeApiKeyRolesForOwners(
  tx: Tx,
  ownerIds: OwnerId[],
): Promise<void> {
  if (ownerIds.length === 0) return;
  await tx.systemRoleAssignment.deleteMany({
    where: {
      ownerId: { in: ownerIds },
      principalId: { startsWith: apiKeyPrincipalPrefix },
    },
  });
}

/** transferRoleAssignments moves a transferred project's api-key assignments to the destination organization and drops its user assignments, mirroring the membership wipe. */
export async function transferRoleAssignments(
  tx: Tx,
  projectId: string,
  targetOrgId: string,
): Promise<void> {
  const ownerId = ProjectId(projectId);
  await tx.systemRoleAssignment.updateMany({
    where: { ownerId, principalId: { startsWith: apiKeyPrincipalPrefix } },
    data: { orgId: targetOrgId },
  });
  await tx.systemRoleAssignment.deleteMany({
    where: { ownerId, principalId: { startsWith: userPrincipalPrefix } },
  });
}

/** resolveTenant derives the organization that scopes an owner. */
async function resolveTenant(tx: Tx, ownerId: OwnerId): Promise<TenantId> {
  if (hasOrganizationKind(ownerId)) return OrganizationId(untag(ownerId));
  if (hasProjectKind(ownerId)) {
    const { orgId } = await tx.project.findFirstOrThrow({
      where: { id: untag(ownerId) },
      select: { orgId: true },
    });
    return OrganizationId(orgId);
  }
  throw new Error("owner must be an organization or project");
}

/** createRoleAssignment persists a system-role assignment; custom roles are a later ticket. */
async function createRoleAssignment(
  tx: Tx,
  ra: Omit<RoleAssignment, "id" | "createdAt" | "updatedAt">,
): Promise<void> {
  if (hasSystemRoleKind(ra.roleId)) {
    await tx.systemRoleAssignment.create({
      data: {
        orgId: untag(ra.tenantId),
        principalId: ra.principalId,
        ownerId: ra.ownerId,
        systemRole: toSystemRole(ra.roleId),
      },
    });
  } else {
    throw new Error("custom roles not yet supported");
  }
}
