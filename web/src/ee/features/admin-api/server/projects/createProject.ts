import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";
import { projectNameSchema } from "@/src/features/auth/lib/projectNameSchema";
import { projectRetentionSchema } from "@/src/features/auth/lib/projectRetentionSchema";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server/hasEntitlement";
import { type ApiAccessScope } from "@langfuse/shared/src/server";

export async function handleCreateProject(
  req: NextApiRequest,
  res: NextApiResponse,
  scope: ApiAccessScope,
) {
  try {
    const { name, retention, metadata } = req.body;

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
        projectRetentionSchema.parse({ retention });
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

    // Check if project with this name already exists in the organization
    const existingProject = await prisma.project.findFirst({
      where: {
        name,
        orgId: scope.orgId,
      },
    });

    if (existingProject) {
      return res.status(409).json({
        message: "A project with this name already exists in your organization",
      });
    }

    // Create the project
    const project = await prisma.project.create({
      data: {
        name,
        orgId: scope.orgId,
        retentionDays: retention,
        metadata,
      },
    });

    return res.status(201).json({
      id: project.id,
      name: project.name,
      metadata: project.metadata ?? {},
      ...(project.retentionDays // Do not add if null or 0
        ? { retentionDays: project.retentionDays }
        : {}),
    });
  } catch (error) {
    logger.error("Failed to create project", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
