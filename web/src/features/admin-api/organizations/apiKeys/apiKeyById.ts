import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";
import { logger, redis } from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { z } from "zod/v4";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";

export const validateQueryParams = (
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

export async function handleDeleteApiKey(
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
