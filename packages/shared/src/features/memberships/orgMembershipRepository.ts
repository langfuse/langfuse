/* eslint-disable @typescript-eslint/no-use-before-define */
import {
  type OrganizationMembership,
  type Prisma,
  type Role,
} from "@prisma/client";

import { withTransaction } from "../../server/utils/withTransaction";
import { rethrowIfMembershipExists } from "./rethrowIfMembershipExists";
import {
  replaceRolesForPrincipal,
  revokeRolesForPrincipal,
} from "../rbac/roleAssignmentService";
import {
  OrganizationId,
  SystemRoleId,
  UserId,
  type RoleAssignment,
} from "../rbac/types";

/** saveOrgMembership upserts a user's organization membership with a role and mirrors it into role assignments. */
export async function saveOrgMembership(
  prisma: Prisma.TransactionClient,
  { orgId, userId, role }: { orgId: string; userId: string; role: Role },
): Promise<OrganizationMembership> {
  return await withTransaction(prisma, async (tx) => {
    const membership = await tx.organizationMembership.upsert({
      where: { orgId_userId: { orgId, userId } },
      update: { role },
      create: { orgId, userId, role },
    });
    await replaceOrgRole(tx, membership);
    return membership;
  });
}

/** updateOrgMembership changes an existing organization membership's role, failing when it is missing, and mirrors it into role assignments. */
export async function updateOrgMembership(
  prisma: Prisma.TransactionClient,
  { orgId, userId, role }: { orgId: string; userId: string; role: Role },
): Promise<OrganizationMembership> {
  return await withTransaction(prisma, async (tx) => {
    const membership = await tx.organizationMembership.update({
      where: { orgId_userId: { orgId, userId } },
      data: { role },
    });
    await replaceOrgRole(tx, membership);
    return membership;
  });
}

/** createOrgMembership creates an organization membership, failing on duplicates, and mirrors it into role assignments. */
export async function createOrgMembership(
  prisma: Prisma.TransactionClient,
  { orgId, userId, role }: { orgId: string; userId: string; role: Role },
): Promise<OrganizationMembership> {
  return await withTransaction(prisma, async (tx) => {
    const membership = await tx.organizationMembership
      .create({ data: { orgId, userId, role } })
      .catch(rethrowIfMembershipExists("organization"));
    await replaceOrgRole(tx, membership);
    return membership;
  });
}

/** findOrCreateOrgMembership creates a missing organization membership, keeping an existing one's role, and mirrors it into role assignments. */
export async function findOrCreateOrgMembership(
  prisma: Prisma.TransactionClient,
  { orgId, userId, role }: { orgId: string; userId: string; role: Role },
): Promise<OrganizationMembership> {
  return await withTransaction(prisma, async (tx) => {
    const membership = await tx.organizationMembership.upsert({
      where: { orgId_userId: { orgId, userId } },
      update: {},
      create: { orgId, userId, role },
    });
    await replaceOrgRole(tx, membership);
    return membership;
  });
}

/** deleteOrgMembership deletes an organization membership and revokes the member's organization and project role assignments. */
export async function deleteOrgMembership(
  prisma: Prisma.TransactionClient,
  { orgId, userId }: { orgId: string; userId: string },
): Promise<OrganizationMembership> {
  return await withTransaction(prisma, async (tx) => {
    const membership = await tx.organizationMembership.delete({
      where: { orgId_userId: { orgId, userId } },
    });
    await revokeRolesForPrincipal(tx, {
      tenantId: OrganizationId(orgId),
      principalId: UserId(userId),
    });
    return membership;
  });
}

/**
 * getOrgMembershipRoles share-locks a user's organization memberships and returns the role assignments they imply.
 * @deprecated RoleAssignment backfill will be removed in the next major version.
 */
export async function getOrgMembershipRoles(
  tx: Prisma.TransactionClient,
  { userId }: { userId: string },
): Promise<Omit<RoleAssignment, "id" | "createdAt" | "updatedAt">[]> {
  const memberships = await tx.$queryRaw<{ orgId: string; role: Role }[]>`
    SELECT org_id AS "orgId", role FROM organization_memberships
    WHERE user_id = ${userId}
    FOR SHARE
  `;
  return memberships.map(({ orgId, role }) =>
    orgMembershipRole({ orgId, userId, role }),
  );
}

/** replaceOrgRole mirrors an organization membership's role into role assignments. */
async function replaceOrgRole(
  tx: Prisma.TransactionClient,
  membership: { orgId: string; userId: string; role: Role },
) {
  await replaceRolesForPrincipal(tx, orgMembershipRole(membership));
}

/** orgMembershipRole maps an organization membership to the role assignment it implies. */
function orgMembershipRole({
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
