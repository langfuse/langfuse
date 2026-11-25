import type { ApiKey, Prisma } from "@langfuse/shared/src/db";
import { invalidateCachedApiKeys, logger } from "@langfuse/shared/src/server";
import {
  auditLog,
  type AuditLogActor,
} from "@/src/features/audit-logs/auditLog";

import { invalidateGatewayResolveCacheForApiKey } from "@/src/features/ai-gateway/server/resolve/gatewayResolveCache";

/** deleteUserBoundApiKeys removes gateway keys bound to userId on the caller's transaction and returns them for post-commit eviction. */
export async function deleteUserBoundApiKeys(
  tx: Prisma.TransactionClient,
  p: { userId: string; orgId?: string },
): Promise<RevokedApiKey[]> {
  const keys = await tx.apiKey.findMany({
    where: { userId: p.userId, orgId: p.orgId ?? { not: null } },
    include: { gatewayAssociation: { select: { metadata: true } } },
  });
  if (keys.length === 0) return [];
  await tx.apiKey.deleteMany({
    where: { id: { in: keys.map((key) => key.id) } },
  });
  return keys.filter((key): key is RevokedApiKey => key.orgId !== null);
}

/** evictRevokedApiKeys clears the caches of committed revocations and writes one audit entry per key, logging instead of throwing; call after commit. */
export async function evictRevokedApiKeys(
  keys: RevokedApiKey[],
  actor: RevocationActor,
): Promise<void> {
  if (keys.length === 0) return;
  const results = await Promise.allSettled([
    evictCaches(keys),
    ...keys.map((key) => auditRevocation(key, actor)),
  ]);
  logFailures(results, keys);
}

/** evictUserGatewayResolveCache drops the cached resolve contexts of the user's keys in orgId, whose owner role check runs only on a cache miss; call after a committed role change. */
export async function evictUserGatewayResolveCache(
  prisma: Prisma.TransactionClient,
  p: { orgId: string; userId: string },
): Promise<void> {
  const keys = await prisma.apiKey.findMany({
    where: { orgId: p.orgId, userId: p.userId },
    select: { fastHashedSecretKey: true },
  });
  await Promise.all(keys.map(evictGatewayResolveCache));
}

/** evictCaches clears the auth and gateway resolve caches of the keys. */
async function evictCaches(keys: ApiKey[]) {
  await Promise.all([
    invalidateCachedApiKeys(keys, "user-bound gateway keys"),
    ...keys.map(evictGatewayResolveCache),
  ]);
}

/** evictGatewayResolveCache drops the key's cached resolve contexts when it has a hash. */
async function evictGatewayResolveCache(
  key: Pick<ApiKey, "fastHashedSecretKey">,
) {
  if (!key.fastHashedSecretKey) return;
  await invalidateGatewayResolveCacheForApiKey(key.fastHashedSecretKey);
}

/** logFailures logs post-commit eviction failures without failing the committed change. */
function logFailures(
  results: PromiseSettledResult<unknown>[],
  keys: RevokedApiKey[],
) {
  for (const result of results) {
    if (result.status === "fulfilled") continue;
    logger.error("Failed to evict revoked user-bound gateway API keys", {
      apiKeyIds: keys.map((key) => key.id),
      error: result.reason,
    });
  }
}

/** auditRevocation records the deletion of one key in the key's organization. */
function auditRevocation(key: RevokedApiKey, actor: RevocationActor) {
  return auditLog({
    ...actorInOrg(actor, key.orgId),
    resourceType: "apiKey",
    resourceId: key.id,
    action: "delete",
    before: {
      metadata: key.gatewayAssociation?.metadata,
      apiKey: {
        id: key.id,
        publicKey: key.publicKey,
        displaySecretKey: key.displaySecretKey,
        note: key.note,
        createdAt: key.createdAt,
        expiresAt: key.expiresAt,
        lastUsedAt: key.lastUsedAt,
        createdByUserId: key.createdByUserId,
      },
    },
    after: { reason: "user_unbound", userId: key.userId },
  });
}

/** actorInOrg attributes a session-less actor to the revoked key's organization. */
function actorInOrg(actor: RevocationActor, orgId: string): AuditLogActor {
  if ("session" in actor) return actor;
  return { ...actor, orgId };
}

/** RevocationActor is the triggering actor; non-session actors take the key's orgId. */
export type RevocationActor =
  | Extract<AuditLogActor, { session: unknown }>
  | { userId: string }
  | { apiKeyId: string };

/** RevokedApiKey is a deleted org key row with the gateway metadata its audit entry records. */
export type RevokedApiKey = Prisma.ApiKeyGetPayload<{
  include: { gatewayAssociation: { select: { metadata: true } } };
}> & { orgId: string };
