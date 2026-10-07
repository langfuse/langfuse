import {
  type PrismaClient,
  type Prisma,
  type RoleAssignment as StoredRoleAssignment,
} from "@prisma/client";
import { NotImplementedError } from "../../errors";
import { withTransaction } from "../../server/utils/withTransaction";
import {
  hasApiKeyKind,
  hasProjectKind,
  hasSystemRoleKind,
  toSystemRole,
  untag,
  type OwnerId,
  type PrincipalId,
  type RoleAssignment,
} from "./types";

type Tx = PrismaClient | Prisma.TransactionClient;

/** getRoleAssignmentsForPrincipal loads a principal's stored assignments. */
export async function getRoleAssignmentsForPrincipal(
  tx: Tx,
  principalId: PrincipalId,
): Promise<StoredRoleAssignment[]> {
  return await tx.roleAssignment.findMany({
    where: principalFields(principalId),
  });
}

/** assignRole persists a system-role assignment in the supplied tenant. */
export async function assignRole(
  tx: Tx,
  ra: Omit<RoleAssignment, "id" | "createdAt" | "updatedAt">,
): Promise<void> {
  if (!hasSystemRoleKind(ra.roleId)) {
    throw new NotImplementedError("custom roles not yet supported");
  }
  await tx.roleAssignment.create({
    data: {
      orgId: untag(ra.tenantId),
      ...principalFields(ra.principalId),
      ...ownerFields(ra.ownerId),
      systemRole: toSystemRole(ra.roleId),
    },
  });
}

/** transferRoleAssignments moves a transferred project's api-key assignments to the destination organization and drops its user assignments, mirroring the membership wipe. */
export async function transferRoleAssignments(
  prisma: Tx,
  projectId: string,
  targetOrgId: string,
): Promise<void> {
  await withTransaction(prisma, async (tx) => {
    await tx.roleAssignment.updateMany({
      where: { ownerProjectId: projectId, principalApiKeyId: { not: null } },
      data: { orgId: targetOrgId },
    });
    await tx.roleAssignment.deleteMany({
      where: { ownerProjectId: projectId, principalUserId: { not: null } },
    });
  });
}

/** principalFields selects the foreign key for a tagged principal. */
function principalFields(principalId: PrincipalId) {
  return hasApiKeyKind(principalId)
    ? { principalApiKeyId: untag(principalId) }
    : { principalUserId: untag(principalId) };
}

/** ownerFields selects the foreign key for a tagged owner. */
function ownerFields(ownerId: OwnerId) {
  return hasProjectKind(ownerId)
    ? { ownerProjectId: untag(ownerId) }
    : { ownerOrgId: untag(ownerId) };
}
