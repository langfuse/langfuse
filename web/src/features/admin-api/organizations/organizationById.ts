import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";
import { organizationNameSchema } from "@/src/features/organizations/utils/organizationNameSchema";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { z } from "zod/v4";

export const validateQueryAndExtractId = (query: unknown): string | null => {
  const inputQuerySchema = z.object({
    organizationId: z.string(),
  });
  const validation = inputQuerySchema.safeParse(query);
  if (!validation.success) {
    return null;
  }
  return validation.data.organizationId;
};

export async function handleGetOrganizationById(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const organizationId = validateQueryAndExtractId(req.query);
  if (!organizationId) {
    return res.status(400).json({ error: "Invalid organization ID" });
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      createdAt: true,
      metadata: true,
    },
  });

  if (!organization) {
    return res.status(404).json({ error: "Organization not found" });
  }

  return res.status(200).json({
    ...organization,
    metadata: organization.metadata ?? {},
  });
}

export async function handleUpdateOrganization(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const organizationId = validateQueryAndExtractId(req.query);
  if (!organizationId) {
    return res.status(400).json({ error: "Invalid organization ID" });
  }

  const validationResult = organizationNameSchema.safeParse(req.body);

  if (!validationResult.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: validationResult.error.format(),
    });
  }

  const { name } = validationResult.data;

  const { metadata } = req.body;
  if (metadata !== undefined && typeof metadata !== "object") {
    try {
      JSON.parse(metadata);
    } catch (error) {
      return res.status(400).json({
        message: `Invalid metadata. Should be a valid JSON object: ${error}`,
      });
    }
  }

  // Check if organization exists
  const existingOrg = await prisma.organization.findUnique({
    where: { id: organizationId },
  });

  if (!existingOrg) {
    return res.status(404).json({ error: "Organization not found" });
  }

  // Update the organization
  const updatedOrganization = await prisma.organization.update({
    where: { id: organizationId },
    data: { name, metadata },
  });

  // Log the update
  await auditLog({
    resourceType: "organization",
    resourceId: organizationId,
    action: "update",
    orgId: organizationId,
    orgRole: "ADMIN",
    before: existingOrg,
    after: updatedOrganization,
    apiKeyId: "ADMIN_KEY",
  });

  logger.info(`Updated organization ${organizationId} via admin API`);

  return res.status(200).json({
    id: updatedOrganization.id,
    name: updatedOrganization.name,
    createdAt: updatedOrganization.createdAt,
    metadata: updatedOrganization.metadata ?? {},
  });
}

export async function handleDeleteOrganization(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const organizationId = validateQueryAndExtractId(req.query);
  if (!organizationId) {
    return res.status(400).json({ error: "Invalid organization ID" });
  }

  // Check if organization exists
  const existingOrg = await prisma.organization.findUnique({
    where: { id: organizationId },
  });

  if (!existingOrg) {
    return res.status(404).json({ error: "Organization not found" });
  }

  // Check if organization has any projects
  const projectCount = await prisma.project.count({
    where: { orgId: organizationId },
  });

  if (projectCount > 0) {
    return res.status(400).json({
      error: "Cannot delete organization with existing projects",
      message:
        "Please delete or transfer all projects before deleting the organization.",
    });
  }

  // Delete the organization
  const deletedOrganization = await prisma.organization.delete({
    where: { id: organizationId },
  });

  // Log the deletion
  await auditLog({
    resourceType: "organization",
    resourceId: organizationId,
    action: "delete",
    orgId: organizationId,
    orgRole: "ADMIN",
    before: deletedOrganization,
    apiKeyId: "ADMIN_KEY",
  });

  logger.info(`Deleted organization ${organizationId} via admin API`);

  return res.status(200).json({ success: true });
}
