import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";
import {
  invalidateCachedApiKeys,
  logger,
  withTransaction,
} from "@langfuse/shared/src/server";
import { deleteApiKey } from "@langfuse/shared/src/server/auth/apiKeys";
import { ApiKeyId, ProjectId } from "@langfuse/shared/rbac";
import { auditLog } from "@/src/features/audit-logs/auditLog";
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
  const deleted = await withTransaction(prisma, async (tx) => {
    const apiKey = await deleteApiKey(tx, {
      scope: ProjectId(projectId),
      id: ApiKeyId(apiKeyId),
      isInAppAgentKey: false,
    });
    if (apiKey) {
      await auditLog(
        {
          resourceType: "apiKey",
          resourceId: apiKey.id,
          action: "delete",
          before: apiKey,
          orgId: orgId,
          projectId: projectId,
          orgRole: "ADMIN",
          apiKeyId: authenticatingApiKeyId,
        },
        tx,
      );
    }
    return apiKey;
  });

  if (!deleted) {
    return res.status(404).json({ message: "API key not found" });
  }

  await invalidateCachedApiKeys([deleted], `key ${deleted.id}`);

  logger.info(
    `Deleted API key ${apiKeyId} for project ${projectId} via public API`,
  );

  return res.status(200).json({ success: true });
}
