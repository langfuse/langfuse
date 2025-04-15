import { prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";
import { organizationNameSchema } from "@/src/features/organizations/utils/organizationNameSchema";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { type NextApiRequest, type NextApiResponse } from "next";

export async function handleGetOrganizations(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const organizations = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      createdAt: true,
    },
  });
  return res.status(200).json({ organizations });
}

export async function handleCreateOrganization(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // Validate the request body using the organizationNameSchema
  const validationResult = organizationNameSchema.safeParse(req.body);

  if (!validationResult.success) {
    res.status(400).json({
      error: "Invalid request body",
      details: validationResult.error.format(),
    });
    return;
  }

  const { name } = validationResult.data;

  // Create the organization in the database
  const organization = await prisma.organization.create({
    data: {
      name,
    },
  });

  // Log the organization creation
  await auditLog({
    resourceType: "organization",
    resourceId: organization.id,
    action: "create",
    orgId: organization.id,
    orgRole: "ADMIN",
    after: organization,
    apiKeyId: "ADMIN_KEY",
  });

  logger.info(`Created organization ${organization.id} via admin API`);

  return res.status(201).json({
    id: organization.id,
    name: organization.name,
    createdAt: organization.createdAt,
  });
}
