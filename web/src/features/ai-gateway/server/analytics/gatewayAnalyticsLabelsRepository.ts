import type { PrismaClient } from "@langfuse/shared/src/db";

import {
  getKeyOwnerFilter,
  type GatewayUsageScope,
} from "@/src/features/ai-gateway/server/gatewayUsageScope";

type LabelUser = { id: string; name: string | null; email: string | null };

/**
 * Names for the IDs gateway analytics group by: organization API keys and the
 * users traffic is attributed to (organization members and key owners).
 */
export class GatewayAnalyticsLabelsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Gateway keys are always included. Plain organization keys can also call
   * the gateway, but only callers who may list organization API keys get them.
   * With an `ownUsage` scope, only that user and the keys bound to them are named.
   */
  async getLabels(params: {
    organizationId: string;
    includePlainOrganizationKeys: boolean;
    usageScope: GatewayUsageScope;
  }) {
    const ownerUserId = getKeyOwnerFilter(params.usageScope);
    const ownedBy = ownerUserId !== undefined && { userId: ownerUserId };
    const [keys, memberships] = await Promise.all([
      this.prisma.apiKey.findMany({
        where: {
          orgId: params.organizationId,
          scope: "ORGANIZATION",
          isInAppAgentKey: false,
          ...(!params.includePlainOrganizationKeys && {
            gatewayAssociation: { isNot: null },
          }),
          ...ownedBy,
        },
        select: {
          id: true,
          note: true,
          displaySecretKey: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.organizationMembership.findMany({
        where: { orgId: params.organizationId, ...ownedBy },
        select: { user: { select: { id: true, name: true, email: true } } },
      }),
    ]);

    const users = new Map<string, LabelUser>();
    for (const { user } of memberships) users.set(user.id, user);
    for (const apiKey of keys) {
      if (apiKey.user) users.set(apiKey.user.id, apiKey.user);
    }

    return {
      apiKeys: keys.map((apiKey) => ({
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
