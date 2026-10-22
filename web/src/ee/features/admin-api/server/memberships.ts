import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";

import { getSfdcService } from "@/src/ee/features/sfdc-sync/server";
import {
  deleteUserBoundApiKeys,
  deleteUserBoundApiKeysForRole,
  evictRevokedApiKeys,
} from "@/src/features/ai-gateway/server/apiKey/userBoundApiKeys";
import { auditLog } from "@/src/features/audit-logs/server";
import { type AuthorizationContext } from "@/src/features/auth/policy/types";
import { authorize } from "@/src/features/rbac/authorize";
import { ForbiddenError, Role } from "@langfuse/shared";
import { OrganizationId } from "@langfuse/shared/rbac";
import { prisma, type Prisma } from "@langfuse/shared/src/db";

// Schema for request body validation
const MembershipSchema = z.object({
  userId: z.string(),
  role: z.enum(Role),
});

// Schema for delete request body validation
const DeleteMembershipSchema = z.object({
  userId: z.string(),
});

// GET - Retrieve all organization memberships
export async function handleGetMemberships(
  req: NextApiRequest,
  res: NextApiResponse,
  orgId: string,
) {
  const memberships = await prisma.organizationMembership.findMany({
    where: {
      orgId: orgId,
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  });

  return res.status(200).json({
    memberships: memberships.map((membership) => ({
      userId: membership.userId,
      role: membership.role,
      email: membership.user.email,
      name: membership.user.name,
    })),
  });
}

/** handleUpdateMembership upserts and audits an authorized organization membership. */
export async function handleUpdateMembership(
  req: NextApiRequest,
  res: NextApiResponse,
  orgId: string,
  apiKeyId: string,
  context: AuthorizationContext,
) {
  const validatedBody = MembershipSchema.safeParse(req.body);
  if (!validatedBody.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: validatedBody.error.issues,
    });
  }

  // Check if user exists
  const user = await prisma.user.findUnique({
    where: {
      id: validatedBody.data.userId,
    },
  });

  if (!user) {
    return res.status(404).json({
      error: "User not found",
    });
  }

  const { membership, revokedKeys } = await prisma.$transaction(async (tx) => {
    const before = await tx.organizationMembership.findUnique({
      where: { orgId_userId: { orgId, userId: validatedBody.data.userId } },
    });
    assertAuthorizeMembershipChange(context, orgId);
    await assertValidOwnershipChange({
      tx,
      context,
      orgId,
      from: before?.role,
      to: validatedBody.data.role,
    });
    const after = await tx.organizationMembership.upsert({
      where: { orgId_userId: { orgId, userId: validatedBody.data.userId } },
      update: { role: validatedBody.data.role },
      create: {
        orgId,
        userId: validatedBody.data.userId,
        role: validatedBody.data.role,
      },
    });
    await auditLog(
      {
        orgId,
        apiKeyId,
        resourceType: "orgMembership",
        resourceId: after.id,
        action: before ? "update" : "create",
        before: before ?? undefined,
        after,
      },
      tx,
    );
    const revokedKeys = await deleteUserBoundApiKeysForRole(tx, {
      userId: validatedBody.data.userId,
      orgId,
      role: validatedBody.data.role,
    });
    return { membership: after, revokedKeys };
  });
  await evictRevokedApiKeys(revokedKeys, { apiKeyId });

  await getSfdcService()?.setUserRole({
    orgId,
    userId: membership.userId,
    email: user.email,
    role: membership.role,
  });

  return res.status(200).json({
    userId: membership.userId,
    role: membership.role,
    email: user.email,
    name: user.name,
  });
}

/** handleDeleteMembership removes and audits an authorized organization membership. */
export async function handleDeleteMembership(
  req: NextApiRequest,
  res: NextApiResponse,
  orgId: string,
  apiKeyId: string,
  context: AuthorizationContext,
) {
  const validatedBody = DeleteMembershipSchema.safeParse(req.body);
  if (!validatedBody.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: validatedBody.error.issues,
    });
  }

  const { deleted, revokedKeys } = await prisma.$transaction(async (tx) => {
    const before = await tx.organizationMembership.findUnique({
      where: { orgId_userId: { orgId, userId: validatedBody.data.userId } },
    });
    assertAuthorizeMembershipChange(context, orgId);
    if (!before) return { deleted: false, revokedKeys: [] };
    await assertValidOwnershipChange({
      tx,
      context,
      orgId,
      from: before.role,
    });
    await tx.organizationMembership.delete({
      where: { id: before.id, orgId },
    });
    await auditLog(
      {
        orgId,
        apiKeyId,
        resourceType: "orgMembership",
        resourceId: before.id,
        action: "delete",
        before,
      },
      tx,
    );
    const revokedKeys = await deleteUserBoundApiKeys(tx, {
      userId: validatedBody.data.userId,
      orgId,
    });
    return { deleted: true, revokedKeys };
  });
  await evictRevokedApiKeys(revokedKeys, { apiKeyId });

  if (deleted) {
    const user = await prisma.user.findUnique({
      where: { id: validatedBody.data.userId },
      select: { email: true },
    });
    await getSfdcService()?.removeUser({
      orgId,
      userId: validatedBody.data.userId,
      email: user?.email,
    });
  }

  return res.status(200).json({
    message: "Membership deleted successfully",
    userId: validatedBody.data.userId,
  });
}

function assertAuthorizeMembershipChange(
  context: AuthorizationContext,
  orgId: string,
) {
  const organization = OrganizationId(orgId);
  const membershipAccess = authorize(
    context,
    organization,
    "organizationMembers:CUD",
    organization,
  );
  if (!membershipAccess.success) throw membershipAccess.error;
}

/** assertValidOwnershipChange checks ownership permission and keeps at least one owner. */
export async function assertValidOwnershipChange({
  tx,
  context,
  orgId,
  from,
  to,
}: {
  tx: Prisma.TransactionClient;
  context: AuthorizationContext | undefined;
  orgId: string;
  from: Role | undefined;
  to?: Role;
}) {
  if (from === Role.OWNER || to === Role.OWNER) {
    assertAuthorizeOwnershipChange(context, orgId);
  }
  if (from === Role.OWNER && to !== Role.OWNER) {
    await assertOtherOwners(tx, orgId);
  }
}

/** assertAuthorizeOwnershipChange throws unless the context may grant, change, or remove the OWNER role. */
function assertAuthorizeOwnershipChange(
  context: AuthorizationContext | undefined,
  orgId: string,
) {
  if (!context) throw new ForbiddenError();
  const organization = OrganizationId(orgId);
  const ownershipAccess = authorize(
    context,
    organization,
    "organizationMembers:manageOwnership",
    organization,
  );
  if (!ownershipAccess.success) throw ownershipAccess.error;
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
