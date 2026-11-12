import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";
import {
  invalidateCachedApiKeys,
  logger,
  withTransaction,
} from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { z } from "zod";
import {
  deleteApiKey,
  orgBoundApiKeyDeleteScope,
  orgBoundApiKeyScopes,
} from "@langfuse/shared/src/server/auth/apiKeys";
import { ApiKeyId } from "@langfuse/shared/rbac";

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
    const apiKey = await tx.apiKey.findFirst({
      where: {
        id: apiKeyId,
        orgId: organizationId,
        scope: { in: orgBoundApiKeyScopes },
        isInAppAgentKey: false,
      },
      select: { scope: true, userId: true },
    });
    if (!apiKey) return null;

    const deletedApiKey = await deleteApiKey(tx, {
      ...orgBoundApiKeyDeleteScope(organizationId, apiKey),
      id: ApiKeyId(apiKeyId),
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

  await invalidateCachedApiKeys([deleted], `key ${deleted.id}`);

  logger.info(
    `Deleted API key ${apiKeyId} for organization ${organizationId} via admin API`,
  );

  return res.status(200).json({ success: true });
}
