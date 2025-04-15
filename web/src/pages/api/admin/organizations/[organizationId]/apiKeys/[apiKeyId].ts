import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";
import { logger, redis } from "@langfuse/shared/src/server";
import { AdminApiAuthService } from "@/src/features/admin-api/server/adminApiAuth";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { z } from "zod";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";

const validateQueryParams = (
  query: unknown,
): { organizationId: string; apiKeyId: string } | null => {
  const inputQuerySchema = z.object({
    organizationId: z.string(),
    apiKeyId: z.string(),
  });
  const validation = inputQuerySchema.safeParse(query);
  if (!validation.success) {
    return null;
  }
  return validation.data;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method !== "DELETE") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    // Verify admin API authentication, but allow non-langfuse cloud use-cases
    if (!AdminApiAuthService.handleAdminAuth(req, res, false)) {
      return;
    }

    const params = validateQueryParams(req.query);
    if (!params) {
      return res.status(400).json({ error: "Invalid request parameters" });
    }

    const { organizationId, apiKeyId } = params;

    // Check if organization exists
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // Handle different HTTP methods
    switch (req.method) {
      case "DELETE":
        return await handleDelete(req, res, organizationId, apiKeyId);
      default:
        res.status(405).json({ error: "Method Not Allowed" });
        return;
    }
  } catch (e) {
    logger.error("Failed to process organization API key request", e);
    res.status(500).json({ error: "Internal server error" });
  }
}

async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse,
  organizationId: string,
  apiKeyId: string,
) {
  // Check if API key exists and belongs to the organization
  const apiKey = await prisma.apiKey.findFirst({
    where: {
      id: apiKeyId,
      orgId: organizationId,
      scope: "ORGANIZATION",
    },
  });

  if (!apiKey) {
    return res.status(404).json({ error: "API key not found" });
  }

  // Delete the API key
  const deleted = await new ApiAuthService(prisma, redis).deleteApiKey(
    apiKeyId,
    organizationId,
    "ORGANIZATION",
  );

  if (!deleted) {
    return res.status(500).json({ error: "Failed to delete API key" });
  }

  // Log the API key deletion
  await auditLog({
    resourceType: "apiKey",
    resourceId: apiKeyId,
    action: "delete",
    orgId: organizationId,
    orgRole: "ADMIN",
    apiKeyId: "ADMIN_KEY",
  });

  logger.info(
    `Deleted API key ${apiKeyId} for organization ${organizationId} via admin API`,
  );

  return res.status(200).json({ success: true });
}
