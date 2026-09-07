import type {
  GatewayInstrumentationMode,
  GatewayProvider,
  PrismaClient,
} from "@langfuse/shared/src/db";
import { decrypt } from "@langfuse/shared/encryption";

import type { Ed25519JwtSigner } from "@/src/server/utils/jwt";

import { GATEWAY_INGESTION_TOKEN_TTL_SECONDS } from "@/src/features/llm-gateway/server/auth/ingestionTokenVerifier";
import { GatewayConfigRepository } from "@/src/features/llm-gateway/server/config/gatewayConfigRepository";
import {
  type GatewayApiFormat,
  gatewayProviders,
  getGatewayProviderDefinition,
  providerSupportsApiFormat,
} from "@/src/features/llm-gateway/server/provider";
import { GatewayProviderRepository } from "@/src/features/llm-gateway/server/provider/gatewayProviderRepository";

export class GatewayResolveError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 403 | 404 | 503,
  ) {
    super(message);
  }
}

type ResolveConfig = {
  jwtSigner?: Ed25519JwtSigner;
};

export class GatewayResolveService {
  private readonly configRepository: GatewayConfigRepository;
  private readonly providerRepository: GatewayProviderRepository;

  constructor(
    prisma: PrismaClient,
    private readonly config: ResolveConfig,
  ) {
    this.configRepository = new GatewayConfigRepository(prisma);
    this.providerRepository = new GatewayProviderRepository(prisma);
  }

  async resolve(params: {
    organizationId: string;
    apiKeyId: string;
    apiFormat: GatewayApiFormat;
  }) {
    const supportedProviders = gatewayProviders.filter((provider) =>
      providerSupportsApiFormat(provider, params.apiFormat),
    ) as GatewayProvider[];
    const [config, connection] = await Promise.all([
      this.configRepository.getConfig(params.organizationId),
      this.providerRepository.selectConnectionWithCredential({
        organizationId: params.organizationId,
        providers: supportedProviders,
      }),
    ]);
    if (
      !config?.defaultIngestionProjectId ||
      !config.defaultIngestionProject ||
      config.defaultIngestionProject.deletedAt ||
      config.defaultIngestionProject.orgId !== params.organizationId
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
      ingestion: this.createIngestionResponse({
        mode: config.instrumentationMode,
        organizationId: params.organizationId,
        projectId: config.defaultIngestionProjectId,
        apiKeyId: params.apiKeyId,
      }),
    };

    return response;
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
