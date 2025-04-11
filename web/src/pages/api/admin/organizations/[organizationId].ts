import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";
import { AdminApiAuthService } from "@/src/features/admin-api/server/adminApiAuth";
import { organizationNameSchema } from "@/src/features/organizations/utils/organizationNameSchema";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { z } from "zod";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    // Verify admin API authentication, but allow non-langfuse cloud use-cases
    if (!AdminApiAuthService.handleAdminAuth(req, res, false)) {
      return;
    }

    // Handle different HTTP methods
    switch (req.method) {
      case "GET":
        return await handleGet(req, res);
      case "PUT":
        return await handlePut(req, res);
      case "DELETE":
        return await handleDelete(req, res);
      default:
        res.status(405).json({ error: "Method Not Allowed" });
        return;
    }
  } catch (e) {
    logger.error("Failed to process organization request", e);
    res.status(500).json({ error: "Internal server error" });
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const { organizationId } = req.query;

  if (!organizationId || typeof organizationId !== "string") {
    return res.status(400).json({ error: "Invalid organization ID" });
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      createdAt: true,
    },
  });

  if (!organization) {
    return res.status(404).json({ error: "Organization not found" });
  }

  return res.status(200).json(organization);
}

async function handlePut(req: NextApiRequest, res: NextApiResponse) {
  // Validate the request body and ID
  const idSchema = z.object({ id: z.string() });
  const idValidation = idSchema.safeParse(req.query);

  if (!idValidation.success) {
    return res.status(400).json({
      error: "Invalid organization ID",
      details: idValidation.error.format(),
    });
  }

  const { id } = idValidation.data;

  const validationResult = organizationNameSchema.safeParse(req.body);

  if (!validationResult.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: validationResult.error.format(),
    });
  }

  const { name } = validationResult.data;

  // Check if organization exists
  const existingOrg = await prisma.organization.findUnique({
    where: { id },
  });

  if (!existingOrg) {
    return res.status(404).json({ error: "Organization not found" });
  }

  // Update the organization
  const updatedOrganization = await prisma.organization.update({
    where: { id },
    data: { name },
  });

  // Log the update
  await auditLog({
    resourceType: "organization",
    resourceId: id,
    action: "update",
    orgId: id,
    orgRole: "ADMIN",
    before: existingOrg,
    after: updatedOrganization,
    apiKeyId: "ADMIN_KEY",
  });

  logger.info(`Updated organization ${id} via admin API`);

  return res.status(200).json({
    id: updatedOrganization.id,
    name: updatedOrganization.name,
    createdAt: updatedOrganization.createdAt,
  });
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse) {
  // Validate the ID
  const idSchema = z.object({ id: z.string() });
  const idValidation = idSchema.safeParse(req.query);

  if (!idValidation.success) {
    return res.status(400).json({
      error: "Invalid organization ID",
      details: idValidation.error.format(),
    });
  }

  const { id } = idValidation.data;

  // Check if organization exists
  const existingOrg = await prisma.organization.findUnique({
    where: { id },
  });

  if (!existingOrg) {
    return res.status(404).json({ error: "Organization not found" });
  }

  // Check if organization has any projects
  const projectCount = await prisma.project.count({
    where: { orgId: id },
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
    where: { id },
  });

  // Log the deletion
  await auditLog({
    resourceType: "organization",
    resourceId: id,
    action: "delete",
    orgId: id,
    orgRole: "ADMIN",
    before: deletedOrganization,
    apiKeyId: "ADMIN_KEY",
  });

  logger.info(`Deleted organization ${id} via admin API`);

  return res.status(200).json({ success: true });
}
