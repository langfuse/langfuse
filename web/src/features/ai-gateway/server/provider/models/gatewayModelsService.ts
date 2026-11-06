import type { GatewayProvider, PrismaClient } from "@langfuse/shared/src/db";
import { logger, redis as defaultRedis } from "@langfuse/shared/src/server";
import type { Cluster, Redis } from "ioredis";

import type { GatewayApiKeyAuthContext } from "@/src/features/ai-gateway/server/auth/gatewayApiKeyAuthenticator";
import { formatGatewayModelSlug } from "@/src/features/ai-gateway/fns/formatGatewayModelSlug";
import { getBedrockModelApiFormats } from "@/src/features/ai-gateway/fns/getBedrockModelApiFormats";
import { isGatewayModelAllowed } from "@/src/features/ai-gateway/fns/isGatewayModelAllowed";
import { toGatewayAllowedModelsSet } from "@/src/features/ai-gateway/fns/toGatewayAllowedModelsSet";
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
    redis: Redis | Cluster | null = defaultRedis,
  ) {
    this.repository = new GatewayModelsRepository(prisma);
    this.modelCatalogService = new GatewayModelCatalogService(prisma, redis);
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
    const successfulResults = results.filter(
      (result) => result.catalog.success,
    );
    for (const { connection, catalog } of results) {
      if (!catalog.success) {
        logger.warn("Failed to discover models for AI Gateway connection", {
          organizationId: params.context.organizationId,
          connectionId: connection.id,
          connectionName: connection.name,
          error: catalog.error,
        });
      }
    }
    if (results.length > 0 && successfulResults.length === 0) {
      throw new GatewayControlPlaneError(
        "Gateway model discovery is temporarily unavailable",
        503,
      );
    }

    return {
      data: successfulResults
        .flatMap(({ connection, catalog }) => {
          if (!catalog.success) return [];
          const allowedModels = toGatewayAllowedModelsSet(
            connection.allowedModels,
          );
          return catalog.models
            .filter(
              (model) =>
                isGatewayModelAllowed(allowedModels, model.id) &&
                modelMatchesApiFormat(model, params.apiFormat),
            )
            .map((model) => ({
              ...model,
              id: formatGatewayModelSlug(connection.name, model.id),
              provider: toCatalogFamily(model.provider, params.apiFormat),
            }));
        })
        .sort(compareModels),
    };
  }
}

function modelMatchesApiFormat(
  model: GatewayModelCatalogEntry,
  apiFormat: GatewayApiFormat,
) {
  if (model.provider !== "BEDROCK") return true;
  const formats = getBedrockModelApiFormats(model.id);
  if (apiFormat === "anthropic.messages") return formats.includes(apiFormat);
  // The gateway asks for OpenAI models with `openai.responses` on every OpenAI
  // route, so a model serving only Chat Completions must still be listed.
  return formats.some((format) => format !== "anthropic.messages");
}

// The gateway renders and validates entries by API family, so Bedrock models
// are reported as the family whose route serves them.
function toCatalogFamily(
  provider: GatewayModelCatalogEntry["provider"],
  apiFormat: GatewayApiFormat,
) {
  if (provider !== "BEDROCK") return provider;
  return apiFormat === "anthropic.messages" ? "ANTHROPIC" : "OPENAI";
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

export const __test = { modelMatchesApiFormat };
