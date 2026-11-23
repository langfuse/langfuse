import { type Prisma } from "@langfuse/shared/src/db";

/** findGatewayKeyMetadata maps each gateway key bound to the user to its metadata, so a delete audit can record it before the association cascades away */
export async function findGatewayKeyMetadata(
  tx: Prisma.TransactionClient,
  owner: { userId: string; orgId?: string },
): Promise<Map<string, Prisma.JsonValue>> {
  const associations = await tx.gatewayApiKeyAssociation.findMany({
    where: { apiKey: owner },
    select: { apiKeyId: true, metadata: true },
  });
  return new Map(
    associations.map(({ apiKeyId, metadata }) => [apiKeyId, metadata]),
  );
}
