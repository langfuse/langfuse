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
    const { name, retention, environments, metadata } = req.body;

    // Validate project name
    try {
      projectNameSchema.parse({ name });
    } catch (error) {
      return res.status(400).json({
        message: "Invalid project name. Should be between 3 and 60 characters.",
      });
    }

    if (metadata !== undefined && typeof metadata !== "object") {
      try {
        JSON.parse(metadata);
      } catch (error) {
        return res.status(400).json({
          message: `Invalid metadata. Should be a valid JSON object: ${error}`,
        });
      }
    }

    // Validate retention days if provided
    if (retention !== undefined) {
      try {
        projectRetentionSchema.parse({
          retention,
          environments: environments || ["default"]
        });
      } catch (error) {
        return res.status(400).json({
          message: "Invalid retention value. Must be 0 or at least 3 days.",
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
    }

    // Handle retention configuration
    if (retention !== undefined) {
      const targetEnvironments = environments || ["default"];
      const isEnvironmentSpecific = targetEnvironments.length > 1 ||
        (targetEnvironments.length === 1 && targetEnvironments[0] !== "default");

      if (isEnvironmentSpecific && retention > 0) {
        // Create or update retention configuration
        await prisma.retentionConfiguration.upsert({
          where: {
            projectId,
          },
          create: {
            projectId,
            retentionDays: retention,
            environments: targetEnvironments,
          },
          update: {
            retentionDays: retention,
            environments: targetEnvironments,
          },
        });

        // Clear project-level retention
        await prisma.project.update({
          where: {
            id: projectId,
            orgId: scope.orgId,
          },
          data: {
            retentionDays: null,
          },
        });
      } else {
        // Use project-level retention
        await prisma.project.update({
          where: {
            id: projectId,
            orgId: scope.orgId,
          },
          data: {
            retentionDays: retention || null,
          },
        });

        // Remove any existing retention configuration
        await prisma.retentionConfiguration.deleteMany({
          where: {
            projectId,
          },
        });
      }
    }

    // Update the project with other settings
    const updatedProject = await prisma.project.update({
      where: {
        id: projectId,
        orgId: scope.orgId,
      },
      data: {
        name,
        metadata,
      },
      select: {
        id: true,
        name: true,
        retentionDays: true,
        metadata: true,
        retentionConfiguration: true,
      },
    });

    const responseData: any = {
      id: updatedProject.id,
      name: updatedProject.name,
      metadata: updatedProject.metadata ?? {},
    };

    // Add retention information to response
    if (updatedProject.retentionConfiguration) {
      responseData.retentionDays = updatedProject.retentionConfiguration.retentionDays;
      responseData.retentionEnvironments = updatedProject.retentionConfiguration.environments;
    } else if (updatedProject.retentionDays) {
      responseData.retentionDays = updatedProject.retentionDays;
    }

    return res.status(200).json(responseData);
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
