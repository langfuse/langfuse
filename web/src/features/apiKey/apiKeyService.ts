import { type PrismaClient } from "@langfuse/shared/src/db";
import {
  invalidateCachedApiKeys,
  withTransaction,
} from "@langfuse/shared/src/server";
import { deleteApiKey as deleteApiKeyRow } from "@langfuse/shared/src/server/auth/apiKeys";

import {
  auditLog,
  type AuditLogActor,
} from "@/src/features/audit-logs/auditLog";
import { invalidateGatewayResolveCacheForApiKey } from "@/src/features/ai-gateway/server/resolve/gatewayResolveCache";

/** deleteApiKey deletes an api key with its audit log and evicts its cached credentials after commit, returning it or null when none matches */
export async function deleteApiKey(
  prisma: PrismaClient,
  { actor, ...key }: DeleteApiKeyParams,
): Promise<DeletedApiKey | null> {
  const deleted = await withTransaction(prisma, async (tx) => {
    const apiKey = await deleteApiKeyRow(tx, key);
    if (!apiKey) return null;
    await auditLog(
      {
        ...actor,
        resourceType: "apiKey",
        resourceId: apiKey.id,
        action: "delete",
        before: apiKey,
      },
      tx,
    );
    return apiKey;
  });
  if (!deleted) return null;

  await invalidateCachedApiKeys([deleted], `key ${deleted.id}`);
  // an organization key whose role grants gateway:invoke may be in the resolve cache
  if (deleted.fastHashedSecretKey) {
    await invalidateGatewayResolveCacheForApiKey(deleted.fastHashedSecretKey);
  }
  return deleted;
}

/** ApiKeyFilter names the api key and the project or organization it must belong to */
type ApiKeyFilter = Parameters<typeof deleteApiKeyRow>[1];

/** DeleteApiKeyParams is the api key filter plus the actor recorded in the audit log */
type DeleteApiKeyParams = ApiKeyFilter & { actor: AuditLogActor };

/** DeletedApiKey is the non-secret snapshot of a deleted api key */
type DeletedApiKey = NonNullable<Awaited<ReturnType<typeof deleteApiKeyRow>>>;
