import { type Prisma } from "@langfuse/shared/src/db";
import { invalidateCachedUserApiKeys } from "@langfuse/shared/src/server";
import { evictUserGatewayResolveCache } from "@/src/features/ai-gateway/server/apiKey/userBoundApiKeys";

/** evictUserAccessCaches drops what is cached from the users' roles in orgId: the credentials of their USER keys and the gateway resolve contexts of all their keys. Call after a committed role or membership change. */
export async function evictUserAccessCaches(
  prisma: Prisma.TransactionClient,
  p: { orgId: string; userIds: string[] },
): Promise<void> {
  await invalidateCachedUserApiKeys(prisma, p);
  await evictUserGatewayResolveCache(prisma, p);
}
