import type {
  GatewayConnectionStatus,
  GatewayProvider,
  PrismaClient,
} from "@langfuse/shared/src/db";
import { InvalidRequestError, LangfuseNotFoundError } from "@langfuse/shared";
import { decrypt, encrypt } from "@langfuse/shared/encryption";
import { LLMAdapter, testModelCall } from "@langfuse/shared/src/server";
import { getDisplaySecretKey } from "@langfuse/shared/src/server/auth/apiKeys";

import {
  type GatewayProviderName,
  getGatewayProviderDefinition,
} from "./providerRegistry";
import { GatewayRepository } from "./repository";

type ModelRefreshResult =
  | { connectionId: string; success: true; models: string[] }
  | {
      connectionId: string;
      success: false;
      error: "unauthorized" | "rate_limited" | "provider_error" | "timeout";
    };

type CredentialValidator = (params: {
  provider: GatewayProviderName;
  credential: string;
}) => Promise<void>;

export class GatewayProviderService {
  private readonly repository: GatewayRepository;

  constructor(
    prisma: PrismaClient,
    private readonly fetcher: typeof fetch = fetch,
    private readonly validateCredential: CredentialValidator = validateGatewayCredential,
  ) {
    this.repository = new GatewayRepository(prisma);
  }

  list(organizationId: string) {
    return this.repository.listConnections(organizationId);
  }

  async create(params: {
    organizationId: string;
    name: string;
    provider: GatewayProvider;
    credential: string;
    createdById: string | null;
  }) {
    await this.validateCredential({
      provider: params.provider,
      credential: params.credential,
    });
    return this.repository.createConnection({
      organizationId: params.organizationId,
      name: params.name,
      provider: params.provider,
      encryptedCredential: encrypt(params.credential),
      displaySecret: getDisplaySecretKey(params.credential),
      createdById: params.createdById,
      status: "ENABLED",
    });
  }

  async update(params: {
    organizationId: string;
    id: string;
    name?: string;
    credential?: string;
    status?: GatewayConnectionStatus;
  }) {
    const existing = await this.repository.getSafeConnection({
      organizationId: params.organizationId,
      id: params.id,
    });
    if (!existing) throw new LangfuseNotFoundError("Gateway connection");
    if (
      existing.status === "ERROR" &&
      params.status === "ENABLED" &&
      !params.credential
    ) {
      throw new InvalidRequestError(
        "Errored gateway connections require a credential update or successful retry",
      );
    }
    if (params.credential) {
      await this.validateCredential({
        provider: existing.provider,
        credential: params.credential,
      });
    }

    return this.repository.updateConnection({
      organizationId: params.organizationId,
      id: params.id,
      name: params.name,
      status: params.credential ? "ENABLED" : params.status,
      encryptedCredential: params.credential
        ? encrypt(params.credential)
        : undefined,
      displaySecret: params.credential
        ? getDisplaySecretKey(params.credential)
        : undefined,
    });
  }

  async delete(params: { organizationId: string; id: string }) {
    const deleted = await this.repository.deleteConnection(params);
    const remaining = await this.repository.listConnections(
      params.organizationId,
    );
    await this.repository.reorderConnections({
      organizationId: params.organizationId,
      connectionIds: remaining.map((connection) => connection.id),
    });
    return deleted;
  }

  async reorder(params: {
    organizationId: string;
    connectionIds: string[];
  }): Promise<void> {
    const existing = await this.repository.listConnections(
      params.organizationId,
    );
    const existingIds = new Set(existing.map((connection) => connection.id));
    const requestedIds = new Set(params.connectionIds);
    if (
      requestedIds.size !== params.connectionIds.length ||
      requestedIds.size !== existingIds.size ||
      params.connectionIds.some((id) => !existingIds.has(id))
    ) {
      throw new InvalidRequestError(
        "Reorder must contain every organization gateway connection exactly once",
      );
    }
    await this.repository.reorderConnections(params);
  }

