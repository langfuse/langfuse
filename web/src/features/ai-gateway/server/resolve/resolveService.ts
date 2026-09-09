import type {
  GatewayInstrumentationMode,
  GatewayProvider,
  PrismaClient,
} from "@langfuse/shared/src/db";
import { decrypt } from "@langfuse/shared/encryption";
import { instrumentAsync, recordIncrement } from "@langfuse/shared/src/server";

import { env } from "@/src/env.mjs";
import {
  createEs256JwtSigner,
  type Es256JwtSigner,
} from "@/src/server/utils/jwt";

import { GATEWAY_INGESTION_TOKEN_TTL_SECONDS } from "@/src/features/ai-gateway/server/auth/ingestionTokenVerifier";
import { isGatewayEnabledForOrganization } from "@/src/features/ai-gateway/server/availability";
import { GatewayControlPlaneError as GatewayResolveError } from "@/src/features/ai-gateway/server/gatewayControlPlaneError";
import {
  type GatewayApiFormat,
  type GatewayMetadata,
  type GatewayProviderId,
  GatewayMetadataSchema,
  gatewayProviders,
  getGatewayProviderDefinition,
  providerSupportsApiFormat,
} from "@/src/features/ai-gateway/server/provider";
import {
  type CachedResolveContext,
  GATEWAY_RESOLVE_KEY_NON_EXISTENT,
  GatewayResolveCache,
} from "./gatewayResolveCache";
import { GatewayResolveRepository } from "./gatewayResolveRepository";

export { GatewayControlPlaneError as GatewayResolveError } from "@/src/features/ai-gateway/server/gatewayControlPlaneError";

type ResolveConfig = {
  cache?: GatewayResolveCache;
};

let cachedGatewayIngestionTokenSigner:
  | {
      privateKey: string;
      keyId: string;
      issuer: string;
      audience: string;
      signer: Es256JwtSigner;
    }
  | undefined;

function getGatewayIngestionTokenSigner() {
  const privateKey = env.LANGFUSE_GATEWAY_JWT_PRIVATE_KEY;
  if (!privateKey) return undefined;

  const publicKey = env.LANGFUSE_GATEWAY_JWT_PUBLIC_KEY;
  const keyId = env.LANGFUSE_GATEWAY_JWT_KEY_ID;
  if (!publicKey || !keyId) {
    throw new Error(
      "LANGFUSE_GATEWAY_JWT_PRIVATE_KEY, LANGFUSE_GATEWAY_JWT_PUBLIC_KEY, and LANGFUSE_GATEWAY_JWT_KEY_ID must be set together",
    );
  }

  const config = {
    privateKey,
    keyId,
    issuer: env.LANGFUSE_GATEWAY_JWT_ISSUER,
    audience: env.LANGFUSE_GATEWAY_JWT_AUDIENCE,
  };
  if (
    !cachedGatewayIngestionTokenSigner ||
    cachedGatewayIngestionTokenSigner.privateKey !== config.privateKey ||
    cachedGatewayIngestionTokenSigner.keyId !== config.keyId ||
    cachedGatewayIngestionTokenSigner.issuer !== config.issuer ||
    cachedGatewayIngestionTokenSigner.audience !== config.audience
  ) {
    cachedGatewayIngestionTokenSigner = {
      ...config,
      signer: createEs256JwtSigner(config),
    };
  }
  return cachedGatewayIngestionTokenSigner.signer;
}

export class GatewayResolveService {
  private readonly repository: GatewayResolveRepository;
  private readonly cache: GatewayResolveCache;

  constructor(
    prisma: PrismaClient,
    private readonly config: ResolveConfig = {},
  ) {
    this.repository = new GatewayResolveRepository(prisma);
    this.cache = config.cache ?? new GatewayResolveCache();
  }

  async resolve(params: {
    fastHashedSecretKey: string;
    apiFormat: GatewayApiFormat;
  }) {
    return instrumentAsync({ name: "gateway-resolve" }, async (span) => {
      const context = await this.getResolveContext(params);
      span.setAttribute("langfuse.organization.id", context.organizationId);

      if (!context.ingestionProjectId || !context.instrumentationMode) {
        throw new GatewayResolveError(
          "Gateway ingestion project is unavailable",
          403,
        );
      }
      if (!context.connection) {
        throw new GatewayResolveError(
          "No enabled gateway connection supports this API format",
          404,
        );
      }

      const provider = getGatewayProviderDefinition(
        context.connection.provider,
      );
      const credential = decrypt(context.connection.encryptedCredential);
      return {
        version: 1 as const,
        connection: {
          id: context.connection.id,
          provider:
            context.connection.provider.toLowerCase() as GatewayProviderId,
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
          organization_id: context.organizationId,
          project_id: context.ingestionProjectId,
          key_id: context.apiKeyId,
          key_metadata: context.keyMetadata,
        },
        instrumentation_mode: context.instrumentationMode.toLowerCase() as
          | "usage"
          | "full"
          | "none",
        ingestion: this.createIngestionResponse({
          mode: context.instrumentationMode,
          organizationId: context.organizationId,
          projectId: context.ingestionProjectId,
        }),
      };
    });
  }

