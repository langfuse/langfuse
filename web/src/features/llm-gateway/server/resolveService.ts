import type {
  GatewayInstrumentationMode,
  GatewayProvider,
  PrismaClient,
} from "@langfuse/shared/src/db";
import { decrypt } from "@langfuse/shared/encryption";
import { createShaHash } from "@langfuse/shared/src/server/auth/apiKeys";

import {
  issueGatewayIngestionToken,
  verifyGatewayHmacAuthorization,
} from "./auth";
import {
  type GatewayApiFormat,
  gatewayProviders,
  getGatewayProviderDefinition,
  providerSupportsApiFormat,
} from "./providerRegistry";
import { GatewayRepository } from "./repository";

export class GatewayResolveError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 403 | 404 | 503,
  ) {
    super(message);
  }
}

type ResolveConfig = {
  salt: string;
  serviceKeys: Array<{ id: string; secret: string }>;
  jwt?: {
    privateKey: string;
    keyId: string;
    issuer: string;
    audience: string;
  };
};

export class GatewayResolveService {
  private readonly repository: GatewayRepository;

  constructor(
    prisma: PrismaClient,
    private readonly config: ResolveConfig,
  ) {
    this.repository = new GatewayRepository(prisma);
  }

  async resolve(params: {
    virtualSecretKey: string;
    apiFormat: GatewayApiFormat;
    gatewayAuthorization: string | undefined;
  }) {
    if (
      !verifyGatewayHmacAuthorization({
        header: params.gatewayAuthorization,
        virtualSecretKey: params.virtualSecretKey,
        apiFormat: params.apiFormat,
        keys: this.config.serviceKeys,
      })
    ) {
      throw new GatewayResolveError("Invalid gateway authorization", 401);
    }

    const association = await this.repository.resolveGatewayContext({
      fastHashedSecretKey: createShaHash(
        params.virtualSecretKey,
        this.config.salt,
      ),
    });
    const organizationId = association?.apiKey.orgId;
    if (!association || !organizationId) {
      throw new GatewayResolveError("Invalid gateway key", 401);
    }

    const supportedProviders = gatewayProviders.filter((provider) =>
      providerSupportsApiFormat(provider, params.apiFormat),
    ) as GatewayProvider[];
    const [config, connection] = await Promise.all([
      this.repository.getConfig(organizationId),
      this.repository.selectConnectionWithCredential({
        organizationId,
        providers: supportedProviders,
      }),
    ]);
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
      ingestion: this.createIngestionResponse({
        mode: config.instrumentationMode,
        organizationId,
        projectId: config.defaultIngestionProjectId,
        apiKeyId: association.apiKeyId,
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
    if (!this.config.jwt) {
      throw new GatewayResolveError(
        "Gateway ingestion signing is not configured",
        503,
      );
    }
    return {
      access_token: issueGatewayIngestionToken({
        ...this.config.jwt,
        claims: {
          organizationId: params.organizationId,
          projectId: params.projectId,
          keyId: params.apiKeyId,
          instrumentation_mode: params.mode.toLowerCase() as "usage" | "full",
        },
      }),
      token_type: "Bearer" as const,
      expires_in: 15 * 60,
    };
  }
}
