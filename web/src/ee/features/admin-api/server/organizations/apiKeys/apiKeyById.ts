import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";
import { logger, withTransaction } from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { evictDeletedApiKeys } from "@/src/features/apiKey/evictDeletedApiKeys";
import { z } from "zod";
import { deleteApiKey } from "@langfuse/shared/src/server/auth/apiKeys";

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
  const deleted = await withTransaction(prisma, async (tx) => {
    const deletedApiKey = await deleteApiKey(tx, {
      id: apiKeyId,
      orgId: organizationId,
      isInAppAgentKey: false,
    });
    if (deletedApiKey) {
      await auditLog(
        {
          resourceType: "apiKey",
          resourceId: deletedApiKey.id,
          action: "delete",
          before: deletedApiKey,
          orgId: organizationId,
          orgRole: "ADMIN",
          apiKeyId: "ADMIN_KEY",
        },
        tx,
      );
    }
    return deletedApiKey;
  });

  if (!deleted) {
    return res.status(404).json({ error: "API key not found" });
  }

  await evictDeletedApiKeys([deleted], `key ${deleted.id}`);

  logger.info(
    `Deleted API key ${apiKeyId} for organization ${organizationId} via admin API`,
  );

  return res.status(200).json({ success: true });
}
