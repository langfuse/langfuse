import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";

import { type AuthorizationContext } from "@/src/features/auth/policy/types";
import {
  applyOrgMembership,
  removeOrgMember,
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

/** handleUpdateMembership creates or changes an organization membership through the membership service. */
export async function handleUpdateMembership(
  req: NextApiRequest,
  res: NextApiResponse,
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

  const { after } = await applyOrgMembership(context, {
    orgId,
    userId: user.id,
    role: validatedBody.data.role,
  });

  return res.status(200).json({
    userId: user.id,
    role: after!.role,
    email: user.email,
    name: user.name,
  });
}

/** handleDeleteMembership removes an organization membership through the membership service. */
export async function handleDeleteMembership(
  req: NextApiRequest,
  res: NextApiResponse,
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

  await removeOrgMember(context, {
    orgId,
    userId: validatedBody.data.userId,
  });

  return res.status(200).json({
    message: "Membership deleted successfully",
    userId: validatedBody.data.userId,
  });
}
