/* eslint-disable @typescript-eslint/no-use-before-define */
import {
  type OrganizationMembership,
  type Prisma,
  type Role,
} from "@prisma/client";

import { withTransaction } from "../../server/utils/withTransaction";
import { rethrowIfMembershipExists } from "./rethrowIfMembershipExists";
import {
  orgMembershipRole,
  replaceRolesForPrincipal,
  revokeRolesForPrincipal,
} from "../rbac/roleAssignmentService";
import { OrganizationId, UserId } from "../rbac/types";

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

/** lockOrgMemberships share-locks and returns a user's organization memberships. */
export async function lockOrgMemberships(
  tx: Prisma.TransactionClient,
  { userId }: { userId: string },
): Promise<{ orgId: string; userId: string; role: Role }[]> {
  return await tx.$queryRaw`
    SELECT org_id AS "orgId", user_id AS "userId", role
    FROM organization_memberships
    WHERE user_id = ${userId}
    FOR SHARE
  `;
}

/** replaceOrgRole mirrors an organization membership's role into role assignments. */
async function replaceOrgRole(
  tx: Prisma.TransactionClient,
  membership: { orgId: string; userId: string; role: Role },
) {
  await replaceRolesForPrincipal(tx, orgMembershipRole(membership));
}
