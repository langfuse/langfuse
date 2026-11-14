import { type Session } from "next-auth";

import { ForbiddenError, Role } from "@langfuse/shared";
import { type Prisma } from "@langfuse/shared/src/db";

import { throwIfNoOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

/** assertOrgOwnershipChange lets a session grant, change or remove an org OWNER only with ownership rights, and never removes the last owner. */
export async function assertOrgOwnershipChange({
  tx,
  session,
  orgId,
  from,
  to,
}: {
  tx: Prisma.TransactionClient;
  session: Session;
  orgId: string;
  from: Role | undefined;
  to?: Role;
}) {
  if (isOwnershipChange(from, to)) {
    throwIfNoOrganizationAccess({
      session,
      organizationId: orgId,
      scope: "organizationMembers:manageOwnership",
    });
  }
  if (isOwnershipRemoval(from, to)) await assertOtherOwners(tx, orgId);
}

/** assertProjectOwnershipChange lets a session grant, change or remove a project OWNER only with project ownership rights. */
export function assertProjectOwnershipChange({
  session,
  projectId,
  from,
  to,
}: {
  session: Session;
  projectId: string;
  from: Role | undefined;
  to?: Role;
}) {
  if (!isOwnershipChange(from, to)) return;
  throwIfNoProjectAccess({
    session,
    projectId,
    scope: "projectMembers:manageOwnership",
  });
}

/** isOwnershipChange reports whether a role transition grants, changes or removes OWNER. */
export function isOwnershipChange(from: Role | undefined, to?: Role): boolean {
  return from === Role.OWNER || to === Role.OWNER;
}

/** isOwnershipRemoval reports whether a role transition takes OWNER away. */
export function isOwnershipRemoval(from: Role | undefined, to?: Role): boolean {
  return from === Role.OWNER && to !== Role.OWNER;
}

/** assertOtherOwners locks the organization's owner rows and requires another owner before removing ownership. */
export async function assertOtherOwners(
  tx: Prisma.TransactionClient,
  orgId: string,
) {
  const owners = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM organization_memberships
    WHERE org_id = ${orgId} AND role = 'OWNER'
    FOR UPDATE
  `;
  if (owners.length < 2) {
    throw new ForbiddenError(
      "Cannot remove the last owner of an organization. Assign new owner or delete organization.",
    );
  }
}
