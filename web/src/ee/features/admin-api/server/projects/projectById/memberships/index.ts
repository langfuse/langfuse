import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";

import { auditLog } from "@/src/features/audit-logs/server";
import { type AuthorizationContext } from "@/src/features/auth/policy/types";
import { authorize } from "@/src/features/rbac/authorize";
import { ForbiddenError, Role } from "@langfuse/shared";
import { OrganizationId, ProjectId } from "@langfuse/shared/rbac";
import {
  prisma,
  type Prisma,
  type ProjectMembership,
} from "@langfuse/shared/src/db";

// Schema for request body validation
const MembershipSchema = z.object({
  userId: z.string(),
  role: z.enum(Role),
});

// Schema for delete request body validation
const DeleteMembershipSchema = z.object({
  userId: z.string(),
});

// GET - Retrieve all project memberships
export async function handleGetMemberships(
  req: NextApiRequest,
  res: NextApiResponse,
  projectId: string,
  orgId: string,
) {
  const memberships = await prisma.projectMembership.findMany({
    where: {
      projectId,
      organizationMembership: {
        orgId,
      },
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

/** handleUpdateMembership upserts and audits an authorized project membership. */
export async function handleUpdateMembership(
  req: NextApiRequest,
  res: NextApiResponse,
  projectId: string,
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

  // Check if user exists and is a member of the organization
  const orgMembership = await prisma.organizationMembership.findUnique({
    where: {
      orgId_userId: {
        userId: validatedBody.data.userId,
        orgId: orgId,
      },
    },
    include: {
      user: {
        select: {
          email: true,
          name: true,
        },
      },
    },
  });

  if (!orgMembership) {
    return res.status(404).json({
      error: "User is not a member of this organization",
    });
  }

  const membership = await prisma.$transaction((tx) =>
    updateMembership(tx, {
      projectId,
      orgId,
      apiKeyId,
      context,
      userId: validatedBody.data.userId,
      role: validatedBody.data.role,
      orgMembershipId: orgMembership.id,
    }),
  );

  return res.status(200).json({
    userId: membership.userId,
    role: membership.role,
    email: orgMembership.user.email,
    name: orgMembership.user.name,
  });
}

/** handleDeleteMembership removes and audits an authorized project membership. */
export async function handleDeleteMembership(
  req: NextApiRequest,
  res: NextApiResponse,
  projectId: string,
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

  const deleted = await prisma.$transaction((tx) =>
    deleteMembership(tx, {
      projectId,
      orgId,
      apiKeyId,
      context,
      userId: validatedBody.data.userId,
    }),
  );

  if (!deleted) {
    return res.status(404).json({
      error: "Project membership not found",
    });
  }

  return res.status(200).json({
    message: "Project membership deleted successfully",
    userId: validatedBody.data.userId,
  });
}

/** updateMembership authorizes and audits the upsert within its transaction. */
async function updateMembership(
  tx: Prisma.TransactionClient,
  params: MembershipMutation & { role: Role; orgMembershipId: string },
) {
  const { projectId, orgId, userId, role, orgMembershipId, context } = params;
  await lockProject(tx, projectId, orgId);
  const before = await tx.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  assertAuthorizeMembershipChange({
    context,
    orgId,
    projectId,
    from: before?.role,
    to: role,
  });
  const after = await upsertMembership(tx, {
    projectId,
    userId,
    role,
    orgMembershipId,
  });
  await auditMembershipUpsert(tx, params, before ?? undefined, after);
  return after;
}

function upsertMembership(
  tx: Prisma.TransactionClient,
  data: {
    projectId: string;
    userId: string;
    role: Role;
    orgMembershipId: string;
  },
) {
  return tx.projectMembership.upsert({
    where: {
      projectId_userId: { projectId: data.projectId, userId: data.userId },
    },
    update: { role: data.role },
    create: data,
  });
}

/** deleteMembership authorizes and audits removal within its transaction. */
async function deleteMembership(
  tx: Prisma.TransactionClient,
  params: MembershipMutation,
) {
  const { projectId, orgId, userId, context } = params;
  await lockProject(tx, projectId, orgId);
  const before = await findMembershipWithOrganization(tx, projectId, userId);
  assertAuthorizeMembershipChange({
    context,
    orgId,
    projectId,
    from: before?.role,
  });
  if (!before) return false;
  assertMembershipOrganization(before.organizationMembership.orgId, orgId);
  const membership = await tx.projectMembership.delete({
    where: { projectId_userId: { projectId, userId: before.userId } },
  });
  await auditMembershipDeletion(tx, params, membership);
  return true;
}

function findMembershipWithOrganization(
  tx: Prisma.TransactionClient,
  projectId: string,
  userId: string,
) {
  return tx.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
    include: { organizationMembership: { select: { orgId: true } } },
  });
}

function assertMembershipOrganization(membershipOrgId: string, orgId: string) {
  if (membershipOrgId !== orgId) {
    throw new ForbiddenError(
      "Project membership does not belong to this organization",
    );
  }
}

function auditMembershipUpsert(
  tx: Prisma.TransactionClient,
  { orgId, projectId, apiKeyId }: MembershipMutation,
  before: ProjectMembership | undefined,
  after: ProjectMembership,
) {
  return auditLog(
    {
      orgId,
      projectId,
      apiKeyId,
      resourceType: "projectMembership",
      resourceId: `${projectId}--${after.userId}`,
      action: before ? "update" : "create",
      before,
      after,
    },
    tx,
  );
}

function auditMembershipDeletion(
  tx: Prisma.TransactionClient,
  { orgId, projectId, apiKeyId }: MembershipMutation,
  before: ProjectMembership,
) {
  return auditLog(
    {
      orgId,
      projectId,
      apiKeyId,
      resourceType: "projectMembership",
      resourceId: `${projectId}--${before.userId}`,
      action: "delete",
      before,
    },
    tx,
  );
}

/** lockProject serializes membership API mutations before reading ownership. */
async function lockProject(
  tx: Prisma.TransactionClient,
  projectId: string,
  orgId: string,
) {
  await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId} AND org_id = ${orgId} FOR UPDATE`;
}

function assertAuthorizeMembershipChange({
  context,
  orgId,
  projectId,
  from,
  to,
}: {
  context: AuthorizationContext;
  orgId: string;
  projectId: string;
  from: Role | undefined;
  to?: Role;
}) {
  const organization = OrganizationId(orgId);
  const project = ProjectId(projectId);
  const membershipAccess = authorize(
    context,
    organization,
    "projectMembers:CUD",
    project,
  );
  if (!membershipAccess.success) throw membershipAccess.error;
  if (from !== Role.OWNER && to !== Role.OWNER) return;
  const ownershipAccess = authorize(
    context,
    organization,
    "projectMembers:manageOwnership",
    project,
  );
  if (!ownershipAccess.success) throw ownershipAccess.error;
}

/** MembershipMutation carries the caller and target for a project membership write. */
type MembershipMutation = {
  projectId: string;
  orgId: string;
  apiKeyId: string;
  userId: string;
  context: AuthorizationContext;
};
