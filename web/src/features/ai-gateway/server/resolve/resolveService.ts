import type { GatewayIngestionMode } from "@langfuse/shared/src/db";
import { decrypt } from "@langfuse/shared/encryption";
import { instrumentAsync } from "@langfuse/shared/src/server";

import { env } from "@/src/env.mjs";
import {
  createEs256JwtSigner,
  type Es256JwtSigner,
} from "@/src/server/utils/jwt";

import type { GatewayApiKeyAuthContext } from "@/src/features/ai-gateway/server/auth/gatewayApiKeyAuthenticator";
import { GATEWAY_INGESTION_TOKEN_TTL_SECONDS } from "@/src/features/ai-gateway/server/auth/ingestionTokenVerifier";
import { GatewayControlPlaneError as GatewayResolveError } from "@/src/features/ai-gateway/server/gatewayControlPlaneError";
import {
  type GatewayApiFormat,
  type GatewayProviderId,
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
  async resolve(params: {
    context: GatewayApiKeyAuthContext;
    apiFormat: GatewayApiFormat;
  }) {
    return instrumentAsync({ name: "gateway-resolve" }, async (span) => {
      span.setAttribute(
        "langfuse.organization.id",
        params.context.organizationId,
      );
      const { context } = params;

      if (!context.ingestionProjectId || !context.ingestionMode) {
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
        ingestion_mode: context.ingestionMode.toLowerCase() as "usage" | "full",
        ingestion: this.createIngestionResponse({
          mode: context.ingestionMode,
          organizationId: context.organizationId,
          projectId: context.ingestionProjectId,
        }),
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
          ingestion_mode: params.mode.toLowerCase() as "usage" | "full",
          scope: "gateway-ingest",
        },
      }),
      token_type: "Bearer" as const,
      expires_at:
        Math.floor(Date.now() / 1000) + GATEWAY_INGESTION_TOKEN_TTL_SECONDS,
    };
  }
}
