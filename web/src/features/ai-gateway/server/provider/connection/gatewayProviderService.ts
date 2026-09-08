import type {
  GatewayConnectionStatus,
  GatewayProvider,
  PrismaClient,
} from "@langfuse/shared/src/db";
import { InvalidRequestError, LangfuseNotFoundError } from "@langfuse/shared";
import { encrypt } from "@langfuse/shared/encryption";
import { LLMAdapter, testModelCall } from "@langfuse/shared/src/server";
import { getDisplaySecretKey } from "@langfuse/shared/src/server/auth/apiKeys";

import { auditLog } from "@/src/features/audit-logs/server";
import type { OrgAuthedContext } from "@/src/server/api/trpc";
import {
  type GatewayProviderName,
  getGatewayProviderDefinition,
} from "@/src/features/ai-gateway/server/provider/registry";
import { invalidateGatewayResolveCacheForOrganization } from "@/src/features/ai-gateway/server/resolve/gatewayResolveCache";
import { GatewayProviderRepository } from "./gatewayProviderRepository";
import { GatewayModelCatalogService } from "../models/gatewayModelCatalogService";

type CredentialValidator = (params: {
  provider: GatewayProviderName;
  credential: string;
}) => Promise<void>;

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

  async create(params: {
    organizationId: string;
    name: string;
    provider: GatewayProvider;
    credential: string;
    session: OrgAuthedContext["session"];
  }) {
    await this.validateCredential({
      provider: params.provider,
      credential: params.credential,
    });
    const connection = await this.repository.createConnection({
      organizationId: params.organizationId,
      name: params.name,
      provider: params.provider,
      encryptedCredential: encrypt(params.credential),
      displaySecret: getDisplaySecretKey(params.credential),
      createdById: params.session.user.id,
      status: "ENABLED",
    });
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
      await this.validateCredential({
        provider: existing.provider,
        credential: params.credential,
      });
    }

    const updated = await this.repository.updateConnection({
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

  async reorder(params: {
    organizationId: string;
    connectionIds: string[];
    session: OrgAuthedContext["session"];
  }) {
    const existing = await this.listAll(params.organizationId);
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
    await this.repository.reorderConnections({
      organizationId: params.organizationId,
      connectionIds: params.connectionIds,
    });
    const reordered = await this.listAll(params.organizationId);
    await invalidateGatewayResolveCacheForOrganization(params.organizationId);
    await auditLog(
      {
        session: params.session,
        resourceType: "gatewayAiConnection",
        resourceId: params.organizationId,
        action: "reorder",
        before: existing,
        after: reordered,
      },
      this.prisma,
    );
    return reordered;
  }
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
