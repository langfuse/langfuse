import { type Prisma, type PrismaClient } from "@langfuse/shared/src/db";
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
  const deleted = await withTransaction(prisma, (tx) =>
    deleteAndAudit(tx, key, actor),
  );
  if (!deleted) return null;
  await evictCachedApiKey(deleted);
  return deleted;
}

/** deleteAndAudit deletes the api key and records its delete audit log in tx */
async function deleteAndAudit(
  tx: Prisma.TransactionClient,
  key: ApiKeyFilter,
  actor: AuditLogActor,
): Promise<DeletedApiKey | null> {
  const deleted = await deleteApiKeyRow(tx, key);
  if (!deleted) return null;
  await auditLog(
    {
      ...actor,
      resourceType: "apiKey",
      resourceId: deleted.id,
      action: "delete",
      before: deleted,
    },
    tx,
  );
  return deleted;
}

/** evictCachedApiKey drops the deleted key from the credential and gateway resolve caches */
async function evictCachedApiKey(apiKey: DeletedApiKey): Promise<void> {
  await invalidateCachedApiKeys([apiKey], `key ${apiKey.id}`);
  // an organization key whose role grants gateway:invoke may be in the resolve cache
  if (apiKey.fastHashedSecretKey) {
    await invalidateGatewayResolveCacheForApiKey(apiKey.fastHashedSecretKey);
  }
}

/** ApiKeyFilter names the api key and the project or organization it must belong to */
type ApiKeyFilter = Parameters<typeof deleteApiKeyRow>[1];

/** DeleteApiKeyParams is the api key filter plus the actor recorded in the audit log */
type DeleteApiKeyParams = ApiKeyFilter & { actor: AuditLogActor };

/** DeletedApiKey is the non-secret snapshot of a deleted api key */
type DeletedApiKey = NonNullable<Awaited<ReturnType<typeof deleteApiKeyRow>>>;
