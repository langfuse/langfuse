import { type PrismaClient, type Prisma } from "@prisma/client";

import {
  hasOrganizationKind,
  hasSystemRoleKind,
  toSystemRole,
  untag,
  type OwnerId,
  type PrincipalId,
  type ProjectId,
  type RoleAssignment,
  type RoleId,
  type TenantId,
} from "../../features/rbac/tags";

type Tx = PrismaClient | Prisma.TransactionClient;

/** assertOrganizationKind rejects a tenant that is not an organization. */
function assertOrganizationKind(tenantId: TenantId): void {
  if (!hasOrganizationKind(tenantId))
    throw new Error("tenant must be an organization");
}

/** assertOwnerMatchesTenant rejects an org owner that differs from its tenant. */
function assertOwnerMatchesTenant(
  ra: Pick<RoleAssignment, "ownerId" | "tenantId">,
): void {
  if (ra.ownerId !== ra.tenantId)
    throw new Error("organization owner must equal its tenant");
}

/** assertProjectInOrganization rejects a project owner outside its tenant org. */
async function assertProjectInOrganization(
  tx: Tx,
  project: ProjectId,
  org: TenantId,
): Promise<void> {
  await tx.project.findFirstOrThrow({
    where: { id: untag(project), orgId: untag(org) },
  });
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

/** assignRole validates tenant/owner coherence, then persists the assignment. */
export async function assignRole(
  tx: Tx,
  ra: Omit<RoleAssignment, "id" | "createdAt" | "updatedAt">,
): Promise<void> {
  assertOrganizationKind(ra.tenantId);
  if (hasOrganizationKind(ra.ownerId)) assertOwnerMatchesTenant(ra);
  else await assertProjectInOrganization(tx, ra.ownerId, ra.tenantId);
  await createRoleAssignment(tx, ra);
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
