import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";
import { logger, redis } from "@langfuse/shared/src/server";
import { ApiAuthService } from "@/src/features/public-api/server";
import { auditLog } from "@/src/features/audit-logs/server";
import { z } from "zod";

export const validateQueryParams = (
  query: unknown,
): { projectId: string; apiKeyId: string } | null => {
  const inputQuerySchema = z.object({
    projectId: z.string(),
    apiKeyId: z.string(),
  });
  const validation = inputQuerySchema.safeParse(query);
  if (!validation.success) {
    return null;
  }
  return validation.data;
};

/** handleDeleteApiKey revokes a project key and records the authenticating actor. */
export async function handleDeleteApiKey(
  req: NextApiRequest,
  res: NextApiResponse,
  projectId: string,
  apiKeyId: string,
  orgId: string,
  authenticatingApiKeyId: string,
) {
  const apiKey = await prisma.apiKey.findFirst({
    where: {
      id: apiKeyId,
      projectId,
      scope: "PROJECT",
      isInAppAgentKey: false,
    },
  });

  if (!apiKey) {
    return res.status(404).json({ message: "API key not found" });
  }

  const deleted = await new ApiAuthService(prisma, redis).deleteApiKey(
    apiKeyId,
    projectId,
    "PROJECT",
  );

  if (!deleted) {
    return res.status(500).json({ message: "Failed to delete API key" });
  }

  await auditLog({
    resourceType: "apiKey",
    resourceId: apiKeyId,
    action: "delete",
    orgId: orgId,
    projectId: projectId,
    orgRole: "ADMIN",
    apiKeyId: authenticatingApiKeyId,
  });

  logger.info(
    `Deleted API key ${apiKeyId} for project ${projectId} via public API`,
  );

  return res.status(200).json({ success: true });
}