  async refreshAllModels(
    organizationId: string,
  ): Promise<ModelRefreshResult[]> {
    const connections = await this.repository.listConnections(organizationId);
    return Promise.all(
      connections
        .filter((connection) => connection.status === "ENABLED")
        .map((connection) =>
          this.refreshModels({
            organizationId,
            connectionId: connection.id,
            explicitRetry: false,
          }),
        ),
    );
  }

  async refreshModels(params: {
    organizationId: string;
    connectionId: string;
    explicitRetry: boolean;
  }): Promise<ModelRefreshResult> {
    const connection = await this.repository.getConnectionWithCredential({
      organizationId: params.organizationId,
      id: params.connectionId,
    });
    if (!connection) throw new LangfuseNotFoundError("Gateway connection");

    const definition = getGatewayProviderDefinition(
      connection.provider as GatewayProviderName,
    );
    const credential = decrypt(connection.encryptedCredential);
    let response: Response;
    try {
      response = await this.fetcher(
        `${definition.baseUrl}${definition.modelsPath}`,
        {
          method: "GET",
          headers:
            definition.authType === "bearer"
              ? { Authorization: `Bearer ${credential}` }
              : {
                  "x-api-key": credential,
                  "anthropic-version": "2023-06-01",
                },
          signal: AbortSignal.timeout(10_000),
          redirect: "error",
        },
      );
    } catch {
      return {
        connectionId: connection.id,
        success: false,
        error: "timeout",
      };
    }

    if (response.status === 401 || response.status === 403) {
      await this.repository.updateConnectionStatus({
        organizationId: params.organizationId,
        id: connection.id,
        status: "ERROR",
      });
      return {
        connectionId: connection.id,
        success: false,
        error: "unauthorized",
      };
    }
    if (response.status === 429) {
      return {
        connectionId: connection.id,
        success: false,
        error: "rate_limited",
      };
    }
    if (!response.ok) {
      return {
        connectionId: connection.id,
        success: false,
        error: "provider_error",
      };
    }

    const parsed = await response.json().catch(() => null);
    const models = extractModelIds(parsed);
    if (params.explicitRetry && connection.status === "ERROR") {
      await this.repository.updateConnectionStatus({
        organizationId: params.organizationId,
        id: connection.id,
        status: "ENABLED",
      });
    }
    return { connectionId: connection.id, success: true, models };
  }
}

async function validateGatewayCredential(params: {
  provider: GatewayProviderName;
  credential: string;
}): Promise<void> {
  const definition = getGatewayProviderDefinition(params.provider);
  const adapter =
    params.provider === "ANTHROPIC" ? LLMAdapter.Anthropic : LLMAdapter.OpenAI;
  const model = {
    OPENAI: "gpt-4o-mini",
    ANTHROPIC: "claude-3-5-haiku-latest",
    OPENROUTER: "openai/gpt-4o-mini",
  }[params.provider];

  try {
    await testModelCall({
      provider: params.provider.toLowerCase(),
      model,
      apiKey: {
        id: "gateway-credential-validation",
        projectId: "gateway-credential-validation",
        createdAt: new Date(0),
        updatedAt: new Date(0),
        adapter,
        provider: params.provider.toLowerCase(),
        displaySecretKey: "",
        secretKey: encrypt(params.credential),
        extraHeaders: null,
        extraHeaderKeys: [],
        baseURL: definition.baseUrl,
        customModels: [],
        withDefaultModels: true,
        config: null,
      },
      timeout: 10_000,
    });
  } catch {
    throw new InvalidRequestError("Provider credential validation failed");
  }
}

function extractModelIds(value: unknown): string[] {
  if (
    !value ||
    typeof value !== "object" ||
    !("data" in value) ||
    !Array.isArray(value.data)
  ) {
    return [];
  }
  return value.data
    .map((model) =>
      model && typeof model === "object" && "id" in model
        ? model.id
        : undefined,
    )
    .filter((id): id is string => typeof id === "string")
    .toSorted();
}
