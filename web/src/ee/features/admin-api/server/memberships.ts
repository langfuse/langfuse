import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";
import { Role } from "@langfuse/shared";
import { z } from "zod/v4";

// Schema for request body validation
const MembershipSchema = z.object({
  userId: z.string(),
  role: z.enum(Role),
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

// PUT - Update or create an organization membership
export async function handleUpdateMembership(
  req: NextApiRequest,
  res: NextApiResponse,
  orgId: string,
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

  // Upsert the membership
  const membership = await prisma.organizationMembership.upsert({
    where: {
      orgId_userId: {
        orgId,
        userId: validatedBody.data.userId,
      },
    },
    update: {
      role: validatedBody.data.role,
    },
    create: {
      orgId,
      userId: validatedBody.data.userId,
      role: validatedBody.data.role,
    },
  });

  return res.status(200).json({
    userId: membership.userId,
    role: membership.role,
    email: user.email,
    name: user.name,
  });
}
