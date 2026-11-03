import { ForbiddenError } from "@langfuse/shared";
import { type AuthorizationContext } from "@/src/features/auth/policy/types";
import { ProjectService } from "@/src/features/projects/server/projectService";
import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";
import {
  logger,
  redis,
  type ApiAccessScope,
} from "@langfuse/shared/src/server";
import { projectNameSchema } from "@/src/features/auth/lib/projectNameSchema";
import { projectRetentionSchema } from "@/src/features/auth/lib/projectRetentionSchema";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server/hasEntitlement";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { shadowAuthorize } from "@/src/features/public-api/server/shadowAuth";
import { writeProjectError } from "@/src/features/public-api/server/writeError";

export async function handleUpdateProject(
  req: NextApiRequest,
  res: NextApiResponse,
  projectId: string,
  scope: ApiAccessScope,
) {
  try {
    const { name, retention, metadata } = req.body;

    // Validate project name
    try {
      projectNameSchema.parse({ name });
    } catch {
      return res.status(400).json({
        message: "Invalid project name. Should be between 3 and 60 characters.",
      });
    }

    let parsedMetadata = metadata;
    if (metadata !== undefined && typeof metadata !== "object") {
      try {
        parsedMetadata = JSON.parse(metadata);
      } catch (error) {
        return res.status(400).json({
          message: `Invalid metadata. Should be a valid JSON object: ${error}`,
        });
      }
    }
    if (
      parsedMetadata !== undefined &&
      (typeof parsedMetadata !== "object" ||
        parsedMetadata === null ||
        Array.isArray(parsedMetadata))
    ) {
      return res.status(400).json({
        message: "Invalid metadata. Should be a valid JSON object.",
      });
    }

    // Validate retention days if provided
    if (retention !== undefined) {
      try {
        projectRetentionSchema.parse({ retention });
      } catch {
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

    // Update the project with the new retention setting
    const updatedProject = await prisma.project.update({
      where: {
        id: projectId,
        orgId: scope.orgId,
      },
      data: {
        name,
        ...(retention !== undefined ? { retentionDays: retention } : {}),
        ...(metadata !== undefined ? { metadata: parsedMetadata } : {}),
      },
      select: {
        id: true,
        name: true,
        retentionDays: true,
        metadata: true,
      },
    });

    return res.status(200).json({
      id: updatedProject.id,
      name: updatedProject.name,
      metadata: updatedProject.metadata ?? {},
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
  ctx?: AuthorizationContext,
) {
  try {
    const gatewayManageDecision = shadowAuthorize({
      ctx,
      action: "gateway:manage",
      resource: { orgId: scope.orgId },
      legacyDecision: { success: true, scope },
    });
    await new ProjectService(prisma, new ApiAuthService(prisma, redis)).delete({
      organizationId: scope.orgId,
      projectId,
      actor: { apiKeyId: scope.apiKeyId, orgId: scope.orgId, projectId },
      canManageGateway: gatewayManageDecision.success,
    });

    return res.status(202).json({
      success: true,
      message:
        "Project deletion has been initiated and is being processed asynchronously",
    });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return writeProjectError(res, error);
    }
    logger.error("Failed to delete project", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
