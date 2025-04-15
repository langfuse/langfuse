import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";
import {
  logger,
  redis,
  QueueJobs,
  ProjectDeleteQueue,
  type ApiAccessScope,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import { projectRetentionSchema } from "@/src/features/auth/lib/projectRetentionSchema";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server/hasEntitlement";
import { projectNameSchema } from "@/src/features/auth/lib/projectNameSchema";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";

export async function handleUpdateProject(
  req: NextApiRequest,
  res: NextApiResponse,
  projectId: string,
  scope: ApiAccessScope,
) {
  try {
    const { name, retention } = req.body;

    // Validate project name
    try {
      projectNameSchema.parse({ name });
    } catch (error) {
      return res.status(400).json({
        message: "Invalid project name. Should be between 3 and 60 characters.",
      });
    }

    // Validate retention days using the schema
    try {
      projectRetentionSchema.parse({ retention });
    } catch (error) {
      return res.status(400).json({
        message: "Invalid retention value. Must be 0 or at least 7 days.",
      });
    }

    // If retention is non-zero, check for data-retention entitlement
    if (retention > 0) {
      const hasDataRetentionEntitlement = hasEntitlementBasedOnPlan({
        entitlement: "data-retention",
        plan: scope.plan,
      });

      if (!hasDataRetentionEntitlement) {
        return res.status(403).json({
          message:
            "The data-retention entitlement is required to set a non-zero retention period.",
        });
      }
    }

    // Update the project with the new retention setting
    const updatedProject = await prisma.project.update({
      where: {
        id: projectId,
        orgId: scope.orgId,
      },
      data: {
        name,
        retentionDays: retention,
      },
      select: {
        id: true,
        name: true,
        retentionDays: true,
      },
    });

    return res.status(200).json({
      id: updatedProject.id,
      name: updatedProject.name,
      ...(updatedProject.retentionDays // Do not add if null or 0
        ? { retentionDays: updatedProject.retentionDays }
        : {}),
    });
  } catch (error) {
    logger.error("Failed to update project", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function handleDeleteProject(
  req: NextApiRequest,
  res: NextApiResponse,
  projectId: string,
  scope: ApiAccessScope,
) {
  try {
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
        orgId: scope.orgId,
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
        orgId: scope.orgId,
      },
      name: QueueJobs.ProjectDelete,
    });

    return res.status(202).json({
      success: true,
      message:
        "Project deletion has been initiated and is being processed asynchronously",
    });
  } catch (error) {
    logger.error("Failed to delete project", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
