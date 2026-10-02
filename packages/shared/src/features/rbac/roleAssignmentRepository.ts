import {
  type PrismaClient,
  type Prisma,
  type RoleAssignment as StoredRoleAssignment,
} from "@prisma/client";
import {
  InternalServerError,
  InvalidRequestError,
  NotImplementedError,
} from "../../errors";
import { withTransaction } from "../../server/utils/withTransaction";
import {
  systemRoleAccessRights,
  type SystemRoleDefinition,
} from "./systemRoleAccessRights";

import {
  ApiKeyId,
  OrganizationId,
  ProjectId,
  SystemRoleId,
  UserId,
  hasApiKeyKind,
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

/** An assignment with its system-role definition attached. */
export type RoleAssignmentWithRole = RoleAssignment & {
  role: SystemRoleDefinition;
};

/** Loads a principal's assignments with their system-role definitions. */
export async function getRoleAssignmentsForPrincipal(
  tx: Tx,
  principalId: PrincipalId,
): Promise<RoleAssignmentWithRole[]> {
  const assignments = await tx.roleAssignment.findMany({
    where: principalFields(principalId),
  });
  return assignments.map(toRoleAssignment);
}

/** assignRole persists the assignment, deriving the owner's tenant from the database. */
export async function assignRole(
  tx: Tx,
  ra: Omit<RoleAssignment, "id" | "createdAt" | "updatedAt" | "tenantId">,
): Promise<void> {
  const tenantId = await resolveTenant(tx, ra.ownerId);
  await createRoleAssignment(tx, { ...ra, tenantId });
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
  throw new InvalidRequestError("owner must be an organization or project");
}

/** createRoleAssignment persists a system-role assignment; custom roles are a later ticket. */
async function createRoleAssignment(
  tx: Tx,
  ra: Omit<RoleAssignment, "id" | "createdAt" | "updatedAt">,
): Promise<void> {
  if (hasSystemRoleKind(ra.roleId)) {
    await tx.roleAssignment.create({
      data: {
        orgId: untag(ra.tenantId),
        ...principalFields(ra.principalId),
        ...ownerFields(ra.ownerId),
        systemRole: toSystemRole(ra.roleId),
      },
    });
  } else {
    throw new NotImplementedError("custom roles not yet supported");
  }
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

/** toRoleAssignment restores the tagged domain identifiers from foreign keys. */
function toRoleAssignment(
  assignment: StoredRoleAssignment,
): RoleAssignmentWithRole {
  return {
    id: assignment.id,
    tenantId: OrganizationId(assignment.orgId),
    principalId: toPrincipalId(assignment),
    ownerId: toOwnerId(assignment),
    roleId: SystemRoleId(assignment.systemRole),
    tags: [],
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
    role: systemRoleAccessRights[assignment.systemRole],
  };
}

/** toPrincipalId tags the populated principal foreign key. */
function toPrincipalId(assignment: StoredRoleAssignment): PrincipalId {
  if (assignment.principalUserId !== null)
    return UserId(assignment.principalUserId);
  if (assignment.principalApiKeyId !== null)
    return ApiKeyId(assignment.principalApiKeyId);
  throw new InternalServerError("role assignment requires a principal");
}

/** toOwnerId tags the populated owner foreign key. */
function toOwnerId(assignment: StoredRoleAssignment): OwnerId {
  if (assignment.ownerProjectId !== null)
    return ProjectId(assignment.ownerProjectId);
  if (assignment.ownerOrgId !== null)
    return OrganizationId(assignment.ownerOrgId);
  throw new InternalServerError("role assignment requires an owner");
}
