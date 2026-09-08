import type { GatewayProvider, PrismaClient } from "@langfuse/shared/src/db";
import { redis as defaultRedis } from "@langfuse/shared/src/server";
import type { Cluster, Redis } from "ioredis";

import { isGatewayEnabledForOrganization } from "@/src/features/llm-gateway/server/availability";
import { GatewayControlPlaneError } from "@/src/features/llm-gateway/server/gatewayControlPlaneError";
import {
  type GatewayApiFormat,
  gatewayProviders,
  providerSupportsApiFormat,
} from "@/src/features/llm-gateway/server/provider";
import {
  type GatewayModelCatalogEntry,
  GatewayModelCatalogService,
} from "./gatewayModelCatalogService";
import { GatewayModelsRepository } from "./gatewayModelsRepository";

const SYNTHETIC_CREATED_AT = "1970-01-01T00:00:00.000Z";

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
    fastHashedSecretKey: string;
    apiFormat: GatewayApiFormat;
    beforeId?: string;
    afterId?: string;
    limit?: number;
  }) {
    const supportedProviders = gatewayProviders.filter((provider) =>
      providerSupportsApiFormat(provider, params.apiFormat),
    ) as GatewayProvider[];
    const context = await this.repository.getContext({
      fastHashedSecretKey: params.fastHashedSecretKey,
      providers: supportedProviders,
    });
    const organizationId = context?.apiKey.orgId;
    const organization = context?.apiKey.organization;
    if (!context || !organizationId || !organization) {
      throw new GatewayControlPlaneError("Invalid gateway key", 401);
    }
    if (!isGatewayEnabledForOrganization(organizationId)) {
      throw new GatewayControlPlaneError(
        "Gateway is not enabled for this organization",
        403,
      );
    }

    const results = await Promise.all(
      organization.gatewayAiConnections.map((connection) =>
        this.modelCatalogService.getModelCatalog({
          organizationId,
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
    const models = [...modelsById.values()].sort(compareModels);

    return params.apiFormat === "anthropic.messages"
      ? createAnthropicResponse(models, params)
      : createOpenAiResponse(models);
  }
}

function createOpenAiResponse(models: GatewayModelCatalogEntry[]) {
  return {
    object: "list" as const,
    data: models.map((model) => ({
      id: model.id,
      object: "model" as const,
      created: model.created ?? 0,
      owned_by: model.ownedBy ?? model.provider.toLowerCase(),
      ...((model.provider === "OPENAI" || model.provider === "OPENROUTER") &&
      model.shutdownDate !== undefined
        ? { shutdown_date: model.shutdownDate }
        : undefined),
    })),
  };
}

function createAnthropicResponse(
  models: GatewayModelCatalogEntry[],
  pagination: { beforeId?: string; afterId?: string; limit?: number },
) {
  const limit = pagination.limit ?? 20;
  let start = 0;
  let end = models.length;
  if (pagination.afterId) {
    const cursorIndex = models.findIndex(({ id }) => id === pagination.afterId);
    if (cursorIndex < 0)
      throw new GatewayControlPlaneError("Invalid cursor", 400);
    start = cursorIndex + 1;
    end = Math.min(start + limit, models.length);
  } else if (pagination.beforeId) {
    const cursorIndex = models.findIndex(
      ({ id }) => id === pagination.beforeId,
    );
    if (cursorIndex < 0)
      throw new GatewayControlPlaneError("Invalid cursor", 400);
    end = cursorIndex;
    start = Math.max(0, end - limit);
  } else {
    end = Math.min(limit, models.length);
  }
  const page = models.slice(start, end);

  return {
    data: page.map((model) => ({
      type: "model" as const,
      id: model.id,
      display_name: model.displayName ?? model.id,
      created_at: model.createdAt ?? SYNTHETIC_CREATED_AT,
      capabilities: model.provider === "OPENAI" ? null : model.capabilities,
      max_input_tokens:
        model.provider === "OPENAI" ? null : model.maxInputTokens,
      max_tokens: model.provider === "OPENAI" ? null : model.maxTokens,
    })),
    has_more: pagination.beforeId ? start > 0 : end < models.length,
    first_id: page.at(0)?.id ?? null,
    last_id: page.at(-1)?.id ?? null,
  };
}

function compareModels(
  left: GatewayModelCatalogEntry,
  right: GatewayModelCatalogEntry,
) {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}
