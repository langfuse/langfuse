import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { prisma } from "@langfuse/shared/src/db";
import { isPrismaException } from "@/src/utils/exceptions";
import { logger, redis, QueueJobs, ProjectDeleteQueue } from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";

import { type NextApiRequest, type NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);

  const { projectId } = req.query;

  if (typeof projectId !== "string") {
    return res.status(400).json({ message: "Invalid project ID" });
  }

  if (req.method !== "DELETE") {
    logger.error(
      `Method not allowed for ${req.method} on /api/public/projects/${projectId}`,
    );
    return res.status(405).json({ message: "Method not allowed" });
  }

  // CHECK AUTH
  const authCheck = await new ApiAuthService(
    prisma,
    redis,
  ).verifyAuthHeaderAndReturnScope(req.headers.authorization);
  if (!authCheck.validKey) {
    return res.status(401).json({
      message: authCheck.error,
    });
  }

  // Check if using an organization API key
  if (
    authCheck.scope.accessLevel !== "organization" ||
    !authCheck.scope.orgId
  ) {
    return res.status(403).json({
      message:
        "Invalid API key. Organization-scoped API key required for this operation.",
    });
  }
  // END CHECK AUTH

  try {
    // Check if project exists and belongs to the organization
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        orgId: authCheck.scope.orgId,
      },
    });

    if (!project) {
      return res.status(404).json({
        message: "Project not found or you don't have access to it",
      });
    }

    // API keys need to be deleted from cache. Otherwise, they will still be valid.
    await new ApiAuthService(prisma, redis).invalidateProjectApiKeys(projectId);

    // Delete API keys from DB
    await prisma.apiKey.deleteMany({
      where: {
        projectId: projectId,
        scope: "PROJECT",
      },
    });

    // Mark project as deleted
    await prisma.project.update({
      where: {
        id: projectId,
        orgId: authCheck.scope.orgId,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    // Queue project deletion job
    const projectDeleteQueue = ProjectDeleteQueue.getInstance();
    if (!projectDeleteQueue) {
      logger.error("ProjectDeleteQueue is not available");
      return res.status(500).json({
        message: "Internal server error",
      });
    }

    await projectDeleteQueue.add(QueueJobs.ProjectDelete, {
      timestamp: new Date(),
      id: randomUUID(),
      payload: {
        projectId: projectId,
        orgId: authCheck.scope.orgId,
      },
      name: QueueJobs.ProjectDelete,
    });

    return res.status(200).json({
      success: true,
      message: "Project deleted successfully",
    });
  } catch (error) {
    logger.error("Failed to delete project", error);
    if (isPrismaException(error)) {
      return res.status(500).json({
        error: "Internal Server Error",
      });
    }
    return res.status(500).json({ message: "Internal server error" });
  }
}