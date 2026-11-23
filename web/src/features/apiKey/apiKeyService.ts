import { prisma } from "@langfuse/shared/src/db";
import {
  invalidateCachedApiKeys,
  withTransaction,
} from "@langfuse/shared/src/server";
import { deleteApiKey as deleteApiKeyRow } from "@langfuse/shared/src/server/auth/apiKeys";
import { invalidateGatewayResolveCacheForApiKey } from "@/src/features/ai-gateway/server/resolve/gatewayResolveCache";
import {
  auditLog,
  type AuditLogActor,
} from "@/src/features/audit-logs/auditLog";

/** deleteApiKey deletes an api key with its audit log and evicts its cached credentials after commit */
export async function deleteApiKey({
  actor,
  ...key
}: ApiKeyFilter & { actor: AuditLogActor }): Promise<DeletedApiKey | null> {
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

/** DeletedApiKey is the non-secret snapshot of a deleted api key */
type DeletedApiKey = NonNullable<Awaited<ReturnType<typeof deleteApiKeyRow>>>;
