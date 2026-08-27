import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";
import { Role } from "@langfuse/shared";
import { z } from "zod";
import { getSfdcService } from "@/src/ee/features/sfdc-sync/server";

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

// DELETE - Remove an organization membership
export async function handleDeleteMembership(
  req: NextApiRequest,
  res: NextApiResponse,
  orgId: string,
) {
  const validatedBody = DeleteMembershipSchema.safeParse(req.body);
  if (!validatedBody.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: validatedBody.error.issues,
    });
  }

  // Delete the membership (using deleteMany to avoid errors on not found)
  const { count } = await prisma.organizationMembership.deleteMany({
    where: {
      orgId,
      userId: validatedBody.data.userId,
    },
  });

  // SFDC: remove the org-member bridge if a membership actually existed
  if (count > 0) {
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
