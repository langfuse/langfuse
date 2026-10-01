import type { GatewayProvider, PrismaClient } from "@langfuse/shared/src/db";
import { redis as defaultRedis } from "@langfuse/shared/src/server";
import type { Cluster, Redis } from "ioredis";

import type { GatewayApiKeyAuthContext } from "@/src/features/ai-gateway/server/auth/gatewayApiKeyAuthenticator";
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
      connections.map((connection) =>
        this.modelCatalogService.getModelCatalog({
          organizationId: params.context.organizationId,
          connectionId: connection.id,
        }),
      ),
    );
    if (results.some((result) => !result.success)) {
      throw new GatewayControlPlaneError(
        "Gateway model discovery is temporarily unavailable",
        503,
      );
    }

    const modelsById = new Map<string, GatewayModelCatalogEntry>();
    for (const result of results) {
      if (!result.success) continue;
      for (const model of result.models) {
        if (!modelsById.has(model.id)) modelsById.set(model.id, model);
      }
    }
    return {
      data: [...modelsById.values()].sort(compareModels),
    };
  }
}

function compareModels(
  left: GatewayModelCatalogEntry,
  right: GatewayModelCatalogEntry,
) {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}
