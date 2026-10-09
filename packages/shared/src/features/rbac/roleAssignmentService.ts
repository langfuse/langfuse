import {
  SystemRole,
  type ApiKey,
  type Prisma,
  type RoleAssignment as StoredRoleAssignment,
} from "@prisma/client";

import { InvalidRequestError, NotImplementedError } from "../../errors";
import { withTransaction } from "../../server/utils/withTransaction";
import {
  ApiKeyId,
  OrganizationId,
  ProjectId,
  SystemRoleId,
  hasApiKeyKind,
  hasOrganizationKind,
  hasSystemRoleKind,
  untag,
  type PrincipalId,
  type OwnerId,
  type RoleAssignment,
  type RoleId,
  type TenantId,
} from "./types";

/** getRoleAssignmentsForPrincipal loads a principal's stored assignments. */
export async function getRoleAssignmentsForPrincipal(
  tx: Prisma.TransactionClient,
  principalId: PrincipalId,
): Promise<StoredRoleAssignment[]> {
  return await tx.roleAssignment.findMany({
    where: { principalId },
  });
}

/** assignRole persists a system-role assignment in the supplied tenant. */
export async function assignRole(
  prisma: Prisma.TransactionClient,
  ra: Omit<RoleAssignment, "id" | "createdAt" | "updatedAt">,
): Promise<void> {
  const roleFields = validateRole(ra.roleId);
  await withTransaction(prisma, async (tx) => {
    const ownerAndTenantFields = await validateTenancy(
      tx,
      ra.tenantId,
      ra.ownerId,
    );
    await tx.roleAssignment.create({
      data: {
        ...ownerAndTenantFields,
        ...principalFields(ra.principalId),
        ...roleFields,
      },
    });
  });
}

/** backfillApiKeyRoleAssignment repairs an unassigned key without widening existing grants. */
export async function backfillApiKeyRoleAssignment(
  prisma: Prisma.TransactionClient,
  apiKeyId: string,
  tenantId: TenantId,
): Promise<void> {
  await withTransaction(prisma, async (tx) => {
    const [key] = await tx.$queryRaw<
      Pick<ApiKey, "id" | "scope" | "projectId" | "orgId">[]
    >`
      SELECT id, scope, project_id AS "projectId", organization_id AS "orgId"
      FROM api_keys
      WHERE id = ${apiKeyId} AND (expires_at IS NULL OR expires_at > NOW())
      FOR UPDATE
    `;
    if (!key) return;
    const principalId = ApiKeyId(key.id);
    const existing = await tx.roleAssignment.findFirst({
      where: { principalId },
      select: { id: true },
    });
    if (existing) return;

    let ownerId: OwnerId;
    if (key.scope === "PROJECT" && key.projectId !== null) {
      ownerId = ProjectId(key.projectId);
    } else if (key.scope === "ORGANIZATION" && key.orgId !== null) {
      ownerId = OrganizationId(key.orgId);
    } else {
      throw new InvalidRequestError("API key requires an owner");
    }
    await assignRole(tx, {
      tenantId,
      ownerId,
      principalId,
      roleId: SystemRoleId(
        key.scope === "PROJECT"
          ? "LEGACY_PROJECT_API_KEY"
          : "LEGACY_ORGANIZATION_API_KEY",
      ),
      tags: [],
    });
  });
}

/** transferRoleAssignments moves a transferred project's api-key assignments to the destination organization and drops its user assignments, mirroring the membership wipe. */
export async function transferRoleAssignments(
  prisma: Prisma.TransactionClient,
  projectId: string,
  targetOrgId: string,
): Promise<void> {
  await withTransaction(prisma, async (tx) => {
    await tx.roleAssignment.updateMany({
      where: { projectId, apiKeyId: { not: null } },
      data: { orgId: targetOrgId },
    });
    await tx.roleAssignment.deleteMany({
      where: { projectId, userId: { not: null } },
    });
  });
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