  private async getResolveContext(params: {
    fastHashedSecretKey: string;
    apiFormat: GatewayApiFormat;
  }): Promise<CachedResolveContext> {
    const cached = await this.cache.get(params);
    if (cached === GATEWAY_RESOLVE_KEY_NON_EXISTENT) {
      throw new GatewayResolveError("Invalid gateway key", 401);
    }
    const context = cached ?? (await this.loadAndCacheResolveContext(params));

    // Re-checked on every request, cache hits included: an organization losing
    // gateway access must take effect without waiting for the TTL.
    if (!isGatewayEnabledForOrganization(context.organizationId)) {
      throw new GatewayResolveError(
        "Gateway is not enabled for this organization",
        403,
      );
    }
    return context;
  }

  private async loadAndCacheResolveContext(params: {
    fastHashedSecretKey: string;
    apiFormat: GatewayApiFormat;
  }): Promise<CachedResolveContext> {
    const supportedProviders = gatewayProviders.filter((provider) =>
      providerSupportsApiFormat(provider, params.apiFormat),
    ) as GatewayProvider[];

    // This endpoint sits in front of every LLM call, so a slow or saturated
    // database has to be shed as a retryable 503 rather than held open until
    // the connection pool times out.
    const row = await withTimeout(
      this.repository.resolveContext({
        fastHashedSecretKey: params.fastHashedSecretKey,
        providers: supportedProviders,
      }),
      env.LANGFUSE_GATEWAY_RESOLVE_TIMEOUT_MS,
    );

    const organizationId = row?.apiKey.orgId;
    const organization = row?.apiKey.organization;
    if (!row || !organizationId || !organization) {
      await this.cache.set({
        ...params,
        context: GATEWAY_RESOLVE_KEY_NON_EXISTENT,
      });
      throw new GatewayResolveError("Invalid gateway key", 401);
    }

    const gatewayConfig = organization.gatewayConfig;
    const project = gatewayConfig?.defaultIngestionProject;
    const projectIsUsable =
      Boolean(project) &&
      !project?.deletedAt &&
      project?.orgId === organizationId;
    const connection = organization.gatewayAiConnections[0];

    const context: CachedResolveContext = {
      organizationId,
      apiKeyId: row.apiKeyId,
      keyMetadata: toKeyMetadata(row.metadata),
      ingestionProjectId: projectIsUsable
        ? (gatewayConfig?.defaultIngestionProjectId ?? null)
        : null,
      instrumentationMode: gatewayConfig?.instrumentationMode ?? null,
      connection: connection
        ? {
            id: connection.id,
            provider: connection.provider,
            encryptedCredential: connection.encryptedCredential,
          }
        : null,
    };

    await this.cache.set({ ...params, context });
    return context;
  }

  private createIngestionResponse(params: {
    mode: GatewayInstrumentationMode;
    organizationId: string;
    projectId: string;
  }) {
    if (params.mode === "NONE") return undefined;
    const signer = getGatewayIngestionTokenSigner();
    if (!signer) {
      throw new GatewayResolveError(
        "Gateway ingestion signing is not configured",
        503,
      );
    }
    return {
      access_token: signer.sign({
        expiresInSeconds: GATEWAY_INGESTION_TOKEN_TTL_SECONDS,
        claims: {
          version: 1,
          organization_id: params.organizationId,
          project_id: params.projectId,
          instrumentation_mode: params.mode.toLowerCase() as "usage" | "full",
          scope: "gateway-ingest",
        },
      }),
      token_type: "Bearer" as const,
      expires_at:
        Math.floor(Date.now() / 1000) + GATEWAY_INGESTION_TOKEN_TTL_SECONDS,
    };
  }
}

// The column is JSON, so a key written before validation existed can hold a
// scalar, an array, or nested objects. Only a flat object of scalars can be
// attributed per event.
function toKeyMetadata(value: unknown): GatewayMetadata {
  const parsed = GatewayMetadataSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          recordIncrement("langfuse.gateway.resolve.timeout", 1);
          reject(
            new GatewayResolveError("Gateway is temporarily unavailable", 503),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
