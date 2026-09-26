import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/server";
import { z } from "zod";
import { createApiKey } from "@langfuse/shared/src/server/auth/apiKeys";
import { OrganizationId, SystemRoleId, UserId } from "@langfuse/shared/rbac";

export const validateQueryAndExtractId = (query: unknown): string | null => {
  const inputQuerySchema = z.object({
    organizationId: z.string(),
  });
  const validation = inputQuerySchema.safeParse(query);
  if (!validation.success) {
    return null;
  }
  return validation.data.organizationId;
};

export async function handleGetApiKeys(
  req: NextApiRequest,
  res: NextApiResponse,
  organizationId: string,
) {
  const apiKeys = await prisma.apiKey.findMany({
    where: {
      orgId: organizationId,
      scope: "ORGANIZATION",
      isInAppAgentKey: false,
    },
    select: {
      id: true,
      createdAt: true,
      expiresAt: true,
      lastUsedAt: true,
      note: true,
      publicKey: true,
      displaySecretKey: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return res.status(200).json({ apiKeys });
}

export async function handleCreateApiKey(
  req: NextApiRequest,
  res: NextApiResponse,
  organizationId: string,
) {
  // Validate the request body
  const createApiKeySchema = z.object({
    note: z.string().optional(),
  });

  const validationResult = createApiKeySchema.safeParse(req.body);

  if (!validationResult.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: z.formatError(validationResult.error),
    });
  }

  const { note } = validationResult.data;

  // The admin API authenticates with the static ADMIN_API_KEY, so there is no
  // user or API-key principal to record as the key's creator. Attribute it to
  // an organization member so the createApiKey creator contract is satisfied.
  const member = await prisma.organizationMembership.findFirst({
    where: { orgId: organizationId },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  if (!member) {
    return res.status(400).json({
      error: "Organization has no members to own the API key",
    });
  }

  // Create the API key
  const apiKeyMeta = await createApiKey(prisma, {
    owner: OrganizationId(organizationId),
    role: SystemRoleId("ORGANIZATION"),
    creator: UserId(member.userId),
    name: note,
  });

  // Log the API key creation
  await auditLog({
    resourceType: "apiKey",
    resourceId: apiKeyMeta.id,
    action: "create",
    orgId: organizationId,
    orgRole: "ADMIN",
    apiKeyId: "ADMIN_KEY",
  });

  logger.info(
    `Created API key ${apiKeyMeta.id} for organization ${organizationId} via admin API`,
  );

  return res.status(201).json(apiKeyMeta);
}
