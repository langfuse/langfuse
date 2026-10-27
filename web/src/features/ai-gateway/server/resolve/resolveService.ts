import type { GatewayIngestionMode } from "@langfuse/shared/src/db";
import { decrypt } from "@langfuse/shared/encryption";
import { instrumentAsync } from "@langfuse/shared/src/server";

import { env } from "@/src/env.mjs";
import {
  createEs256JwtSigner,
  type Es256JwtSigner,
} from "@/src/server/utils/jwt";

import type { GatewayApiKeyAuthContext } from "@/src/features/ai-gateway/server/auth/gatewayApiKeyAuthenticator";
import { resolveGatewayJwtKeys } from "@/src/features/ai-gateway/server/auth/gatewayJwtKeys";
import { GATEWAY_INGESTION_TOKEN_TTL_SECONDS } from "@/src/features/ai-gateway/server/auth/ingestionTokenVerifier";
import { GatewayControlPlaneError as GatewayResolveError } from "@/src/features/ai-gateway/server/gatewayControlPlaneError";
import {
  type GatewayApiFormat,
  type GatewayProviderId,
  type GatewayResolveResponse,
  getGatewayProviderDefinition,
} from "@/src/features/ai-gateway/server/provider";

export { GatewayControlPlaneError as GatewayResolveError } from "@/src/features/ai-gateway/server/gatewayControlPlaneError";

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
  const { privateKey, keyId } = resolveGatewayJwtKeys({
    privateKey: env.LANGFUSE_AI_GATEWAY_JWT_PRIVATE_KEY,
    publicKey: env.LANGFUSE_AI_GATEWAY_JWT_PUBLIC_KEY,
    keyId: env.LANGFUSE_AI_GATEWAY_JWT_KEY_ID,
  });
  if (!privateKey || !keyId) return undefined;

  const config = {
    privateKey,
    keyId,
    issuer: env.LANGFUSE_AI_GATEWAY_JWT_ISSUER,
    audience: env.LANGFUSE_AI_GATEWAY_JWT_AUDIENCE,
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
  async resolve(params: {
    context: GatewayApiKeyAuthContext;
    apiFormat: GatewayApiFormat;
  }): Promise<GatewayResolveResponse> {
    return instrumentAsync({ name: "gateway-resolve" }, async (span) => {
      span.setAttribute(
        "langfuse.organization.id",
        params.context.organizationId,
      );
      const { context } = params;
      const { ingestionMode, ingestionProjectId } = context;
      // NONE mode delivers nothing to Langfuse, so it needs neither an
      // ingestion project nor ingestion signing keys.
      const deliversToLangfuse = ingestionMode !== "NONE";

      if (!ingestionMode || (deliversToLangfuse && !ingestionProjectId)) {
        throw new GatewayResolveError(
          "Gateway ingestion project is unavailable",
          403,
        );
      }
      if (!context.connection || !context.providerModel) {
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
          name: context.connection.name,
          provider:
            context.connection.provider.toLowerCase() as GatewayProviderId,
          provider_model: context.providerModel,
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
          project_id: ingestionProjectId,
          key_id: context.apiKeyId,
          user_id: context.userId,
          key_name: context.apiKeyName,
          user_name: context.userName,
          key_metadata: context.keyMetadata,
          provider_connection_id: context.connection.id,
        },
        ingestion_mode:
          ingestionMode.toLowerCase() as GatewayResolveResponse["ingestion_mode"],
        ingestion:
          deliversToLangfuse && ingestionProjectId
            ? this.createIngestionResponse({
                mode: ingestionMode,
                organizationId: context.organizationId,
                projectId: ingestionProjectId,
              })
            : null,
      };
    });
  }

  private createIngestionResponse(params: {
    mode: GatewayIngestionMode;
    organizationId: string;
    projectId: string;
  }) {
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
          ingestion_mode:
            params.mode.toLowerCase() as GatewayResolveResponse["ingestion_mode"],
          scope: "gateway-ingest",
        },
      }),
      token_type: "Bearer" as const,
      expires_at:
        Math.floor(Date.now() / 1000) + GATEWAY_INGESTION_TOKEN_TTL_SECONDS,
    };
  }
}
