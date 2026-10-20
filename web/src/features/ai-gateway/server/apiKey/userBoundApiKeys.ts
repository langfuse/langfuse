import type { ApiKey, Prisma, Role } from "@langfuse/shared/src/db";
import { invalidateCachedApiKeys } from "@langfuse/shared/src/server";
import { auditLog, type AuditLogActor } from "@/src/features/audit-logs/server";
import { invalidateGatewayResolveCacheForApiKey } from "@/src/features/ai-gateway/server/resolve/gatewayResolveCache";
import { hasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";

/** deleteUserBoundApiKeys removes gateway keys bound to userId on the caller's transaction, evicts their caches, and returns them for post-commit eviction. */
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
  await evictCaches(keys);
  return keys.filter((key): key is RevokedApiKey => key.orgId !== null);
}

/** deleteUserBoundApiKeysForRole removes the user's gateway keys in orgId when role can no longer invoke the gateway. */
export async function deleteUserBoundApiKeysForRole(
  tx: Prisma.TransactionClient,
  p: { userId: string; orgId: string; role: Role },
): Promise<RevokedApiKey[]> {
  if (hasOrganizationAccess({ role: p.role, scope: "gateway:invoke" }))
    return [];
  return deleteUserBoundApiKeys(tx, { userId: p.userId, orgId: p.orgId });
}

/** evictRevokedApiKeys re-clears the caches of committed revocations and writes one audit entry per key; call after commit. */
export async function evictRevokedApiKeys(
  keys: RevokedApiKey[],
  actor: RevocationActor,
): Promise<void> {
  if (keys.length === 0) return;
  await Promise.all([
    evictCaches(keys),
    ...keys.map((key) => auditRevocation(key, actor)),
  ]);
}

/** evictCaches clears the auth and gateway resolve caches of the keys. */
async function evictCaches(keys: ApiKey[]) {
  await Promise.all([
    invalidateCachedApiKeys(keys, "user-bound gateway keys"),
    ...keys.map(evictGatewayResolveCache),
  ]);
}

/** evictGatewayResolveCache drops the key's cached resolve contexts when it has a hash. */
async function evictGatewayResolveCache(key: ApiKey) {
  if (!key.fastHashedSecretKey) return;
  await invalidateGatewayResolveCacheForApiKey(key.fastHashedSecretKey);
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
