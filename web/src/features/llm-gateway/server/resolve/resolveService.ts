import type {
  GatewayInstrumentationMode,
  GatewayProvider,
  PrismaClient,
} from "@langfuse/shared/src/db";
import { decrypt } from "@langfuse/shared/encryption";

import type { Ed25519JwtSigner } from "@/src/server/utils/jwt";

import { GATEWAY_INGESTION_TOKEN_TTL_SECONDS } from "@/src/features/llm-gateway/server/auth/ingestionTokenVerifier";
import { isGatewayEnabledForOrganization } from "@/src/features/llm-gateway/server/availability";
import { GatewayControlPlaneError as GatewayResolveError } from "@/src/features/llm-gateway/server/gatewayControlPlaneError";
import {
  type GatewayApiFormat,
  gatewayProviders,
  getGatewayProviderDefinition,
  providerSupportsApiFormat,
} from "@/src/features/llm-gateway/server/provider";
import { GatewayResolveRepository } from "./gatewayResolveRepository";

export { GatewayControlPlaneError as GatewayResolveError } from "@/src/features/llm-gateway/server/gatewayControlPlaneError";

type ResolveConfig = {
  jwtSigner?: Ed25519JwtSigner;
};

export class GatewayResolveService {
  private readonly repository: GatewayResolveRepository;

  constructor(
    prisma: PrismaClient,
    private readonly config: ResolveConfig,
  ) {
    this.repository = new GatewayResolveRepository(prisma);
  }

  async resolve(params: {
    fastHashedSecretKey: string;
    apiFormat: GatewayApiFormat;
  }) {
    const supportedProviders = gatewayProviders.filter((provider) =>
      providerSupportsApiFormat(provider, params.apiFormat),
    ) as GatewayProvider[];
    const { organizationId, apiKeyId, keyMetadata, config, connection } =
      await this.getResolveContext({
        fastHashedSecretKey: params.fastHashedSecretKey,
        providers: supportedProviders,
      });
    if (
      !config?.defaultIngestionProjectId ||
      !config.defaultIngestionProject ||
      config.defaultIngestionProject.deletedAt ||
      config.defaultIngestionProject.orgId !== organizationId
    ) {
      throw new GatewayResolveError(
        "Gateway ingestion project is unavailable",
        403,
      );
    }

    if (!connection) {
      throw new GatewayResolveError(
        "No enabled gateway connection supports this API format",
        404,
      );
    }

    const provider = getGatewayProviderDefinition(connection.provider);
    const credential = decrypt(connection.encryptedCredential);
    const response = {
      connection: {
        api_format: params.apiFormat,
        base_url: provider.baseUrl,
        auth:
          provider.authType === "bearer"
            ? ({ type: "Bearer", token: credential } as const)
            : ({
                type: "x-api-key",
                header: "x-api-key",
                value: credential,
              } as const),
      },
      attribution: {
        ...keyMetadata,
        organization_id: organizationId,
        project_id: config.defaultIngestionProjectId,
        key_id: apiKeyId,
      },
      ingestion: this.createIngestionResponse({
        mode: config.instrumentationMode,
        organizationId,
        projectId: config.defaultIngestionProjectId,
        apiKeyId,
      }),
    };

    return response;
  }

  private async getResolveContext(params: {
    fastHashedSecretKey: string;
    providers: GatewayProvider[];
  }) {
    const context = await this.repository.resolveContext(params);
    const organizationId = context?.apiKey.orgId;
    const organization = context?.apiKey.organization;
    if (!context || !organizationId || !organization) {
      throw new GatewayResolveError("Invalid gateway key", 401);
    }
    if (!isGatewayEnabledForOrganization(organizationId)) {
      throw new GatewayResolveError(
        "Gateway is not enabled for this organization",
        403,
      );
    }

    return {
      organizationId,
      apiKeyId: context.apiKeyId,
      keyMetadata: toKeyMetadata(context.metadata),
      config: organization.gatewayConfig,
      connection: organization.gatewayAiConnections[0],
    };
  }

  private createIngestionResponse(params: {
    mode: GatewayInstrumentationMode;
    organizationId: string;
    projectId: string;
    apiKeyId: string;
  }) {
    if (params.mode === "NONE") return undefined;
    if (!this.config.jwtSigner) {
      throw new GatewayResolveError(
        "Gateway ingestion signing is not configured",
        503,
      );
    }
    return {
      access_token: this.config.jwtSigner.sign({
        expiresInSeconds: GATEWAY_INGESTION_TOKEN_TTL_SECONDS,
        claims: {
          version: 1,
          organizationId: params.organizationId,
          projectId: params.projectId,
          keyId: params.apiKeyId,
          instrumentation_mode: params.mode.toLowerCase() as "usage" | "full",
          scope: "gateway-ingest",
        },
      }),
      token_type: "Bearer" as const,
      expires_in: GATEWAY_INGESTION_TOKEN_TTL_SECONDS,
    };
  }
}

// The column is JSON, so a key written before validation existed can hold a
// scalar or an array. Only an object shape can be attributed per event.
function toKeyMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
