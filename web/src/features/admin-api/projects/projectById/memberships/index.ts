import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";
import { Role } from "@langfuse/shared";
import { z } from "zod/v4";

// Schema for request body validation
const MembershipSchema = z.object({
  userId: z.string(),
  role: z.enum(Role),
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

// PUT - Update or create a project membership
export async function handleUpdateMembership(
  req: NextApiRequest,
  res: NextApiResponse,
  projectId: string,
  orgId: string,
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

  // Upsert the project membership
  const membership = await prisma.projectMembership.upsert({
    where: {
      projectId_userId: {
        userId: validatedBody.data.userId,
        projectId: projectId,
      },
    },
    update: {
      role: validatedBody.data.role,
    },
    create: {
      userId: validatedBody.data.userId,
      projectId: projectId,
      role: validatedBody.data.role,
      orgMembershipId: orgMembership.id,
    },
  });

  return res.status(200).json({
    userId: membership.userId,
    role: membership.role,
    email: orgMembership.user.email,
    name: orgMembership.user.name,
  });
}
