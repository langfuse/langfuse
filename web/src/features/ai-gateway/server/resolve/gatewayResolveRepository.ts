import type { GatewayProvider, PrismaClient } from "@langfuse/shared/src/db";
import { orgBoundApiKeyScopes } from "@langfuse/shared/src/server/auth/apiKeys";

import { GATEWAY_DEFAULT_SPEND_LIMIT_SCOPES } from "@/src/features/ai-gateway/server/spendLimits/gatewayDefaultSpendLimits";

export class GatewayResolveRepository {
  constructor(private readonly prisma: PrismaClient) {}

  resolveContext(params: {
    fastHashedSecretKey: string;
    providers: GatewayProvider[];
  }) {
    const now = new Date();
    return this.prisma.apiKey.findFirst({
      relationLoadStrategy: "join",
      where: {
        fastHashedSecretKey: params.fastHashedSecretKey,
        scope: { in: orgBoundApiKeyScopes },
        orgId: { not: null },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: {
        id: true,
        orgId: true,
        scope: true,
        userId: true,
        expiresAt: true,
        note: true,
        user: {
          select: {
            name: true,
            email: true,
            organizationMemberships: { select: { orgId: true, role: true } },
            // Across the user's organizations; the caller keeps the key's.
            gatewaySpendLimits: {
              orderBy: { interval: "asc" },
              select: {
                id: true,
                organizationId: true,
                scope: true,
                interval: true,
                limitUsd: true,
                countingStartedAt: true,
              },
            },
          },
        },
        gatewayAssociation: { select: { metadata: true, allowedModels: true } },
        gatewaySpendLimits: {
          orderBy: { interval: "asc" },
          select: {
            id: true,
            scope: true,
            interval: true,
            limitUsd: true,
            countingStartedAt: true,
          },
        },
        organization: {
          select: {
            cloudConfig: true,
            // Apply to the key or its user when they have no limit of their own.
            gatewaySpendLimits: {
              where: {
                scope: {
                  in: Object.values(GATEWAY_DEFAULT_SPEND_LIMIT_SCOPES),
                },
              },
              select: {
                id: true,
                scope: true,
                interval: true,
                limitUsd: true,
                countingStartedAt: true,
              },
            },
            gatewayConfig: {
              select: {
                defaultIngestionProjectId: true,
                ingestionMode: true,
                defaultIngestionProject: {
                  select: { id: true, orgId: true, deletedAt: true },
                },
              },
            },
            gatewayAiConnections: {
              where: {
                provider: { in: params.providers },
                status: "ENABLED",
              },
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              select: {
                id: true,
                name: true,
                provider: true,
                encryptedCredential: true,
                allowedModels: true,
                config: true,
                baseURL: true,
                extraHeaders: true,
              },
            },
          },
        },
      },
    });
  }
}
