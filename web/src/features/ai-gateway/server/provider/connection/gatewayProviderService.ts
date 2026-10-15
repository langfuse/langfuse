import {
  Prisma,
  type GatewayConnectionStatus,
  type GatewayProvider,
  type PrismaClient,
} from "@langfuse/shared/src/db";
import {
  InvalidRequestError,
  LangfuseConflictError,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { encrypt } from "@langfuse/shared/encryption";
import { LLMAdapter, testModelCall } from "@langfuse/shared/src/server";
import { getDisplaySecretKey } from "@langfuse/shared/src/server/auth/apiKeys";

import { auditLog } from "@/src/features/audit-logs/server";
import { DUPLICATE_GATEWAY_CONNECTION_NAME_ERROR } from "@/src/features/ai-gateway/constants/gatewayConnection";
import type { OrgAuthedContext } from "@/src/server/api/trpc";
import {
  type GatewayProviderName,
  getGatewayProviderDefinition,
} from "@/src/features/ai-gateway/server/provider/registry";
import { invalidateGatewayResolveCacheForOrganization } from "@/src/features/ai-gateway/server/resolve/gatewayResolveCache";
import { GatewayProviderRepository } from "./gatewayProviderRepository";
import { GatewayModelCatalogService } from "../models/gatewayModelCatalogService";

export class GatewayProviderService {
  private readonly repository: GatewayProviderRepository;
  private readonly modelCatalogService: GatewayModelCatalogService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly validateCredential: CredentialValidator = validateGatewayCredential,
    modelCatalogService?: GatewayModelCatalogService,
  ) {
    this.repository = new GatewayProviderRepository(prisma);
    this.modelCatalogService =
      modelCatalogService ?? new GatewayModelCatalogService(prisma);
  }

  list(params: { organizationId: string; cursor?: string; limit: number }) {
    return this.repository.listConnections(params);
  }

  async get(params: { organizationId: string; id: string }) {
    const connection = await this.repository.getSafeConnection(params);
    if (!connection) throw new LangfuseNotFoundError("Gateway connection");
    return connection;
  }

  async listAll(organizationId: string, status?: GatewayConnectionStatus) {
    const connections = [];
    let cursor: string | undefined;
    do {
      const page = await this.repository.listConnections({
        organizationId,
        cursor,
        limit: 100,
        status,
      });
      connections.push(...page.data);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return connections;
  }

  testCredential(params: { provider: GatewayProvider; credential: string }) {
    return this.validateCredential(params);
  }

  async create(params: {
    organizationId: string;
    name: string;
    provider: GatewayProvider;
    credential: string;
    session: OrgAuthedContext["session"];
  }) {
    await this.testCredential({
      provider: params.provider,
      credential: params.credential,
    });
    let connection;
    try {
      connection = await this.repository.createConnection({
        organizationId: params.organizationId,
        name: params.name,
        provider: params.provider,
        encryptedCredential: encrypt(params.credential),
        displaySecret: getDisplaySecretKey(params.credential),
        createdById: params.session.user.id,
        status: "ENABLED",
      });
    } catch (error) {
      rethrowConnectionMutationError(error);
    }
    await invalidateGatewayResolveCacheForOrganization(params.organizationId);
    await auditLog(
      {
        session: params.session,
        resourceType: "gatewayAiConnection",
        resourceId: connection.id,
        action: "create",
        after: connection,
      },
      this.prisma,
    );
    return connection;
  }

  async update(params: {
    organizationId: string;
    id: string;
    name?: string;
    credential?: string;
    status?: GatewayConnectionStatus;
    session: OrgAuthedContext["session"];
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
      await this.testCredential({
        provider: existing.provider,
        credential: params.credential,
      });
    }

    let updated;
    try {
      updated = await this.repository.updateConnection({
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
    } catch (error) {
      rethrowConnectionMutationError(error);
    }
    await this.modelCatalogService.clearModelCache(
      params.organizationId,
      params.id,
    );
    await invalidateGatewayResolveCacheForOrganization(params.organizationId);
    await auditLog(
      {
        session: params.session,
        resourceType: "gatewayAiConnection",
        resourceId: params.id,
        action: "update",
        before: existing,
        after: updated,
      },
      this.prisma,
    );
    return updated;
  }

  async delete(params: {
    organizationId: string;
    id: string;
    session: OrgAuthedContext["session"];
  }) {
    // Only the two identifiers, never the whole params object: the extra
    // `session` field would land in the Prisma `where` and fail validation.
    const deleted = await this.repository.deleteConnection({
      organizationId: params.organizationId,
      id: params.id,
    });
    await this.modelCatalogService.clearModelCache(
      params.organizationId,
      params.id,
    );
    await invalidateGatewayResolveCacheForOrganization(params.organizationId);
    await auditLog(
      {
        session: params.session,
        resourceType: "gatewayAiConnection",
        resourceId: params.id,
        action: "delete",
        before: deleted,
      },
      this.prisma,
    );
    return deleted;
  }

  async updateAllowedModels(params: {
    organizationId: string;
    id: string;
    allowedModels: string[] | null;
    expectedUpdatedAt: Date;
    session: OrgAuthedContext["session"];
  }) {
    const existing = await this.get({
      organizationId: params.organizationId,
      id: params.id,
    });
    const updated = await this.repository.updateAllowedModels({
      organizationId: params.organizationId,
      id: params.id,
      expectedUpdatedAt: params.expectedUpdatedAt,
      allowedModels:
        params.allowedModels === null
          ? null
          : [...new Set(params.allowedModels)],
    });
    if (!updated) {
      throw new LangfuseConflictError(
        "Model access changed while this page was open. Reload and try again.",
      );
    }
    await invalidateGatewayResolveCacheForOrganization(params.organizationId);
    await auditLog(
      {
        session: params.session,
        resourceType: "gatewayAiConnection",
        resourceId: params.id,
        action: "update",
        before: existing,
        after: updated,
      },
      this.prisma,
    );
    return updated;
  }
}

function rethrowConnectionMutationError(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw new InvalidRequestError(DUPLICATE_GATEWAY_CONNECTION_NAME_ERROR);
  }
  throw error;
}

async function validateGatewayCredential(params: {
  provider: GatewayProviderName;
  credential: string;
}): Promise<void> {
  const definition = getGatewayProviderDefinition(params.provider);
  const adapter =
    params.provider === "ANTHROPIC" ? LLMAdapter.Anthropic : LLMAdapter.OpenAI;
  const model = definition.validationModel;

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

type CredentialValidator = (params: {
  provider: GatewayProviderName;
  credential: string;
}) => Promise<void>;
