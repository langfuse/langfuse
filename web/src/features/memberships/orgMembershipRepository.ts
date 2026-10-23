/* eslint-disable @typescript-eslint/no-use-before-define */
import { OrganizationId, SystemRoleId, UserId } from "@langfuse/shared/rbac";
import {
  replaceRolesForPrincipal,
  revokeRolesForPrincipal,
} from "@langfuse/shared/rbac/server";
import {
  type OrganizationMembership,
  type Prisma,
  type Role,
} from "@langfuse/shared/src/db";
import { withTransaction } from "@langfuse/shared/src/server";

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
    const membership = await tx.organizationMembership.create({
      data: { orgId, userId, role },
    });
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

/** replaceOrgRole mirrors an organization membership's role into role assignments. */
async function replaceOrgRole(
  tx: Prisma.TransactionClient,
  { orgId, userId, role }: { orgId: string; userId: string; role: Role },
) {
  await replaceRolesForPrincipal(tx, {
    tenantId: OrganizationId(orgId),
    ownerId: OrganizationId(orgId),
    principalId: UserId(userId),
    roleId: SystemRoleId(role),
    tags: [],
  });
}
