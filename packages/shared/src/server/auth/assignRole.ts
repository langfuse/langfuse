import { type PrismaClient, type Prisma } from "@prisma/client";

import {
  OrganizationId,
  hasOrganizationKind,
  hasProjectKind,
  hasSystemRoleKind,
  toSystemRole,
  untag,
  type OwnerId,
  type PrincipalId,
  type RoleAssignment,
  type RoleId,
  type TenantId,
} from "../../features/rbac/types";

type Tx = PrismaClient | Prisma.TransactionClient;

/** assignRole derives the owner's tenant, then persists the assignment. */
export async function assignRole(
  tx: Tx,
  ra: Omit<RoleAssignment, "id" | "createdAt" | "updatedAt" | "tenantId">,
): Promise<void> {
  const tenantId = await resolveTenant(tx, ra.ownerId);
  await createRoleAssignment(tx, { ...ra, tenantId });
}

/** revokeRole deletes system-role assignments matching the given filters. */
export async function revokeRole(
  tx: Tx,
  p: { principalId: PrincipalId; ownerId?: OwnerId; roleId?: RoleId },
): Promise<void> {
  await tx.systemRoleAssignment.deleteMany({
    where: {
      principalId: p.principalId,
      ...(p.ownerId ? { ownerId: p.ownerId } : {}),
      ...(p.roleId && hasSystemRoleKind(p.roleId)
        ? { systemRole: toSystemRole(p.roleId) }
        : {}),
    },
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
