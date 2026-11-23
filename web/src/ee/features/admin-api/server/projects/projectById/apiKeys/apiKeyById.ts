import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";
import { deleteApiKey } from "@/src/features/apiKey/apiKeyService";
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
  const deleted = await deleteApiKey(prisma, {
    id: apiKeyId,
    projectId,
    isInAppAgentKey: false,
    actor: {
      orgId,
      projectId,
      orgRole: "ADMIN",
      apiKeyId: authenticatingApiKeyId,
    },
  });

  if (!deleted) {
    return res.status(404).json({ message: "API key not found" });
  }

  logger.info(
    `Deleted API key ${apiKeyId} for project ${projectId} via public API`,
  );

  return res.status(200).json({ success: true });
}
