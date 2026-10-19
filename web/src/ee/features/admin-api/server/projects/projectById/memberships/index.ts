import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";

import { type AuthorizationContext } from "@/src/features/auth/policy/types";
import {
  removeProjectRole,
  setProjectRole,
} from "@/src/features/memberships/server/membershipService";
import { Role } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";

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

/** handleUpdateMembership sets a project role through the membership service. */
export async function handleUpdateMembership(
  req: NextApiRequest,
  res: NextApiResponse,
  projectId: string,
  orgId: string,
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

  const { after } = await setProjectRole(context, {
    orgId,
    projectId,
    userId: validatedBody.data.userId,
    role: validatedBody.data.role,
  });

  return res.status(200).json({
    userId: after.userId,
    role: after.role,
    email: orgMembership.user.email,
    name: orgMembership.user.name,
  });
}

/** handleDeleteMembership removes a project role through the membership service. */
export async function handleDeleteMembership(
  req: NextApiRequest,
  res: NextApiResponse,
  projectId: string,
  orgId: string,
  context: AuthorizationContext,
) {
  const validatedBody = DeleteMembershipSchema.safeParse(req.body);
  if (!validatedBody.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: validatedBody.error.issues,
    });
  }

  const deleted = await removeProjectRole(context, {
    orgId,
    projectId,
    userId: validatedBody.data.userId,
  });

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
