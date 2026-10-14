import type { GatewayProvider, PrismaClient } from "@langfuse/shared/src/db";
import { logger, redis as defaultRedis } from "@langfuse/shared/src/server";
import type { Cluster, Redis } from "ioredis";

import type { GatewayApiKeyAuthContext } from "@/src/features/ai-gateway/server/auth/gatewayApiKeyAuthenticator";
import { formatGatewayModelSlug } from "@/src/features/ai-gateway/fns/gatewayModelSlug";
import { GatewayControlPlaneError } from "@/src/features/ai-gateway/server/gatewayControlPlaneError";
import {
  type GatewayApiFormat,
  gatewayProviders,
  providerSupportsApiFormat,
} from "@/src/features/ai-gateway/server/provider/registry";
import {
  type GatewayModelCatalogEntry,
  GatewayModelCatalogService,
} from "./gatewayModelCatalogService";
import { GatewayModelsRepository } from "./gatewayModelsRepository";

export class GatewayModelsService {
  private readonly repository: GatewayModelsRepository;
  private readonly modelCatalogService: GatewayModelCatalogService;

  constructor(
    prisma: PrismaClient,
    fetcher: typeof fetch = fetch,
    redis: Redis | Cluster | null = defaultRedis,
  ) {
    this.repository = new GatewayModelsRepository(prisma);
    this.modelCatalogService = new GatewayModelCatalogService(
      prisma,
      fetcher,
      redis,
    );
  }

  async list(params: {
    context: GatewayApiKeyAuthContext;
    apiFormat: GatewayApiFormat;
  }) {
    const connections = await this.repository.getConnections({
      organizationId: params.context.organizationId,
      providers: gatewayProviders.filter((provider) =>
        providerSupportsApiFormat(provider, params.apiFormat),
      ) as GatewayProvider[],
    });
    const results = await Promise.all(
      connections.map(async (connection) => ({
        connection,
        catalog: await this.modelCatalogService.getModelCatalog({
          organizationId: params.context.organizationId,
          connectionId: connection.id,
        }),
      })),
    );
    const failures = results.filter((result) => !result.catalog.success);
    if (failures.length > 0) {
      logger.warn("Gateway model discovery omitted unavailable connections", {
        organizationId: params.context.organizationId,
        connections: failures.map(({ connection, catalog }) => ({
          id: connection.id,
          error: catalog.success ? undefined : catalog.error,
        })),
      });
    }
    if (results.length > 0 && failures.length === results.length) {
      throw new GatewayControlPlaneError(
        "Gateway model discovery is temporarily unavailable",
        503,
      );
    }

    return {
      data: results
        .flatMap(({ connection, catalog }) =>
          catalog.success
            ? catalog.models.map((model) => ({
                ...model,
                id: formatGatewayModelSlug(connection.name, model.id),
              }))
            : [],
        )
        .sort(compareModels),
    };
  }
}

function compareModels(
  left: GatewayModelCatalogEntry,
  right: GatewayModelCatalogEntry,
) {
  if (left.id < right.id) {
    return -1;
  }
  if (left.id > right.id) {
    return 1;
  }
  return 0;
}
