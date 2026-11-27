import { type Session } from "next-auth";

import { ForbiddenError, Role } from "@langfuse/shared";
import { OrganizationId } from "@langfuse/shared/rbac";
import { type Prisma } from "@langfuse/shared/src/db";

import { type AuthorizationContext } from "@/src/features/auth/policy/types";
import { authorize } from "@/src/features/rbac/authorize";
import { throwIfNoOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";

/** assertValidOrgOwnershipChange lets a session or auth context grant, change or remove an org OWNER only with ownership rights, and never removes the last owner. */
export async function assertValidOrgOwnershipChange(
  change: OwnershipChange,
): Promise<void> {
  const { tx, orgId, from, to } = change;
  if (isOwnershipChange(from, to)) assertOwnershipRights(change);
  if (isOwnershipRemoval(from, to)) await assertOtherOwners(tx, orgId);
}

/** assertValidProjectOwnershipChange lets a session or auth context grant, change or remove a project OWNER only with the organization's ownership rights. */
export async function assertValidProjectOwnershipChange(
  change: OwnershipChange,
): Promise<void> {
  if (isOwnershipChange(change.from, change.to)) assertOwnershipRights(change);
}

/** isOwnershipChange reports whether a role transition grants, changes or removes OWNER. */
function isOwnershipChange(from: Role | undefined, to?: Role): boolean {
  return from === Role.OWNER || to === Role.OWNER;
}

/** isOwnershipRemoval reports whether a role transition takes OWNER away. */
function isOwnershipRemoval(from: Role | undefined, to?: Role): boolean {
  return from === Role.OWNER && to !== Role.OWNER;
}

/** assertOwnershipRights throws unless the actor holds `organization:manageOwnership` on the org. */
function assertOwnershipRights(change: OwnershipChange) {
  if ("session" in change) {
    throwIfNoOrganizationAccess({
      session: change.session,
      organizationId: change.orgId,
      scope: "organization:manageOwnership",
    });
    return;
  }
  assertContextOwnershipRights(change.context, change.orgId);
}

/** assertContextOwnershipRights throws unless the auth context exists and holds `organization:manageOwnership`. */
function assertContextOwnershipRights(
  context: AuthorizationContext | undefined,
  orgId: string,
) {
  if (!context) throw new ForbiddenError();
  const organization = OrganizationId(orgId);
  const access = authorize(
    context,
    organization,
    "organization:manageOwnership",
    organization,
  );
  if (!access.success) throw access.error;
}

/** assertOtherOwners locks the organization's owner rows and requires another owner before removing ownership. */
async function assertOtherOwners(tx: Prisma.TransactionClient, orgId: string) {
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

/** OwnershipChange is a role transition on an org or project, made by a session user or an auth-context caller. */
type OwnershipChange = {
  tx: Prisma.TransactionClient;
  orgId: string;
  from: Role | undefined;
  to?: Role;
} & ({ session: Session } | { context: AuthorizationContext | undefined });
