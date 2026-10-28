import type { PrismaClient } from "@langfuse/shared/src/db";

/**
 * Names for the organization API keys gateway analytics group by, with each
 * key's bound owner. Traffic is attributed by key, never by the user ID on the
 * span: a key without an owner lets the caller set any user ID.
 */
export class GatewayAnalyticsLabelsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getLabels(organizationId: string) {
    // Every organization key whose role grants gateway:invoke can call the
    // gateway, not only keys with a gateway association.
    const keys = await this.prisma.apiKey.findMany({
      where: { orgId: organizationId, scope: "ORGANIZATION" },
      select: {
        id: true,
        note: true,
        displaySecretKey: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return {
      apiKeys: keys.map((apiKey) => ({
        id: apiKey.id,
        name: apiKey.note,
        detail: apiKey.displaySecretKey,
        owner: apiKey.user && {
          id: apiKey.user.id,
          name: apiKey.user.name,
          detail: apiKey.user.email,
        },
      })),
    };
  }
}
