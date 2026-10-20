import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";

import { type AuthorizationContext } from "@/src/features/auth/policy/types";
import { inMembershipTransaction } from "@/src/features/memberships/server/membershipTransaction";
import {
  deleteOrgMembership,
  updateOrgMembership,
} from "@/src/features/memberships/server/orgMembershipService";
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

  const { after } = await inMembershipTransaction((tx) =>
    updateOrgMembership(tx, context, {
      orgId,
      userId: validatedBody.data.userId,
      role: validatedBody.data.role,
    }),
  );
  const user = await prisma.user.findUnique({
    where: { id: after.userId },
    select: { email: true, name: true },
  });

  return res.status(200).json({
    userId: after.userId,
    role: after.role,
    email: user?.email,
    name: user?.name,
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

  await inMembershipTransaction((tx) =>
    deleteOrgMembership(tx, context, {
      orgId,
      userId: validatedBody.data.userId,
    }),
  );

  return res.status(200).json({
    message: "Membership deleted successfully",
    userId: validatedBody.data.userId,
  });
}
