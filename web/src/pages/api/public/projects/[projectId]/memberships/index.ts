import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { prisma } from "@langfuse/shared/src/db";
import { logger, redis } from "@langfuse/shared/src/server";
import { Role } from "@langfuse/shared";
import { z } from "zod";

import { type NextApiRequest, type NextApiResponse } from "next";

// Schema for request body validation
const MembershipSchema = z.object({
  userId: z.string(),
  role: z.nativeEnum(Role),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);

  if (!["GET", "PUT"].includes(req.method || "")) {
    logger.error(
      `Method not allowed for ${req.method} on /api/public/projects/[projectId]/memberships`,
    );
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  const { projectId } = req.query;
  if (!projectId || typeof projectId !== "string") {
    return res.status(400).json({
      error: "projectId is required",
    });
  }

  // CHECK AUTH
  const authCheck = await new ApiAuthService(
    prisma,
    redis,
  ).verifyAuthHeaderAndReturnScope(req.headers.authorization);
  if (!authCheck.validKey) {
    return res.status(401).json({
      error: authCheck.error,
    });
  }
  // END CHECK AUTH

  // Check if using an organization API key
  if (
    authCheck.scope.accessLevel !== "organization" ||
    !authCheck.scope.orgId
  ) {
    return res.status(403).json({
      error:
        "Invalid API key. Organization-scoped API key required for this operation.",
    });
  }

  // Verify the project belongs to the organization
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      orgId: authCheck.scope.orgId,
      deletedAt: null,
    },
  });

  if (!project) {
    return res.status(404).json({
      error: "Project not found or does not belong to this organization",
    });
  }

  // Route to the appropriate handler based on HTTP method
  try {
    switch (req.method) {
      case "GET":
        return handleGet(req, res, projectId, authCheck.scope.orgId);
      case "PUT":
        return handlePut(req, res, projectId, authCheck.scope.orgId);
      default:
        // This should never happen due to the check at the beginning
        return res.status(405).json({
          error: "Method not allowed",
        });
    }
  } catch (error) {
    logger.error(
      `Error handling project memberships for ${req.method} on project ${projectId}`,
      error,
    );
    return res.status(500).json({
      error: "Internal server error",
    });
  }
}

// GET - Retrieve all project memberships
async function handleGet(
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
async function handlePut(
  req: NextApiRequest,
  res: NextApiResponse,
  projectId: string,
  orgId: string,
) {
  const validatedBody = MembershipSchema.safeParse(req.body);
  if (!validatedBody.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: validatedBody.error.errors,
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
