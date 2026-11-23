import { type NextApiRequest, type NextApiResponse } from "next";
import { logger } from "@langfuse/shared/src/server";
import { z } from "zod";
import { deleteApiKey } from "@/src/features/apiKey/apiKeyService";

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
  const deleted = await deleteApiKey({
    id: apiKeyId,
    orgId: organizationId,
    isInAppAgentKey: false,
    actor: { orgId: organizationId, orgRole: "ADMIN", apiKeyId: "ADMIN_KEY" },
  });

  if (!deleted) {
    return res.status(404).json({ error: "API key not found" });
  }

  logger.info(
    `Deleted API key ${apiKeyId} for organization ${organizationId} via admin API`,
  );

  return res.status(200).json({ success: true });
}
