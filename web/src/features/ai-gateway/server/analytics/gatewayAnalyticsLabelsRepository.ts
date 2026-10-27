import type { PrismaClient } from "@langfuse/shared/src/db";

type LabelUser = { id: string; name: string | null; email: string | null };

/**
 * Names for the IDs gateway analytics group by: gateway API keys and the
 * users traffic is attributed to (organization members and key owners).
 */
export class GatewayAnalyticsLabelsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getLabels(organizationId: string) {
    const [keys, memberships] = await Promise.all([
      this.prisma.gatewayApiKeyAssociation.findMany({
        where: { apiKey: { orgId: organizationId, scope: "ORGANIZATION" } },
        select: {
          apiKey: {
            select: {
              id: true,
              note: true,
              displaySecretKey: true,
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      }),
      this.prisma.organizationMembership.findMany({
        where: { orgId: organizationId },
        select: { user: { select: { id: true, name: true, email: true } } },
      }),
    ]);

    const users = new Map<string, LabelUser>();
    for (const { user } of memberships) users.set(user.id, user);
    for (const { apiKey } of keys) {
      if (apiKey.user) users.set(apiKey.user.id, apiKey.user);
    }

    return {
      apiKeys: keys.map(({ apiKey }) => ({
        id: apiKey.id,
        name: apiKey.note,
        detail: apiKey.displaySecretKey,
      })),
      users: [...users.values()].map((user) => ({
        id: user.id,
        name: user.name,
        detail: user.email,
      })),
    };
  }
}
